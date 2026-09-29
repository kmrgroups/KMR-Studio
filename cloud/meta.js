// Instagram Reels and Facebook Page videos through Meta's Graph API.
// Meta downloads the video itself from a short-lived signed link, so nothing big passes through here.
const st = require('./state');

async function V() { return (await st.settings()).meta_graph_version || 'v23.0'; }

function metaError(j, fallback) {
  const e = j && j.error;
  if (!e) return fallback || 'Meta request failed';
  if (e.code === 190) {
    const why = { 458: 'the app was removed from your Facebook account', 460: 'your Facebook password was changed', 463: 'the login token expired', 464: 'your Facebook account needs attention (open facebook.com)', 467: 'you logged out of Facebook or the token was replaced' }[e.error_subcode];
    return `The Facebook login stopped working${why ? ' because ' + why : ''}. Open Profiles, Instagram and Facebook, paste a new token from Graph API Explorer and press Connect. With the App secret saved, the new login does not expire.`;
  }
  if (e.code === 10 || e.code === 200 || /permission/i.test(e.message)) return 'Meta says a permission is missing: ' + e.message + ' Make a new token with every permission from the list ticked.';
  if (e.code === 4 || e.code === 17 || e.code === 32 || e.code === 613) return 'Meta posting limit reached for now. Press Retry later.';
  if (e.code === 9004 || e.code === 352) return 'Instagram rejected the video format: ' + (e.error_user_msg || e.message);
  return 'Meta: ' + (e.error_user_msg || e.message);
}
async function gget(path, params) {
  const r = await fetch(`https://graph.facebook.com/${await V()}/${path}?` + new URLSearchParams(params), { signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(metaError(j, 'Meta error ' + r.status));
  return j;
}
async function gpost(path, params, host = 'graph.facebook.com') {
  const r = await fetch(`https://${host}/${await V()}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(120000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(metaError(j, 'Meta error ' + r.status));
  return j;
}

const NEED = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'instagram_basic', 'instagram_content_publish'];
async function inspect(token, app_id, app_secret) {
  const d = (await gget('debug_token', { input_token: token, access_token: `${app_id}|${app_secret}` })).data || {};
  return { valid: !!d.is_valid, expires: Number(d.expires_at || 0), scopes: d.scopes || [] };
}

async function connect(pid, { user_token, page_id }) {
  const s = await st.settings();
  if (!await st.profile(pid)) throw new Error('Profile not found.');
  const m = await st.account(pid, 'meta');
  const fresh = String(user_token || '').trim();
  let token = fresh || m.user_token;
  if (!token) throw new Error('Paste the access token from Graph API Explorer.');
  if (fresh && (!s.meta_app_id || !s.meta_app_secret)) throw new Error('Save the Meta App ID and App secret first (Settings, App keys). Without them the login only lasts about one hour.');
  if (fresh) {
    try { token = (await gget('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: s.meta_app_id, client_secret: s.meta_app_secret, fb_exchange_token: fresh })).access_token; }
    catch (e) { throw new Error('Facebook did not accept the App ID, App secret and token together. Check that the token was made for this same app in Graph API Explorer. (' + e.message + ')'); }
  }
  const pages = (await gget('me/accounts', { fields: 'id,name,access_token,instagram_business_account{id,username}', limit: '100', access_token: token })).data || [];
  if (!pages.length) throw new Error('No Facebook Page found. When making the token, choose the Page (and its Instagram account) in the pop-up.');
  const pick = pages.find(p => p.id === page_id) || pages.find(p => p.id === m.page_id) || pages.find(p => p.instagram_business_account) || pages[0];
  let info = { expires: -1, scopes: [] };
  try { info = await inspect(pick.access_token, s.meta_app_id, s.meta_app_secret); } catch {}
  const missing = info.scopes.length ? NEED.filter(x => !info.scopes.includes(x)) : [];
  await st.setAccount(pid, 'meta', {
    user_token: token, page_id: pick.id, page_name: pick.name, page_token: pick.access_token,
    ig_id: pick.instagram_business_account?.id || '', ig_username: pick.instagram_business_account?.username || '',
    pages: pages.map(p => ({ id: p.id, name: p.name, ig: p.instagram_business_account?.username || '' })),
    expires: info.expires, missing, problem: ''
  }, true);
  let msg = `Connected Facebook Page "${pick.name}"` + (pick.instagram_business_account ? ` and Instagram @${pick.instagram_business_account.username}.` : '. This Page has no Instagram business account linked, so only Facebook will work.');
  if (missing.length) msg += ' Missing permissions: ' + missing.join(', ') + '.';
  return msg;
}

async function check(pid) {
  const s = await st.settings(), m = await st.account(pid, 'meta');
  if (!m.page_token) throw new Error('Instagram and Facebook are not connected for this profile.');
  try {
    await gget(m.page_id, { fields: 'id,name', access_token: m.page_token });
    if (m.ig_id) await gget(m.ig_id, { fields: 'id,username', access_token: m.page_token });
  } catch (e) { await st.setAccount(pid, 'meta', { problem: e.message }); throw e; }
  let exp = '';
  if (s.meta_app_id && s.meta_app_secret) {
    try { const i = await inspect(m.page_token, s.meta_app_id, s.meta_app_secret); if (i.expires > 0) exp = ` But this login expires on ${new Date(i.expires * 1000).toDateString()}. Connect again with the App secret saved so it never expires.`; } catch {}
  }
  await st.setAccount(pid, 'meta', { problem: '' });
  return `Facebook Page "${m.page_name}"${m.ig_username ? ' and Instagram @' + m.ig_username : ''} work.` + (exp || ' The login does not expire.');
}
async function disconnect(pid) { await st.setAccount(pid, 'meta', {}, true); }

function caption(job, max) {
  return [job.title, job.description, (job.hashtags || []).slice(0, 25).join(' ')].filter(Boolean).join('\n\n').slice(0, max);
}

// Instagram in steps: 1 create (Instagram starts downloading), 2 wait for processing, 3 publish.
async function postInstagram(ctx) {
  const { profile, job, state, videoUrl, timeLeft } = ctx;
  const m = profile.meta;
  if (!m.ig_id) throw new Error('No Instagram account is linked to this Facebook Page.');
  if (!state.container) {
    const params = { media_type: 'REELS', video_url: await videoUrl(180), caption: caption(job, 2200), share_to_feed: 'true', access_token: m.page_token };
    if (ctx.thumb) params.cover_url = await ctx.thumbUrl(180);
    const c = await gpost(`${m.ig_id}/media`, params);
    return { wait: { container: c.id }, msg: 'Instagram is downloading the video' };
  }
  while (timeLeft() > 20000) {
    const s = await gget(state.container, { fields: 'status_code,status', access_token: m.page_token });
    if (s.status_code === 'FINISHED') {
      const p = await gpost(`${m.ig_id}/media_publish`, { creation_id: state.container, access_token: m.page_token });
      let url = `https://www.instagram.com/${m.ig_username}/`;
      try { url = (await gget(p.id, { fields: 'permalink', access_token: m.page_token })).permalink || url; } catch {}
      return { done: { id: p.id, url } };
    }
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Instagram could not process the video: ' + (s.status || s.status_code) + '. Reels must be 3 seconds to 15 minutes, MP4 (H.264).');
    if ((state.waits || 0) > 60) throw new Error('Instagram is taking too long to process the video. Press Retry later.');
    await new Promise(r => setTimeout(r, 8000));
  }
  return { wait: { ...state, waits: (state.waits || 0) + 1 }, msg: 'Instagram is processing the video' };
}

async function postFacebook(ctx) {
  const { profile, job, video, videoUrl } = ctx;
  const m = profile.meta, v = await V();
  const url = await videoUrl(180);
  const reel = video.h > video.w && video.duration >= 3 && video.duration <= 90;
  if (reel) {
    const start = await gpost(`${m.page_id}/video_reels`, { upload_phase: 'start', access_token: m.page_token });
    const r = await fetch(start.upload_url || `https://rupload.facebook.com/video-upload/${v}/${start.video_id}`, { method: 'POST', headers: { Authorization: `OAuth ${m.page_token}`, file_url: url } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error || j.success === false) throw new Error(metaError(j, 'Facebook could not fetch the video (' + r.status + ')'));
    await gpost(`${m.page_id}/video_reels`, { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: caption(job, 5000), title: String(job.title || '').slice(0, 250), access_token: m.page_token });
    return { done: { id: start.video_id, url: `https://www.facebook.com/reel/${start.video_id}`, note: await setThumb(ctx, start.video_id, m.page_token) } };
  }
  const j = await gpost(`${m.page_id}/videos`, { file_url: url, title: String(job.title || '').slice(0, 250), description: caption(job, 5000), access_token: m.page_token }, 'graph-video.facebook.com');
  return { done: { id: j.id, url: `https://www.facebook.com/${m.page_id}/videos/${j.id}`, note: await setThumb(ctx, j.id, m.page_token) } };
}
// Facebook takes the thumbnail after the video; if it refuses, Facebook picks one itself.
async function setThumb(ctx, videoId, token) {
  if (!ctx.thumb) return '';
  try {
    const fd = new FormData();
    fd.append('access_token', token); fd.append('is_preferred', 'true');
    fd.append('source', new Blob([await ctx.readThumb()], { type: 'image/jpeg' }), 'thumb.jpg');
    const r = await fetch(`https://graph.facebook.com/${await V()}/${videoId}/thumbnails`, { method: 'POST', body: fd, signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(() => ({}));
    return r.ok && !j.error ? '' : 'Facebook chose its own thumbnail.';
  } catch { return 'Facebook chose its own thumbnail.'; }
}

module.exports = { connect, check, disconnect, postInstagram, postFacebook, caption };
