// YouTube: each profile signs in with a short code on google.com/device, then videos upload to that channel.
const st = require('./state');
const kv = require('./kv');

const SCOPE = 'https://www.googleapis.com/auth/youtube';
const form = o => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });

async function client(pid) {
  const s = await st.settings(), yt = await st.account(pid, 'yt');
  const own = yt.client_id && yt.client_secret;
  return { id: own ? yt.client_id : s.yt_client_id, secret: own ? yt.client_secret : s.yt_client_secret };
}

async function start(pid) {
  if (!await st.profile(pid)) throw new Error('Profile not found.');
  const c = await client(pid);
  if (!c.id || !c.secret) throw new Error('Save the Google client ID and secret first (Settings, App keys, YouTube).');
  const r = await fetch('https://oauth2.googleapis.com/device/code', form({ client_id: c.id, scope: SCOPE }));
  const j = await r.json();
  if (!r.ok) throw new Error('Google: ' + (j.error_description || j.error) + (j.error === 'invalid_client' ? ' (the client type must be "TVs and Limited Input devices")' : ''));
  const d = { device_code: j.device_code, code: j.user_code, url: j.verification_url || j.verification_uri, interval: j.interval || 5, expires_at: Date.now() + j.expires_in * 1000, next: 0 };
  await kv.setJ('dev:' + pid, d, j.expires_in);
  return { state: 'waiting', code: d.code, url: d.url };
}

// The page asks every few seconds; each ask checks Google once.
async function poll(pid) {
  const d = await kv.getJ('dev:' + pid);
  if (!d) { const yt = await st.account(pid, 'yt'); return { state: yt.refresh ? 'connected' : 'expired', channel: yt.channel }; }
  if (Date.now() < d.next) return { state: 'waiting', code: d.code, url: d.url };
  const c = await client(pid);
  const r = await fetch('https://oauth2.googleapis.com/token', form({ client_id: c.id, client_secret: c.secret, device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }));
  const j = await r.json().catch(() => ({}));
  if (j.access_token) {
    await kv.del('dev:' + pid);
    const old = await st.account(pid, 'yt');
    await st.setAccount(pid, 'yt', { refresh: j.refresh_token || old.refresh, access: j.access_token, access_exp: Date.now() + (j.expires_in - 120) * 1000, problem: '' });
    const ch = await channel(pid).catch(() => null);
    await st.setAccount(pid, 'yt', { channel: ch ? ch.title : 'Connected', channel_id: ch?.id || '' });
    return { state: 'connected', channel: ch?.title };
  }
  if (j.error === 'authorization_pending' || j.error === 'slow_down') {
    if (j.error === 'slow_down') d.interval += 5;
    d.next = Date.now() + d.interval * 1000 - 500;
    await kv.setJ('dev:' + pid, d, Math.max(5, Math.round((d.expires_at - Date.now()) / 1000)));
    return { state: 'waiting', code: d.code, url: d.url };
  }
  await kv.del('dev:' + pid);
  return { state: 'error', error: j.error_description || j.error || 'Google did not answer' };
}

async function token(pid) {
  const yt = await st.account(pid, 'yt');
  if (yt.access && yt.access_exp > Date.now()) return yt.access;
  if (!yt.refresh) throw new Error('YouTube is not connected for this profile.');
  const c = await client(pid);
  const r = await fetch('https://oauth2.googleapis.com/token', form({ client_id: c.id, client_secret: c.secret, refresh_token: yt.refresh, grant_type: 'refresh_token' }));
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) {
    const msg = j.error === 'invalid_grant'
      ? 'The YouTube sign-in expired. Press Connect again (and set your Google app to "In production" so it stops expiring).'
      : 'YouTube sign-in failed: ' + (j.error_description || j.error);
    await st.setAccount(pid, 'yt', { problem: msg });
    throw new Error(msg);
  }
  await st.setAccount(pid, 'yt', { access: j.access_token, access_exp: Date.now() + (j.expires_in - 120) * 1000, problem: '' });
  return j.access_token;
}

