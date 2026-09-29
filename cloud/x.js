// X (Twitter): video posts with OAuth 2.0 (PKCE). Not free: X charges per request from prepaid credits.
const st = require('./state');
const oauth = require('./oauth');

const API = 'https://api.x.com';
const SCOPES = 'tweet.read tweet.write users.read media.write offline.access';

async function basic() { const s = await st.settings(); return 'Basic ' + Buffer.from(`${s.x_client_id}:${s.x_client_secret}`).toString('base64'); }

async function authUrl(pid, base) {
  const s = await st.settings();
  if (!s.x_client_id || !s.x_client_secret) throw new Error('Save the X Client ID and secret first (Settings, App keys, X).');
  if (!await st.profile(pid)) throw new Error('Profile not found.');
  const { verifier, challenge } = oauth.pkce();
  const state = await oauth.begin('x', pid, base, { verifier });
  return 'https://x.com/i/oauth2/authorize?' + new URLSearchParams({ response_type: 'code', client_id: s.x_client_id, redirect_uri: oauth.callback(base), scope: SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256' });
}
async function tokenCall(params) {
  const r = await fetch(`${API}/2/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: await basic() }, body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('X sign-in: ' + (j.error_description || j.error || r.status));
  return j;
}
async function exchange(rec, code) {
  const s = await st.settings();
  const j = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: oauth.callback(rec.base), code_verifier: rec.verifier, client_id: s.x_client_id });
  const me = await fetch(`${API}/2/users/me`, { headers: { Authorization: 'Bearer ' + j.access_token } }).then(x => x.json()).catch(() => ({}));
  await st.setAccount(rec.pid, 'x', { access: j.access_token, refresh: j.refresh_token, expires_at: Date.now() + (j.expires_in || 7200) * 1000 - 60000, username: me.data?.username || '', name: me.data?.name || '', problem: '' }, true);
  return me.data?.username ? '@' + me.data.username : 'X';
}
async function token(pid) {
  const x = await st.account(pid, 'x');
  if (x.access && x.expires_at > Date.now()) return x.access;
  if (!x.refresh) throw new Error('X is not connected for this profile.');
  let j;
  try { j = await tokenCall({ grant_type: 'refresh_token', refresh_token: x.refresh, client_id: (await st.settings()).x_client_id }); }
  catch (e) { const msg = `The X login stopped working. Press Connect for X again. (${e.message})`; await st.setAccount(pid, 'x', { problem: msg }); throw new Error(msg); }
  await st.setAccount(pid, 'x', { access: j.access_token, refresh: j.refresh_token || x.refresh, expires_at: Date.now() + (j.expires_in || 7200) * 1000 - 60000, problem: '' });
  return j.access_token;
}
async function disconnect(pid) { await st.setAccount(pid, 'x', {}, true); }
async function check(pid) {
  const r = await fetch(`${API}/2/users/me`, { headers: { Authorization: 'Bearer ' + await token(pid) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(xError(r.status, j, 'check failed'));
  return `X works for @${j.data?.username}.`;
}

function xError(status, j, what) {
  const d = j?.detail || j?.title || j?.errors?.[0]?.message || JSON.stringify(j || {}).slice(0, 200);
  if (status === 402 || /credit|payment|CreditsDepleted/i.test(d)) return 'X needs API credits for this. Add credits in the X Developer Console (about US$0.02 per video post).';
  if (status === 401) return 'The X login expired. Press Connect for X again.';
  if (status === 403) return `X refused (${d}). Check that the app has Read and Write permission, then connect again.`;
  if (status === 429) return 'X posting limit reached for now. Press Retry later.';
  return `X ${what}: ${d}`;
}
async function tweetText(job) {
  const lim = Number((await st.settings()).x_post_limit) || 280;
  const tags = (job.hashtags || []).slice(0, 4).join(' ');
  let t = String(job.title || '').trim();
  const room = lim - (tags ? tags.length + 2 : 0);
  if (t.length > room) t = t.slice(0, Math.max(0, room - 1)).trimEnd() + '…';
  return (tags ? `${t}\n\n${tags}` : t).slice(0, lim);
}

// Steps: 1 upload in 4 MB pieces and finish, 2 wait for processing, 3 post.
async function post(ctx) {
  const { profile, job, state, readVideo, timeLeft } = ctx;
  const H = { Authorization: 'Bearer ' + await token(profile.id) };
  if (!state.media) {
    const buf = await readVideo();
    if (buf.length > 512 * 1024 * 1024) throw new Error('X accepts videos up to 512 MB.');
    let r = await fetch(`${API}/2/media/upload/initialize`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ media_type: 'video/mp4', total_bytes: buf.length, media_category: 'tweet_video' }) });
    let j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(xError(r.status, j, 'upload setup failed'));
    const mid = j.data?.id || j.data?.media_id || j.media_id_string;
    if (!mid) throw new Error('X did not return a media id.');
    const CH = 4 * 1024 * 1024;
    for (let i = 0, seg = 0; i < buf.length; i += CH, seg++) {
      const fd = new FormData();
      fd.append('segment_index', String(seg));
      fd.append('media', new Blob([buf.subarray(i, i + CH)]), 'chunk');
      r = await fetch(`${API}/2/media/upload/${mid}/append`, { method: 'POST', headers: H, body: fd });
      if (!r.ok) throw new Error(xError(r.status, await r.json().catch(() => ({})), 'video upload failed'));
    }
    r = await fetch(`${API}/2/media/upload/${mid}/finalize`, { method: 'POST', headers: H });
    j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(xError(r.status, j, 'upload finish failed'));
    const info = j.data?.processing_info;
    if (info && info.state !== 'succeeded') return { wait: { media: String(mid) }, msg: 'X is processing the video' };
    state.media = String(mid); state.ready = true;
  }
  if (!state.ready) {
    let ok = false;
    while (timeLeft() > 20000) {
      const j = await fetch(`${API}/2/media/upload?command=STATUS&media_id=${state.media}`, { headers: H }).then(x => x.json()).catch(() => ({}));
      const info = j.data?.processing_info;
      if (!info || info.state === 'succeeded') { ok = true; break; }
      if (info.state === 'failed') throw new Error('X could not process this video: ' + (info.error?.message || 'unknown reason'));
      if ((state.waits || 0) > 60) throw new Error('X is taking too long to process the video. Press Retry later.');
      await new Promise(r => setTimeout(r, Math.max(2, info.check_after_secs || 5) * 1000));
    }
    if (!ok) return { wait: { ...state, waits: (state.waits || 0) + 1 }, msg: 'X is processing the video' };
  }
  const r = await fetch(`${API}/2/tweets`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: await tweetText(job), media: { media_ids: [state.media] } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(xError(r.status, j, 'post failed'));
  return { done: { id: j.data?.id, url: `https://x.com/${profile.x.username || 'i'}/status/${j.data?.id}` } };
}

module.exports = { authUrl, exchange, disconnect, check, post, tweetText };
