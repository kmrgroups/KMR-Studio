// Instagram Reels + Facebook Page posting through Meta's official Graph API.
// Videos are uploaded directly from this computer (no public link needed).
const fs = require('fs');
const db = require('./db');
const { sleep } = require('./util');

const V = () => db.settings().meta_graph_version || 'v23.0';
const G = p => `https://graph.facebook.com/${V()}/${p}`;

function metaError(j, fallback) {
  const e = j && j.error;
  if (!e) return fallback || 'Meta request failed';
  if (e.code === 190) {
    const why = { 458: 'the KMR Studio app was removed from your Facebook account', 460: 'your Facebook password was changed', 463: 'the login token expired', 464: 'your Facebook account needs attention (open facebook.com)', 467: 'you logged out of Facebook or the token was replaced' }[e.error_subcode];
    return `Your Facebook login stopped working${why ? ' because ' + why : ''}. Open Connections, Instagram and Facebook, paste a new token from Graph API Explorer and press Reconnect. With the App secret filled in, the new login does not expire.`;
  }
  if (e.code === 10 || e.code === 200 || /permission/i.test(e.message)) return 'Meta says a permission is missing: ' + e.message + ' Generate a new token with every permission from the list ticked.';
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return 'Meta posting limit reached for now. It will work again later.';
  if (e.code === 9004 || e.code === 352) return 'Instagram rejected the video format: ' + (e.error_user_msg || e.message);
  return 'Meta: ' + (e.error_user_msg || e.message);
}

