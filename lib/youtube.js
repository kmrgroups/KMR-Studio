// YouTube: every profile signs in with a short code (no redirect URLs needed), then videos upload to that channel.
// All profiles share the Google client in Connections, App keys, unless a profile has its own (its own daily quota).
const fs = require('fs');
const db = require('./db');
const { sleep } = require('./util');

const SCOPE = 'https://www.googleapis.com/auth/youtube';
const form = o => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o) });

const devices = new Map();   // profile id -> device sign-in in progress
const access = new Map();    // profile id -> { token, exp }

function client(pid) {
  const s = db.settings(), p = db.profile(pid) || {};
  const own = p.yt?.client_id && p.yt?.client_secret;
  return { id: own ? p.yt.client_id : s.yt_client_id, secret: own ? p.yt.client_secret : s.yt_client_secret };
}
const connected = p => !!(p && p.yt && p.yt.refresh);

async function startDevice(pid) {
  if (!db.profile(pid)) throw new Error('Profile not found.');
  const c = client(pid);
  if (!c.id || !c.secret) throw new Error('Save the Google client ID and secret first (Connections, App keys, YouTube).');
  const r = await fetch('https://oauth2.googleapis.com/device/code', form({ client_id: c.id, scope: SCOPE }));
  const j = await r.json();
  if (!r.ok) throw new Error('Google: ' + (j.error_description || j.error) + (j.error === 'invalid_client' ? ' (make sure the client type is "TVs and Limited Input devices")' : ''));
  const d = { ...j, pid, status: 'waiting', expires_at: Date.now() + j.expires_in * 1000 };
  devices.set(pid, d);
  pollDevice(d);
  return status(pid);
}

async function pollDevice(d) {
  while (devices.get(d.pid) === d && d.status === 'waiting' && Date.now() < d.expires_at) {
    await sleep((d.interval || 5) * 1000);
    const c = client(d.pid);
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', form({
        client_id: c.id, client_secret: c.secret, device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      }));
      const j = await r.json();
      if (j.access_token) {
        access.set(d.pid, { token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 });
        db.updateAccount(d.pid, 'yt', { refresh: j.refresh_token || db.profile(d.pid).yt?.refresh, problem: '' });
        const ch = await channel(d.pid).catch(() => null);
        db.updateAccount(d.pid, 'yt', { channel: ch ? ch.title : 'Connected', channel_id: ch?.id || '' });
        d.status = 'connected';
        require('./pipeline').youtubeConnected();
        return;
      }
      if (j.error === 'slow_down') d.interval = (d.interval || 5) + 5;
      else if (j.error !== 'authorization_pending') { d.status = 'error'; d.error = j.error_description || j.error; return; }
    } catch {}
  }
  if (d.status === 'waiting') d.status = 'expired';
}

function status(pid) {
  const p = db.profile(pid) || {}, d = devices.get(pid);
  if (!d) return { state: connected(p) ? 'connected' : 'idle', channel: p.yt?.channel };
  return { state: d.status, code: d.user_code, url: d.verification_url || d.verification_uri, error: d.error, channel: p.yt?.channel };
}
function allStatus() { return Object.fromEntries(db.profiles().map(p => [p.id, status(p.id)])); }

function disconnect(pid) {
  devices.delete(pid); access.delete(pid);
  const p = db.profile(pid);
  db.updateAccount(pid, 'yt', { client_id: p?.yt?.client_id || '', client_secret: p?.yt?.client_secret || '' }, true);
}

async function token(pid) {
  const a = access.get(pid);
  if (a && Date.now() < a.exp) return a.token;
  const p = db.profile(pid);
  if (!connected(p)) throw new Error('YouTube is not connected for this profile.');
  const c = client(pid);
  const r = await fetch('https://oauth2.googleapis.com/token', form({ client_id: c.id, client_secret: c.secret, refresh_token: p.yt.refresh, grant_type: 'refresh_token' }));
  const j = await r.json();
  if (!j.access_token) {
    const msg = j.error === 'invalid_grant'
      ? `YouTube sign-in for ${p.name} expired. Reconnect it in Connections (and set your Google app to "In production" so it stops expiring).`
      : 'YouTube sign-in failed: ' + (j.error_description || j.error);
    db.updateAccount(pid, 'yt', { problem: msg });
    throw new Error(msg);
  }
  access.set(pid, { token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 });
  return j.access_token;
}