async function channel(pid) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: 'Bearer ' + await token(pid) } });
  const j = await r.json();
  const c = j.items?.[0];
  return c ? { id: c.id, title: c.snippet.title } : null;
}

async function setOwnKeys(pid, id, secret) {
  await kv.del('dev:' + pid);
  await st.setAccount(pid, 'yt', { client_id: String(id || '').trim(), client_secret: String(secret || '').trim() }, true);
}
async function disconnect(pid) {
  const yt = await st.account(pid, 'yt');
  await kv.del('dev:' + pid);
  await st.setAccount(pid, 'yt', { client_id: yt.client_id || '', client_secret: yt.client_secret || '' }, true);
}
async function check(pid) {
  const ch = await channel(pid);
  if (!ch) throw new Error('Google signed in, but this account has no YouTube channel.');
  await st.setAccount(pid, 'yt', { channel: ch.title, problem: '' });
  return `YouTube channel "${ch.title}" works.`;
}

function friendly(msg) {
  if (/quotaExceeded|quota/i.test(msg)) return 'The YouTube daily limit for this Google project is used up (about 6 uploads a day). It resets at 1:30 PM India time; press Retry then. Give busy profiles their own Google keys to get their own limit.';
  if (/uploadLimitExceeded/i.test(msg)) return 'This YouTube channel hit its daily upload limit. Try again tomorrow.';
  return msg;
}

// One step: the whole upload (the video is read from storage and sent to YouTube).
async function post(ctx) {
  const { profile, job, video, readVideo } = ctx;
  const s = await st.settings();
  const isShort = video.h > video.w && video.duration <= 180;
  const title = String(job.title || 'New video').replace(/[<>]/g, '').slice(0, 100);
  let description = String(job.description || '').replace(/[<>]/g, '');
  const tags = (job.hashtags || []).join(' ');
  if (tags) description += '\n\n' + tags;
  if (isShort && !/#shorts/i.test(title + description)) description += ' #Shorts';
  const buf = await readVideo();
  const meta = { snippet: { title, description: description.slice(0, 4900), tags: (job.hashtags || []).map(h => h.replace(/^#/, '')).slice(0, 15), categoryId: '22' }, status: { privacyStatus: s.yt_privacy || 'public', selfDeclaredMadeForKids: false } };
  const r = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + await token(profile.id), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(buf.length) },
    body: JSON.stringify(meta)
  });
  if (!r.ok) throw new Error(friendly('YouTube: ' + (await r.text()).slice(0, 300)));
  const up = await fetch(r.headers.get('location'), { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: buf });
  const j = await up.json().catch(() => ({}));
  if (!up.ok || !j.id) throw new Error(friendly('YouTube upload: ' + JSON.stringify(j.error || j).slice(0, 300)));
  const notes = [];
  if (j.status?.privacyStatus === 'private' && (s.yt_privacy || 'public') !== 'private') notes.push('YouTube kept it private until your Google app passes its audit.');
  if (ctx.thumb) {
    try {
      const img = await ctx.readThumb();
      const t = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${j.id}`, { method: 'POST', headers: { Authorization: 'Bearer ' + await token(profile.id), 'Content-Type': 'image/jpeg' }, body: img });
      if (!t.ok) {
        const e = await t.json().catch(() => ({}));
        const why = e.error?.errors?.[0]?.reason || e.error?.message || t.status;
        notes.push(/forbidden|permission|verif/i.test(String(why)) ? 'Thumbnail not set: verify the channel once at youtube.com/verify (phone number) so YouTube allows custom thumbnails.' : 'Thumbnail not set (' + why + ').');
      }
    } catch (e) { notes.push('Thumbnail not set (' + e.message + ').'); }
  }
  const note = notes.join(' ');
  return { done: { id: j.id, url: isShort ? `https://youtube.com/shorts/${j.id}` : `https://youtu.be/${j.id}`, note } };
}

module.exports = { start, poll, token, channel, setOwnKeys, disconnect, check, post };