async function gget(path, params) {
  const r = await fetch(G(path) + '?' + new URLSearchParams(params), { signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(metaError(j, 'Meta error ' + r.status));
  return j;
}
async function gpost(path, params) {
  const r = await fetch(G(path), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(120000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(metaError(j, 'Meta error ' + r.status));
  return j;
}

const NEED = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'];

// Asks Facebook how long a token lives and what it may do (needs the App ID and secret).
async function inspect(token, app_id, app_secret) {
  const d = (await gget('debug_token', { input_token: token, access_token: `${app_id}|${app_secret}` })).data || {};
  return { valid: !!d.is_valid, expires: Number(d.expires_at || 0), data_expires: Number(d.data_access_expires_at || 0), scopes: d.scopes || [], error: d.error?.message || '' };
}

// Connects one profile's Facebook Page (and its Instagram). The Meta app (App ID and secret) is shared by all profiles.
async function connect(pid, { app_id, app_secret, user_token, page_id }) {
  const s = db.settings(), prof = db.profile(pid);
  if (!prof) throw new Error('Profile not found.');
  const m = prof.meta || {};
  app_id = String(app_id || s.meta_app_id || '').trim();
  app_secret = String(app_secret && !app_secret.startsWith('••••') ? app_secret : s.meta_app_secret || '').trim();
  const fresh = String(user_token || '').trim();
  let token = fresh || m.user_token;
  if (!token) throw new Error('Paste the access token from Graph API Explorer.');
  if (fresh && (!app_id || !app_secret)) throw new Error('Fill in the Meta App ID and App secret first (Connections, App keys). Without them the login only lasts about one hour.');
  if (fresh) {
    try {
      const x = await gget('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: app_id, client_secret: app_secret, fb_exchange_token: fresh });
      token = x.access_token; // long-lived user token; Page tokens made from it do not expire
    } catch (e) {
      throw new Error('Facebook did not accept the App ID, App secret and token together. Check that the token was made for this same app in Graph API Explorer. (' + e.message + ')');
    }
  }
  const pages = (await gget('me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '100', access_token: token })).data || [];
  if (!pages.length) throw new Error('No Facebook Page found. When generating the token, choose the Page (and its Instagram account) in the pop-up.');
  const pick = pages.find(p => p.id === page_id) || pages.find(p => p.id === m.page_id) || pages.find(p => p.instagram_business_account) || pages[0];
  let info = { expires: -1, data_expires: 0, scopes: [] };
  try { info = await inspect(pick.access_token, app_id, app_secret); } catch {}
  const missing = info.scopes.length ? NEED.filter(x => !info.scopes.includes(x)) : [];
  db.updateSettings({ meta_app_id: app_id, meta_app_secret: app_secret });
  db.updateAccount(pid, 'meta', {
    user_token: token, page_id: pick.id, page_name: pick.name, page_token: pick.access_token,
    ig_id: pick.instagram_business_account?.id || '', ig_username: pick.instagram_business_account?.username || '',
    pages: pages.map(p => ({ id: p.id, name: p.name, ig: p.instagram_business_account?.username || '' })),
    expires: info.expires, data_expires: info.data_expires, missing, checked: Date.now(), problem: ''
  }, true);
  return { ...status(pid), missing };
}

// Checks a profile's saved login without posting anything. Used by "Check" and once a day.
async function check(pid) {
  const s = db.settings(), prof = db.profile(pid), m = prof?.meta || {};
  if (!m.page_token) throw new Error('Instagram and Facebook are not connected for this profile.');
  let problem = '';
  try {
    await gget(m.page_id, { fields: 'id,name', access_token: m.page_token });
    if (m.ig_id) await gget(m.ig_id, { fields: 'id,username', access_token: m.page_token });
  } catch (e) { problem = e.message; }
  let info = null;
  if (s.meta_app_id && s.meta_app_secret) { try { info = await inspect(m.page_token, s.meta_app_id, s.meta_app_secret); } catch {} }
  const patch = { checked: Date.now(), problem };
  if (info) Object.assign(patch, { expires: info.expires, data_expires: info.data_expires, missing: info.scopes.length ? NEED.filter(x => !info.scopes.includes(x)) : [] });
  db.updateAccount(pid, 'meta', patch);
  if (problem) throw new Error(problem);
  const st = db.profile(pid).meta;
  const when = t => new Date(t * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  let msg = `${prof.name}: Facebook Page "${st.page_name}"${st.ig_username ? ' and Instagram @' + st.ig_username : ''} work.`;
  if (st.expires > 0) msg += ` But this login expires on ${when(st.expires)}. Reconnect with the App secret saved so it never expires.`;
  else if (st.expires === 0) msg += ' The login does not expire.';
  if ((st.missing || []).length) msg += ' Missing permissions: ' + st.missing.join(', ') + '.';
  return msg;
}

function status(pid) {
  const m = db.profile(pid)?.meta || {};
  return { page: m.page_name, ig: m.ig_username, pages: m.pages || [], facebook: !!m.page_token, instagram: !!(m.page_token && m.ig_id) };
}
function disconnect(pid) { db.updateAccount(pid, 'meta', {}, true); }
const fbConnected = p => !!(p && p.meta && p.meta.page_token);
const igConnected = p => !!(p && p.meta && p.meta.page_token && p.meta.ig_id);

function caption(job, max) {
  const tags = (job.hashtags || []).slice(0, 25).join(' ');
  return [job.title, job.description, tags].filter(Boolean).join('\n\n').slice(0, max);
}

async function rupload(url, token, buf) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(buf.length), 'Content-Type': 'application/octet-stream' },
    body: buf, signal: AbortSignal.timeout(30 * 60000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error || j.debug_info) throw new Error(metaError(j, 'Video upload to Meta failed (' + r.status + ')'));
  return j;
}

async function postInstagram(profile, job, file) {
  const m = profile.meta || {};
  const s = { meta_ig_id: m.ig_id, meta_page_token: m.page_token, meta_ig_username: m.ig_username };
  if (!s.meta_ig_id) throw new Error('No Instagram account is linked to this Facebook Page.');
  const buf = fs.readFileSync(file);
  const c = await gpost(`${s.meta_ig_id}/media`, { media_type: 'REELS', upload_type: 'resumable', caption: caption(job, 2200), share_to_feed: 'true', access_token: s.meta_page_token });
  await rupload(c.uri || `https://rupload.facebook.com/ig-api-upload/${V()}/${c.id}`, s.meta_page_token, buf);
  for (let i = 0; i < 90; i++) {
    await sleep(10000);
    const st = await gget(c.id, { fields: 'status_code,status', access_token: s.meta_page_token });
    if (st.status_code === 'FINISHED') break;
    if (st.status_code === 'ERROR' || st.status_code === 'EXPIRED') throw new Error('Instagram could not process the video: ' + (st.status || st.status_code));
    if (i === 89) throw new Error('Instagram is taking too long to process the video. Try posting again later.');
  }
  const p = await gpost(`${s.meta_ig_id}/media_publish`, { creation_id: c.id, access_token: s.meta_page_token });
  let url = `https://www.instagram.com/${s.meta_ig_username}/`;
  try { url = (await gget(p.id, { fields: 'permalink', access_token: s.meta_page_token })).permalink || url; } catch {}
  return { id: p.id, url };
}

async function postFacebook(profile, job, file) {
  const m = profile.meta || {};
  const s = { meta_page_id: m.page_id, meta_page_token: m.page_token };
  const buf = fs.readFileSync(file);
  const reel = job.options.ratio === '9:16' && (job.duration || 0) >= 3 && (job.duration || 0) <= 90;
  if (reel) {
    const start = await gpost(`${s.meta_page_id}/video_reels`, { upload_phase: 'start', access_token: s.meta_page_token });
    await rupload(start.upload_url || `https://rupload.facebook.com/video-upload/${V()}/${start.video_id}`, s.meta_page_token, buf);
    await gpost(`${s.meta_page_id}/video_reels`, { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: caption(job, 5000), title: String(job.title || '').slice(0, 250), access_token: s.meta_page_token });
    return { id: start.video_id, url: `https://www.facebook.com/reel/${start.video_id}` };
  }
  const fd = new FormData();
  fd.append('access_token', s.meta_page_token);
  fd.append('title', String(job.title || '').slice(0, 250));
  fd.append('description', caption(job, 5000));
  fd.append('source', new Blob([buf], { type: 'video/mp4' }), 'video.mp4');
  const r = await fetch(`https://graph-video.facebook.com/${V()}/${s.meta_page_id}/videos`, { method: 'POST', body: fd, signal: AbortSignal.timeout(30 * 60000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(metaError(j, 'Facebook upload failed'));
  return { id: j.id, url: `https://www.facebook.com/${s.meta_page_id}/videos/${j.id}` };
}

module.exports = { connect, check, status, disconnect, postInstagram, postFacebook, fbConnected, igConnected };