// Any connected channel's token, for read-only jobs such as viral analysis.
async function accessToken() {
  const p = db.profiles().find(connected);
  if (!p) throw new Error('Connect YouTube for at least one profile (Connections page). KMR Studio uses it to search YouTube.');
  return token(p.id);
}
const anyConnected = () => db.profiles().some(connected);

async function channel(pid) {
  const r = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: 'Bearer ' + await token(pid) } });
  const j = await r.json();
  const c = j.items?.[0];
  return c ? { id: c.id, title: c.snippet.title } : null;
}

function friendly(msg) {
  if (/quotaExceeded|quota/i.test(msg)) return 'YouTube daily limit for this Google project is used up (about 6 uploads a day, shared by profiles using the same keys). It resets at midnight Pacific time (1:30 PM India); press Try posting again then. Give busy profiles their own Google keys to get their own limit.';
  if (/uploadLimitExceeded/i.test(msg)) return 'This YouTube channel hit its daily upload limit. Try again tomorrow.';
  return msg;
}

async function upload(profile, job, file, thumb) {
  const s = db.settings(), pid = profile.id;
  const buf = fs.readFileSync(file);
  const isShort = job.options.ratio === '9:16' && (job.duration || 0) <= 180;
  const title = String(job.title || job.topic || 'New video').replace(/[<>]/g, '').slice(0, 100);
  let description = String(job.description || '').replace(/[<>]/g, '');
  const hashtags = (job.hashtags || []).join(' ');
  if (hashtags) description += '\n\n' + hashtags;
  if (isShort && !/#shorts/i.test(title + description)) description += ' #Shorts';
  const tags = []; let len = 0;
  for (const t of job.tags || []) { const c = String(t).replace(/[<>,]/g, '').trim(); if (!c || len + c.length > 450) continue; tags.push(c); len += c.length + 1; }

  const meta = {
    snippet: { title, description: description.slice(0, 4900), tags, categoryId: '22' },
    status: { privacyStatus: s.yt_privacy || 'public', selfDeclaredMadeForKids: false, containsSyntheticMedia: job.source !== 'upload' }
  };
  const init = async body => fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + await token(pid), 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(buf.length) },
    body: JSON.stringify(body)
  });
  let r = await init(meta);
  if (r.status === 400) { delete meta.status.containsSyntheticMedia; r = await init(meta); }
  if (!r.ok) { const t = await r.text(); throw new Error(friendly('YouTube: ' + t.slice(0, 300))); }
  const loc = r.headers.get('location');
  const up = await fetch(loc, { method: 'PUT', headers: { 'Content-Type': 'video/mp4' }, body: buf, signal: AbortSignal.timeout(60 * 60000) });
  const j = await up.json().catch(() => ({}));
  if (!up.ok || !j.id) throw new Error(friendly('YouTube upload: ' + JSON.stringify(j.error || j).slice(0, 300)));

  let note = '';
  if (j.status?.privacyStatus === 'private' && (s.yt_privacy || 'public') !== 'private') note = 'YouTube kept it private until your Google app passes its audit';
  if (!isShort && thumb && fs.existsSync(thumb)) {
    await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${j.id}`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + await token(pid), 'Content-Type': 'image/jpeg' }, body: fs.readFileSync(thumb)
    }).catch(() => {});
  }
  return { id: j.id, url: isShort ? `https://youtube.com/shorts/${j.id}` : `https://youtu.be/${j.id}`, note };
}

// Saves (or clears) a profile's own Google client keys. Changing keys requires signing in again.
function setOwnClient(pid, id, secret) {
  const p = db.profile(pid); if (!p) throw new Error('Profile not found.');
  devices.delete(pid); access.delete(pid);
  db.updateAccount(pid, 'yt', { client_id: String(id || '').trim(), client_secret: String(secret || '').trim() }, true);
}

module.exports = { startDevice, status, allStatus, disconnect, upload, channel, accessToken, anyConnected, connected, setOwnClient };
