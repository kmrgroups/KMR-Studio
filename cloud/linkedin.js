// LinkedIn: video posts on a person's own profile (free "Share on LinkedIn" product). Logins last 60 days.
const st = require('./state');
const oauth = require('./oauth');

const API = 'https://api.linkedin.com';

async function authUrl(pid, base) {
  const s = await st.settings();
  if (!s.li_client_id || !s.li_client_secret) throw new Error('Save the LinkedIn Client ID and secret first (Settings, App keys, LinkedIn).');
  if (!await st.profile(pid)) throw new Error('Profile not found.');
  const state = await oauth.begin('linkedin', pid, base);
  return 'https://www.linkedin.com/oauth/v2/authorization?' + new URLSearchParams({ response_type: 'code', client_id: s.li_client_id, redirect_uri: oauth.callback(base), state, scope: 'openid profile w_member_social' });
}

async function exchange(rec, code) {
  const s = await st.settings();
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: s.li_client_id, client_secret: s.li_client_secret, redirect_uri: oauth.callback(rec.base) })
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('LinkedIn: ' + (j.error_description || j.error || 'sign-in failed') + (/redirect/i.test(j.error_description || '') ? ` Add ${oauth.callback(rec.base)} to your LinkedIn app, Auth tab, Authorized redirect URLs.` : ''));
  const me = await fetch(`${API}/v2/userinfo`, { headers: { Authorization: 'Bearer ' + j.access_token } }).then(x => x.json()).catch(() => ({}));
  if (!me.sub) throw new Error('LinkedIn signed in but did not share the profile. In your LinkedIn app, Products tab, add "Sign In with LinkedIn using OpenID Connect".');
  await st.setAccount(rec.pid, 'li', { token: j.access_token, expires_at: Date.now() + (j.expires_in || 5184000) * 1000, urn: 'urn:li:person:' + me.sub, name: me.name || '', problem: '' }, true);
  return me.name || 'LinkedIn';
}
async function disconnect(pid) { await st.setAccount(pid, 'li', {}, true); }

function liError(status, j, what) {
  const msg = j?.message || j?.error_description || JSON.stringify(j || {}).slice(0, 200);
  if (status === 401) return 'The LinkedIn login expired. Press Connect for this profile again.';
  if (status === 403) return 'LinkedIn refused: the app needs the "Share on LinkedIn" product (Developer portal, your app, Products). ' + msg;
  if (status === 429) return 'LinkedIn daily posting limit reached. Press Retry tomorrow.';
  return `LinkedIn ${what}: ${msg}`;
}

async function check(pid) {
  const li = await st.account(pid, 'li');
  if (!li.token) throw new Error('LinkedIn is not connected.');
  const r = await fetch(`${API}/v2/userinfo`, { headers: { Authorization: 'Bearer ' + li.token } });
  if (!r.ok) { const m = liError(r.status, await r.json().catch(() => ({})), 'check failed'); await st.setAccount(pid, 'li', { problem: m }); throw new Error(m); }
  await st.setAccount(pid, 'li', { problem: '' });
  return `LinkedIn works for ${li.name}. The login ends on ${new Date(li.expires_at).toDateString()}; press Connect again before then.`;
}

// Steps: 1 register and upload, 2 wait for LinkedIn to process, 3 publish.
async function post(ctx) {
  const { profile, job, state, readVideo, timeLeft } = ctx;
  const li = profile.li;
  if (!li.token || (li.expires_at && li.expires_at < Date.now())) throw new Error('LinkedIn is not connected for this profile, or its 60-day login ended. Press Connect again.');
  const H = { Authorization: 'Bearer ' + li.token, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' };
  if (!state.asset) {
    const buf = await readVideo();
    if (buf.length > 200 * 1024 * 1024) throw new Error('LinkedIn accepts videos up to 200 MB this way. This one is ' + Math.round(buf.length / 1048576) + ' MB.');
    let r = await fetch(`${API}/v2/assets?action=registerUpload`, { method: 'POST', headers: H, body: JSON.stringify({ registerUploadRequest: { recipes: ['urn:li:digitalmediaRecipe:feedshare-video'], owner: li.urn, serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }] } }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(liError(r.status, j, 'upload setup failed'));
    const upUrl = j.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
    if (!upUrl || !j.value?.asset) throw new Error('LinkedIn did not give an upload address.');
    r = await fetch(upUrl, { method: 'PUT', headers: { Authorization: 'Bearer ' + li.token, 'Content-Type': 'application/octet-stream' }, body: buf });
    if (!r.ok) throw new Error(liError(r.status, await r.json().catch(() => ({})), 'video upload failed'));
    return { wait: { asset: j.value.asset }, msg: 'LinkedIn is processing the video' };
  }
  const id = state.asset.split(':').pop();
  let ready = false;
  while (timeLeft() > 20000) {
    const a = await fetch(`${API}/v2/assets/${id}`, { headers: H }).then(x => x.json()).catch(() => ({}));
    const s = a.recipes?.[0]?.status;
    if (s === 'AVAILABLE') { ready = true; break; }
    if (s === 'PROCESSING_FAILED' || s === 'CLIENT_ERROR') throw new Error('LinkedIn could not process this video.');
    if ((state.waits || 0) > 60) throw new Error('LinkedIn is taking too long to process the video. Press Retry later.');
    await new Promise(r => setTimeout(r, 8000));
  }
  if (!ready) return { wait: { ...state, waits: (state.waits || 0) + 1 }, msg: 'LinkedIn is processing the video' };
  const text = [job.title, job.description, (job.hashtags || []).slice(0, 10).join(' ')].filter(Boolean).join('\n\n').slice(0, 2900);
  const r = await fetch(`${API}/v2/ugcPosts`, { method: 'POST', headers: H, body: JSON.stringify({
    author: li.urn, lifecycleState: 'PUBLISHED',
    specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text }, shareMediaCategory: 'VIDEO', media: [{ status: 'READY', media: state.asset, title: { text: String(job.title || '').slice(0, 200) } }] } },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(liError(r.status, j, 'post failed'));
  const urn = r.headers.get('x-restli-id') || j.id || '';
  return { done: { id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : 'https://www.linkedin.com/in/me/recent-activity/all/' } };
}

module.exports = { authUrl, exchange, disconnect, check, post };
