// LinkedIn: posts videos to a person's own LinkedIn profile, free, through the self-serve
// "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect" products.
// LinkedIn logins last 60 days; KMR Studio reminds on Telegram before they run out.
const fs = require('fs');
const db = require('./db');
const oauth = require('./oauth');
const { sleep } = require('./util');

const API = 'https://api.linkedin.com';
const connected = p => !!(p && p.li && p.li.token && (!p.li.expires_at || p.li.expires_at > Date.now()));

function authUrl(pid, base) {
  const s = db.settings();
  if (!s.li_client_id || !s.li_client_secret) throw new Error('Save the LinkedIn app Client ID and secret first (Connections, App keys, LinkedIn).');
  const { state } = oauth.begin('linkedin', pid, base);
  return 'https://www.linkedin.com/oauth/v2/authorization?' + new URLSearchParams({
    response_type: 'code', client_id: s.li_client_id, redirect_uri: oauth.redirectUri(), state, scope: 'openid profile w_member_social'
  });
}

async function exchange(rec, code) {
  const s = db.settings();
  const r = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: s.li_client_id, client_secret: s.li_client_secret, redirect_uri: oauth.redirectUri() })
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('LinkedIn: ' + (j.error_description || j.error || 'sign-in failed') + (/redirect/i.test(j.error_description || '') ? ' Add the sign-in return page address to your LinkedIn app, Auth tab, Authorized redirect URLs.' : ''));
  const me = await fetch(`${API}/v2/userinfo`, { headers: { Authorization: 'Bearer ' + j.access_token } }).then(x => x.json()).catch(() => ({}));
  if (!me.sub) throw new Error('LinkedIn signed in but did not share the profile. In your LinkedIn app, Products tab, add "Sign In with LinkedIn using OpenID Connect".');
  db.updateAccount(rec.pid, 'li', { token: j.access_token, expires_at: Date.now() + (j.expires_in || 5184000) * 1000, urn: 'urn:li:person:' + me.sub, name: me.name || '', picture: me.picture || '', problem: '', reminded: 0 }, true);
  return me.name || 'LinkedIn';
}

function disconnect(pid) { db.updateAccount(pid, 'li', {}, true); }

function liError(status, j, what) {
  const msg = j?.message || j?.error_description || JSON.stringify(j || {}).slice(0, 200);
  if (status === 401) return 'LinkedIn login expired. Reconnect LinkedIn for this profile in Connections (it takes one click).';
  if (status === 403) return 'LinkedIn refused: the app needs the "Share on LinkedIn" product (Developer portal, your app, Products). ' + msg;
  if (status === 429) return 'LinkedIn daily posting limit reached. Try again tomorrow.';
  return `LinkedIn ${what}: ${msg}`;
}

async function post(profile, job, file) {
  const li = profile.li || {};
  if (!connected(profile)) throw new Error('LinkedIn is not connected for this profile, or its 60-day login ended. Reconnect it in Connections.');
  const H = { Authorization: 'Bearer ' + li.token, 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' };
  const size = fs.statSync(file).size;
  if (size > 200 * 1024 * 1024) throw new Error('LinkedIn accepts videos up to 200 MB through this route. This one is ' + Math.round(size / 1048576) + ' MB.');
  // 1. register the upload
  let r = await fetch(`${API}/v2/assets?action=registerUpload`, { method: 'POST', headers: H, body: JSON.stringify({
    registerUploadRequest: { recipes: ['urn:li:digitalmediaRecipe:feedshare-video'], owner: li.urn, serviceRelationships: [{ relationshipType: 'OWNER', identifier: 'urn:li:userGeneratedContent' }] }
  }) });
  let j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(liError(r.status, j, 'upload setup failed'));
  const upUrl = j.value?.uploadMechanism?.['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest']?.uploadUrl;
  const asset = j.value?.asset;
  if (!upUrl || !asset) throw new Error('LinkedIn did not give an upload address.');
  // 2. upload the file
  r = await fetch(upUrl, { method: 'PUT', headers: { Authorization: 'Bearer ' + li.token, 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(file), signal: AbortSignal.timeout(30 * 60000) });
  if (!r.ok) throw new Error(liError(r.status, await r.json().catch(() => ({})), 'video upload failed'));
  // 3. wait until LinkedIn has processed it
  const id = asset.split(':').pop();
  for (let i = 0; i < 60; i++) {
    await sleep(i ? 10000 : 4000);
    const st = await fetch(`${API}/v2/assets/${id}`, { headers: H }).then(x => x.json()).catch(() => ({}));
    const s = st.recipes?.[0]?.status;
    if (s === 'AVAILABLE') break;
    if (s === 'PROCESSING_FAILED' || s === 'CLIENT_ERROR') throw new Error('LinkedIn could not process this video.');
    if (i === 59) throw new Error('LinkedIn is taking too long to process the video. Try posting again later.');
  }
  // 4. publish the post
  const text = [job.title, job.description, (job.hashtags || []).slice(0, 10).join(' ')].filter(Boolean).join('\n\n').slice(0, 2900);
  r = await fetch(`${API}/v2/ugcPosts`, { method: 'POST', headers: H, body: JSON.stringify({
    author: li.urn, lifecycleState: 'PUBLISHED',
    specificContent: { 'com.linkedin.ugc.ShareContent': { shareCommentary: { text }, shareMediaCategory: 'VIDEO', media: [{ status: 'READY', media: asset, title: { text: String(job.title || '').slice(0, 200) } }] } },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
  }) });
  j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(liError(r.status, j, 'post failed'));
  const urn = r.headers.get('x-restli-id') || j.id || '';
  return { id: urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : 'https://www.linkedin.com/in/me/recent-activity/all/' };
}

module.exports = { authUrl, exchange, disconnect, post, connected };
