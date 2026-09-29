// X (Twitter): posts videos to a person's X account with OAuth 2.0 (PKCE).
// Not free: since February 2026 X charges per request from prepaid credits (about US$0.02 per video post).
const fs = require('fs');
const db = require('./db');
const oauth = require('./oauth');
const { sleep } = require('./util');

const API = 'https://api.x.com';
const SCOPES = 'tweet.read tweet.write users.read media.write offline.access';
const connected = p => !!(p && p.x && p.x.refresh);

function basic() { const s = db.settings(); return 'Basic ' + Buffer.from(`${s.x_client_id}:${s.x_client_secret}`).toString('base64'); }

function authUrl(pid, base) {
  const s = db.settings();
  if (!s.x_client_id || !s.x_client_secret) throw new Error('Save the X app Client ID and secret first (Connections, App keys, X).');
  const { verifier, challenge } = oauth.pkce();
  const { state } = oauth.begin('x', pid, base, { verifier });
  return 'https://x.com/i/oauth2/authorize?' + new URLSearchParams({
    response_type: 'code', client_id: s.x_client_id, redirect_uri: oauth.redirectUri(), scope: SCOPES, state, code_challenge: challenge, code_challenge_method: 'S256'
  });
}

async function tokenCall(params) {
  const r = await fetch(`${API}/2/oauth2/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: basic() }, body: new URLSearchParams(params) });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('X sign-in: ' + (j.error_description || j.error || r.status));
  return j;
}

async function exchange(rec, code) {
  const j = await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: oauth.redirectUri(), code_verifier: rec.verifier, client_id: db.settings().x_client_id });
  const me = await fetch(`${API}/2/users/me`, { headers: { Authorization: 'Bearer ' + j.access_token } }).then(x => x.json()).catch(() => ({}));
  db.updateAccount(rec.pid, 'x', { access: j.access_token, refresh: j.refresh_token, expires_at: Date.now() + (j.expires_in || 7200) * 1000 - 60000, username: me.data?.username || '', name: me.data?.name || '', problem: '' }, true);
  return me.data?.username ? '@' + me.data.username : 'X';
}

async function token(profile) {
  const x = profile.x || {};
  if (x.access && x.expires_at > Date.now()) return x.access;
  if (!x.refresh) throw new Error('X is not connected for this profile.');
  let j;
  try { j = await tokenCall({ grant_type: 'refresh_token', refresh_token: x.refresh, client_id: db.settings().x_client_id }); }
  catch (e) {
    const msg = `X login for ${profile.name} stopped working. Reconnect X in Connections. (${e.message})`;
    db.updateAccount(profile.id, 'x', { problem: msg }); throw new Error(msg);
  }
  db.updateAccount(profile.id, 'x', { access: j.access_token, refresh: j.refresh_token || x.refresh, expires_at: Date.now() + (j.expires_in || 7200) * 1000 - 60000, problem: '' });
  return j.access_token;
}

function disconnect(pid) { db.updateAccount(pid, 'x', {}, true); }

function xError(status, j, what) {
  const d = j?.detail || j?.title || j?.errors?.[0]?.message || JSON.stringify(j || {}).slice(0, 200);
  if (status === 402 || /credit|payment|CreditsDepleted/i.test(d)) return 'X needs API credits for this. Add credits in the X Developer Console (about US$0.02 per video post).';
  if (status === 401) return 'X login expired. Reconnect X for this profile in Connections.';
  if (status === 403) return `X refused (${d}). Check that the app has Read and Write permission, then reconnect.`;
  if (status === 429) return 'X posting limit reached for now. Try again later.';
  return `X ${what}: ${d}`;
}

// Short text for X: title plus hashtags, cut to the post limit.
function tweetText(job) {
  const lim = Number(db.settings().x_post_limit) || 280;
  const tags = (job.hashtags || []).slice(0, 4).join(' ');
  let t = String(job.title || job.topic || '').trim();
  const room = lim - (tags ? tags.length + 2 : 0);
  if (t.length > room) t = t.slice(0, Math.max(0, room - 1)).trimEnd() + '…';
  return (tags ? `${t}\n\n${tags}` : t).slice(0, lim);
}

async function post(profile, job, file) {
  const tk = await token(profile);
  const H = { Authorization: 'Bearer ' + tk };
  const buf = fs.readFileSync(file);
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
    r = await fetch(`${API}/2/media/upload/${mid}/append`, { method: 'POST', headers: H, body: fd, signal: AbortSignal.timeout(10 * 60000) });
    if (!r.ok) throw new Error(xError(r.status, await r.json().catch(() => ({})), 'video upload failed'));
  }
  r = await fetch(`${API}/2/media/upload/${mid}/finalize`, { method: 'POST', headers: H });
  j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(xError(r.status, j, 'upload finish failed'));
  let info = j.data?.processing_info;
  for (let i = 0; info && info.state !== 'succeeded' && i < 90; i++) {
    if (info.state === 'failed') throw new Error('X could not process this video: ' + (info.error?.message || 'unknown reason'));
    await sleep(Math.max(2, info.check_after_secs || 5) * 1000);
    j = await fetch(`${API}/2/media/upload?command=STATUS&media_id=${mid}`, { headers: H }).then(x => x.json()).catch(() => ({}));
    info = j.data?.processing_info;
  }
  r = await fetch(`${API}/2/tweets`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: tweetText(job), media: { media_ids: [String(mid)] } }) });
  j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(xError(r.status, j, 'post failed'));
  const id = j.data?.id;
  return { id, url: `https://x.com/${profile.x.username || 'i'}/status/${id}` };
}

module.exports = { authUrl, exchange, disconnect, post, connected, tweetText, tokenFor: token };
