// KMR Studio server. Zero npm dependencies: needs Node 20+, ffmpeg and edge-tts.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT, DATA, ensureDir, uid } = require('./lib/util');
const db = require('./lib/db');
const pipeline = require('./lib/pipeline');
const telegram = require('./lib/telegram');
const youtube = require('./lib/youtube');
const scheduler = require('./lib/scheduler');
const updater = require('./lib/updater');
const tts = require('./lib/tts');
const visuals = require('./lib/visuals');
const gemini = require('./lib/gemini');
const kaggle = require('./lib/kaggle');
const meta = require('./lib/meta');
const trends = require('./lib/trends');
const repurpose = require('./lib/repurpose');
const veo = require('./lib/veo');
const uploads = require('./lib/uploads');
const linkedin = require('./lib/linkedin');
const xapi = require('./lib/x');
const oauth = require('./lib/oauth');
const platforms = require('./lib/platforms');
const tunnel = require('./lib/tunnel');
const online = require('./lib/online');
const brand = require('./lib/brand');

const PORT = Number(process.env.PORT || 3456);
const VERSION = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
const PUBLIC = path.join(ROOT, 'public');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.aac': 'audio/aac', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

const SECRETS = ['gemini_key', 'groq_key', 'kaggle_key', 'veo_key', 'pexels_key', 'freesound_key', 'pollinations_token', 'telegram_token', 'yt_client_secret', 'meta_app_secret', 'li_client_secret', 'x_client_secret'];
const EDITABLE = [...SECRETS, 'yt_client_id', 'default_language', 'default_voice', 'default_style', 'default_ratio', 'default_duration',
  'default_niche', 'auto_approve', 'kaggle_username', 'motion_default', 'motion_max_scenes', 'post_to', 'music_mode', 'sfx_enabled', 'default_engine', 'cinematic_voice', 'veo_tier', 'veo_resolution', 'veo_monthly_cap', 'yt_privacy', 'quality', 'burn_subtitles', 'music_volume', 'timezone', 'public_url',
  'default_targets', 'meta_app_id', 'li_client_id', 'x_client_id', 'oauth_redirect'];

// ---------- helpers ----------
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('File is too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function body(req) { const b = await readBody(req); return b.length ? JSON.parse(b.toString()) : {}; }
function toFile(req, dest, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const out = fs.createWriteStream(dest);
    req.on('data', c => { size += c.length; if (size > limit) { req.destroy(); out.destroy(); fs.rmSync(dest, { force: true }); reject(new Error('File is too large')); } });
    req.pipe(out); out.on('finish', () => resolve(size)); out.on('error', reject);
  });
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function hashPw(pw) { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'); }
function checkPw(pw, stored) {
  if (!stored) return false;
  const [salt, h] = stored.split(':');
  const c = crypto.scryptSync(String(pw), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(c), Buffer.from(h));
}
function authed(req) {
  const t = cookies(req).lumen; const s = t && db.state.sessions[t];
  return !!(s && s.exp > Date.now());
}
const isHttps = req => req && (String(req.headers['x-forwarded-proto'] || '').includes('https') || /"scheme":"https"/.test(req.headers['cf-visitor'] || ''));
// Behind the Cloudflare tunnel every request comes from this computer; the real visitor is in cf-connecting-ip.
const clientIp = req => { const r = req.socket.remoteAddress || ''; return /^(::1|127\.|::ffff:127\.)/.test(r) && req.headers['cf-connecting-ip'] ? String(req.headers['cf-connecting-ip']) : r; };
function login(res, req) {
  const t = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  for (const [k, v] of Object.entries(db.state.sessions)) if (v.exp < now) delete db.state.sessions[k];
  db.state.sessions[t] = { exp: now + 60 * 864e5 }; db.save();
  res.setHeader('Set-Cookie', `lumen=${t}; HttpOnly; Path=/; Max-Age=${60 * 86400}; SameSite=Lax${isHttps(req) ? '; Secure' : ''}`);
}
function serveFile(req, res, file, cache = 'no-cache') {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('Not found'); }
  const size = fs.statSync(file).size;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range && req.headers.range.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? parseInt(range[1]) : 0;
    const end = range[2] ? Math.min(parseInt(range[2]), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Cache-Control': cache });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': cache });
  fs.createReadStream(file).pipe(res);
}
const safeName = n => path.basename(String(n)).replace(/[^\w.\- ]+/g, '_').slice(0, 120);

const any = pl => db.profiles().some(p => platforms.P[pl].ok(p));
// what the dashboard may see of a profile (never the tokens)
function publicProfile(p) {
  const P = platforms.P, m = p.meta || {};
  return {
    id: p.id, name: p.name, color: p.color || '',
    youtube: { ok: P.youtube.ok(p), label: p.yt?.channel || '', problem: p.yt?.problem || '', own_client: !!(p.yt?.client_id && p.yt?.client_secret) },
    facebook: { ok: P.facebook.ok(p), label: m.page_name || '', problem: m.problem || '', expires: m.expires ?? -1, data_expires: m.data_expires || 0, missing: m.missing || [], pages: m.pages || [], page_id: m.page_id || '' },
    instagram: { ok: P.instagram.ok(p), label: m.ig_username ? '@' + m.ig_username : '', problem: m.problem || '' },
    linkedin: { ok: P.linkedin.ok(p), label: p.li?.name || '', problem: p.li?.problem || '', expires_at: p.li?.expires_at || 0, was: !!p.li?.token },
    x: { ok: P.x.ok(p), label: p.x?.username ? '@' + p.x.username : '', problem: p.x?.problem || '' }
  };
}

function publicState() {
  const s = db.settings();
  const settings = {};
  for (const k of EDITABLE) settings[k] = SECRETS.includes(k) ? (s[k] ? '••••' + String(s[k]).slice(-4) : '') : s[k];
  const jobs = db.jobs();
  const count = st => jobs.filter(j => j.status === st).length;
  const weekAgo = Date.now() - 7 * 864e5;
  return {
    version: VERSION,
    settings,
    connections: {
      gemini: !!s.gemini_key, groq: !!s.groq_key, writer: !!(s.gemini_key || s.groq_key), pexels: !!s.pexels_key, freesound: !!s.freesound_key, pollinations: !!s.pollinations_token,
      telegram: !!(s.telegram_token && s.telegram_chat_id), telegram_token: !!s.telegram_token, telegram_bot: s.telegram_bot,
      youtube: any('youtube'), instagram: any('instagram'), facebook: any('facebook'), linkedin: any('linkedin'), x: any('x'),
      youtube_client: !!(s.yt_client_id && s.yt_client_secret), meta_app: !!(s.meta_app_id && s.meta_app_secret), meta_app_id: s.meta_app_id,
      linkedin_app: !!(s.li_client_id && s.li_client_secret), x_app: !!(s.x_client_id && s.x_client_secret), oauth_redirect: s.oauth_redirect,
      kaggle: kaggle.ready(), veo_key: !!s.veo_key, veo_model: s.veo_model, veo_spent: veo.spent(), veo_rate: veo.rate()
    },
    profiles: db.profiles().map(publicProfile),
    brand: brand.info(),
    online: online.snapshot(),
    cf: tunnel.status(),
    callback_url: oauth.callbackUrl(),
    stats: {
      making: count('queued') + count('working'), review: count('review'), flow: count('flow'), published: count('published'),
      week: jobs.filter(j => j.status === 'published' && (j.published_at || 0) > weekAgo).length,
      failed: count('failed') + count('failed_upload')
    },
    styles: Object.fromEntries(Object.entries(visuals.STYLES).map(([k, v]) => [k, v.label])),
    music: visuals.musicList()
  };
}

const slimJob = j => ({ ...j, log: (j.log || []).slice(-1), script: undefined, flow_msgs: undefined, shots: j.script?.shots?.length || 0 });

// ---------- routes ----------
const routes = [];
const route = (method, pattern, handler, open = false) => routes.push({ method, pattern, handler, open });

route('GET', /^\/api\/boot$/, (req, res) => send(res, 200, { needsPassword: !db.settings().password_hash, authed: authed(req), version: VERSION, brand: brand.info() }), true);

route('POST', /^\/api\/setup-password$/, async (req, res) => {
  if (db.settings().password_hash) return send(res, 400, { error: 'Password is already set.' });
  const { password } = await body(req);
  if (!password || password.length < 6) return send(res, 400, { error: 'Use at least 6 characters.' });
  db.updateSettings({ password_hash: hashPw(password) });
  login(res, req); send(res, 200, { ok: true });
}, true);

const attempts = new Map();
route('POST', /^\/api\/login$/, async (req, res) => {
  const ip = clientIp(req);
  const a = attempts.get(ip) || { n: 0, t: 0 };
  if (a.n >= 8 && Date.now() - a.t < 10 * 60000) return send(res, 429, { error: 'Too many tries. Wait 10 minutes.' });
  const { password } = await body(req);
  if (!checkPw(password, db.settings().password_hash)) { attempts.set(ip, { n: a.n + 1, t: Date.now() }); return send(res, 401, { error: 'Wrong password.' }); }
  attempts.delete(ip); login(res, req); send(res, 200, { ok: true });
}, true);

route('POST', /^\/api\/logout$/, (req, res) => {
  delete db.state.sessions[cookies(req).lumen]; db.save();
  res.setHeader('Set-Cookie', 'lumen=; Path=/; Max-Age=0'); send(res, 200, { ok: true });
});

route('POST', /^\/api\/password$/, async (req, res) => {
  const { current, password } = await body(req);
  if (!checkPw(current, db.settings().password_hash)) return send(res, 400, { error: 'Current password is wrong.' });
  if (!password || password.length < 6) return send(res, 400, { error: 'Use at least 6 characters.' });
  db.updateSettings({ password_hash: hashPw(password) }); send(res, 200, { ok: true });
});

route('GET', /^\/api\/state$/, (req, res) => {
  const s = db.settings();
  if (!s.public_url && req.headers.host) db.updateSettings({ public_url: `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}` });
  send(res, 200, publicState());
});

route('POST', /^\/api\/settings$/, async (req, res) => {
  const b = await body(req); const patch = {};
  for (const k of EDITABLE) {
    if (!(k in b)) continue;
    if (SECRETS.includes(k)) { if (b[k] === null) patch[k] = ''; else if (typeof b[k] === 'string' && b[k].trim() && !b[k].startsWith('••••')) patch[k] = b[k].trim(); }
    else patch[k] = b[k];
  }
  if ('veo_tier' in patch || 'veo_key' in patch) patch.veo_model = '';
  if ('telegram_token' in patch) { patch.telegram_chat_id = ''; patch.telegram_bot = ''; patch.telegram_offset = 0; telegram.resetOffset(); }
  if ('yt_client_id' in patch || 'yt_client_secret' in patch) {
    const s0 = db.settings();
    if ((patch.yt_client_id ?? s0.yt_client_id) !== s0.yt_client_id || ('yt_client_secret' in patch && patch.yt_client_secret !== s0.yt_client_secret))
      for (const p of db.profiles()) if (!(p.yt?.client_id && p.yt?.client_secret) && p.yt?.refresh) youtube.disconnect(p.id);
  }
  if ('default_targets' in patch) patch.default_targets = platforms.clean(patch.default_targets);
  if ('oauth_redirect' in patch) patch.oauth_redirect = String(patch.oauth_redirect || '').trim();
  db.updateSettings(patch);
  send(res, 200, publicState());
});

route('POST', /^\/api\/test\/(\w+)$/, async (req, res, m) => {
  const s = db.settings(); const svc = m[1];
  try {
    if (svc === 'gemini' || svc === 'groq') {
      const r = await gemini.generate('Return this JSON exactly: {"ok": true}', { only: svc });
      if (!r.ok) throw new Error('Unexpected reply');
      return send(res, 200, { ok: true, message: svc === 'gemini' ? `Gemini works (${db.settings().gemini_model}).` : `Groq works (${db.settings().groq_model || 'default model'}).` });
    }
    if (svc === 'pexels') { const r = await fetch('https://api.pexels.com/v1/search?query=ocean&per_page=1', { headers: { Authorization: s.pexels_key } }); if (!r.ok) throw new Error('Pexels rejected the key (' + r.status + ')'); return send(res, 200, { ok: true, message: 'Pexels works.' }); }
    if (svc === 'freesound') { const r = await fetch(`https://freesound.org/apiv2/search/text/?query=rain&page_size=1&token=${encodeURIComponent(s.freesound_key)}`); if (!r.ok) throw new Error('Freesound rejected the key (' + r.status + ')'); return send(res, 200, { ok: true, message: 'Freesound works.' }); }
    if (svc === 'pollinations') { const tmp = path.join(ensureDir(path.join(DATA, 'tmp')), 'poll.jpg'); await visuals.aiImage({ prompt: 'a red apple on a table', ratio: '1:1', seed: 1, dest: tmp, token: s.pollinations_token }); return send(res, 200, { ok: true, message: 'Image generation works.' }); }
    if (svc === 'telegram') { const u = await telegram.test(); db.updateSettings({ telegram_bot: u }); return send(res, 200, { ok: true, message: `Bot @${u} is ready.`, bot: u }); }
    if (svc === 'veo') return send(res, 200, { ok: true, message: await veo.test() });
    if (svc === 'kaggle') return send(res, 200, { ok: true, message: await kaggle.test() });
    if (svc === 'voice') { const v = await tts.listVoices(true); return send(res, 200, { ok: true, message: `${v.length} voices available.` }); }
    send(res, 404, { error: 'Unknown service' });
  } catch (e) { send(res, 400, { error: e.message }); }
});

route('GET', /^\/api\/voices$/, async (req, res) => {
  try { send(res, 200, { voices: await tts.listVoices() }); }
  catch (e) { send(res, 500, { error: 'Voice list unavailable: ' + e.message.slice(0, 200) }); }
});

route('POST', /^\/api\/voice-preview$/, async (req, res) => {
  const { voice, text } = await body(req);
  const dir = ensureDir(path.join(DATA, 'tmp'));
  const file = path.join(dir, `preview-${safeName(voice)}.mp3`);
  try { await tts.speak({ text: String(text || 'Hello! This is how your videos will sound.').slice(0, 300), voice, dest: file }); serveFile(req, res, file); }
  catch (e) { send(res, 500, { error: e.message }); }
});

route('POST', /^\/api\/repair-voice$/, async (req, res) => {
  try { const v = await tts.repair(); send(res, 200, { ok: true, message: `Voice engine updated. ${v.length} voices available.` }); }
  catch (e) { send(res, 500, { error: e.message.slice(0, 300) }); }
});

route('POST', /^\/api\/ideas$/, async (req, res) => {
  const { niche, language } = await body(req);
  try { send(res, 200, { ideas: await gemini.ideas(niche, language || db.settings().default_language) }); }
  catch (e) { send(res, 400, { error: e.message }); }
});

// jobs
route('GET', /^\/api\/jobs$/, (req, res) => send(res, 200, { jobs: db.jobs().slice(0, 300).map(slimJob) }));
route('GET', /^\/api\/jobs\/(\w+)$/, (req, res, m) => { const j = db.job(m[1]); j ? send(res, 200, { job: j }) : send(res, 404, { error: 'Not found' }); });
route('POST', /^\/api\/jobs$/, async (req, res) => {
  const b = await body(req);
  if (!gemini.hasWriter()) return send(res, 400, { error: 'Connect a script writer first (Gemini or Groq, on the Connections page).' });
  const n = Math.max(1, Math.min(10, Number(b.count || 1)));
  const jobs = [];
  for (let i = 0; i < n; i++) jobs.push(pipeline.createJob({ ...b, topic: i === 0 ? b.topic : '' }));
  const keep = {};
  for (const k of ['language', 'voice', 'style', 'ratio', 'duration', 'niche', 'engine']) if (b[k]) keep['default_' + k] = b[k];
  db.updateSettings(keep);
  send(res, 200, { jobs: jobs.map(slimJob) });
});
route('POST', /^\/api\/jobs\/(\w+)\/(approve|reject|remake|rerender|publish)$/, async (req, res, m) => {
  const [, id, act] = m;
  if (!db.job(id)) return send(res, 404, { error: 'Not found' });
  if (act === 'approve' || act === 'publish') await pipeline.approve(id);
  if (act === 'reject') pipeline.reject(id);
  if ((act === 'remake' || act === 'rerender') && ['repurpose', 'upload'].includes(db.job(id).source)) return send(res, 400, { error: 'Your own uploaded videos cannot be remade. Upload them again instead.' });
  if (act === 'remake') pipeline.remake(id, { newScript: true });
  if (act === 'rerender') pipeline.remake(id, { newScript: false });
  send(res, 200, { job: db.job(id) });
});
route('POST', /^\/api\/jobs\/(\w+)\/meta$/, async (req, res, m) => {
  const b = await body(req); const p = {};
  if (typeof b.title === 'string') p.title = b.title.slice(0, 100);
  if (typeof b.description === 'string') p.description = b.description.slice(0, 4500);
  if (Array.isArray(b.tags)) p.tags = b.tags.map(String).slice(0, 30);
  if (Array.isArray(b.hashtags)) p.hashtags = b.hashtags.map(String).slice(0, 15);
  if (Array.isArray(b.targets)) p.targets = platforms.clean(b.targets);
  send(res, 200, { job: db.updateJob(m[1], p) });
});
route('DELETE', /^\/api\/jobs\/(\w+)$/, (req, res, m) => {
  const j = db.job(m[1]);
  if (j && j.status === 'working') return send(res, 400, { error: 'This video is being made right now. Delete it when it finishes.' });
  if (j && j.status === 'uploading') return send(res, 400, { error: 'This video is being posted right now. Delete it when posting finishes.' });
  pipeline.remove(m[1]); send(res, 200, { ok: true });
});

// autopilot
route('GET', /^\/api\/schedules$/, (req, res) => send(res, 200, { schedules: db.schedules(), now: scheduler.now(db.settings().timezone) }));
route('POST', /^\/api\/schedules$/, async (req, res) => {
  const b = await body(req);
  const s = {
    id: b.id || uid(), name: String(b.name || 'Autopilot').slice(0, 60), enabled: b.enabled !== false,
    niche: String(b.niche || ''), topics: (Array.isArray(b.topics) ? b.topics : String(b.topics || '').split('\n')).map(t => t.trim()).filter(Boolean),
    days: Array.isArray(b.days) && b.days.length ? b.days : scheduler.DAYS,
    times: (Array.isArray(b.times) ? b.times : String(b.times || '').split(/[,\s]+/)).map(scheduler.normTime).filter(Boolean),
    language: b.language, voice: b.voice, style: b.style, ratio: b.ratio, duration: Number(b.duration) || 45,
    auto_approve: !!b.auto_approve, topic_source: b.topic_source === 'trends' ? 'trends' : 'niche', engine: ['veo', 'flow'].includes(b.engine) ? b.engine : 'lumen', motion: b.motion === undefined ? undefined : !!b.motion, created: b.created || Date.now(),
    targets: Array.isArray(b.targets) ? platforms.clean(b.targets) : undefined
  };
  if (!s.times.length) return send(res, 400, { error: 'Add at least one time, like 09:00.' });
  const old = db.schedule(s.id); if (old) { s.last_key = old.last_key; s.last_run = old.last_run; s.done_keys = old.done_keys; }
  s.armed_key = scheduler.now(db.settings().timezone); s.armed_key = s.armed_key.date + ' ' + s.armed_key.hm;
  db.saveSchedule(s); send(res, 200, { schedule: s });
});
route('DELETE', /^\/api\/schedules\/(\w+)$/, (req, res, m) => { db.removeSchedule(m[1]); send(res, 200, { ok: true }); });

// ---------- online access (Cloudflare Tunnel) ----------
route('GET', /^\/api\/online$/, async (req, res) => send(res, 200, await online.status(true)));
route('POST', /^\/api\/online\/(login|go|off|door)$/, async (req, res, m) => {
  try {
    const b = await body(req);
    const r = m[1] === 'login' ? await online.login() : m[1] === 'go' ? await online.goOnline() : m[1] === 'off' ? await online.goOffline() : await online.testDoor(b.door);
    send(res, 200, r);
  } catch (e) { send(res, 400, { error: e.message }); }
});
// Advanced: Cloudflare Tunnel for a domain whose DNS is on Cloudflare
route('POST', /^\/api\/online\/cloudflare$/, async (req, res) => {
  const b = await body(req); const patch = {};
  if (typeof b.address === 'string') {
    let a = b.address.trim().replace(/\/+$/, '');
    if (a && !/^https?:\/\//i.test(a)) a = 'https://' + a;
    if (a && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(a)) return send(res, 400, { error: 'Type the address like studio.kmr-groups.com' });
    patch.public_url = a;
  }
  if (typeof b.token === 'string' && b.token.trim()) {
    const t = tunnel.extractToken(b.token);
    if (!t) return send(res, 400, { error: 'That does not contain a Cloudflare tunnel token. Copy the whole command Cloudflare shows (it contains a long code starting with eyJ) and paste it here.' });
    patch.tunnel_token = t;
  }
  if (typeof b.enabled === 'boolean') patch.tunnel_enabled = b.enabled;
  db.updateSettings(patch);
  const st = db.settings().tunnel_enabled ? await tunnel.restart() : (tunnel.stop(), tunnel.status());
  send(res, 200, st);
});

// ---------- branding (logo) ----------
route('PUT', /^\/api\/brand\/logo$/, async (req, res) => {
  const name = safeName(new URL(req.url, 'http://x').searchParams.get('name') || 'logo.png');
  const ext = (path.extname(name) || '.png').toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.svg'].includes(ext)) return send(res, 400, { error: 'Use a PNG, JPG, WEBP or SVG logo.' });
  const tmp = path.join(ensureDir(path.join(DATA, 'tmp')), 'logo_' + uid() + ext);
  try { await toFile(req, tmp, 8e6); send(res, 200, { brand: await brand.setLogo(tmp, ext) }); }
  catch (e) { fs.rmSync(tmp, { force: true }); send(res, 400, { error: e.message }); }
});
route('DELETE', /^\/api\/brand\/logo$/, (req, res) => send(res, 200, { brand: brand.clearLogo() }));
route('POST', /^\/api\/brand$/, async (req, res) => send(res, 200, { brand: await brand.setBackground((await body(req)).bg) }));
route('GET', /^\/brand\/(logo|icon-192\.png|icon-512\.png)$/, (req, res, m) => { const f = brand.file(m[1]); f ? serveFile(req, res, f, 'no-cache') : serveFile(req, res, path.join(PUBLIC, m[1] === 'logo' ? 'icon.svg' : m[1])); }, true);
route('GET', /^\/manifest\.webmanifest$/, (req, res) => { res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'no-cache' }); res.end(JSON.stringify(brand.manifest())); }, true);

// ---------- profiles (people or brands, each with its own accounts) ----------
const profileOr404 = (res, id) => { const p = db.profile(id); if (!p) send(res, 404, { error: 'Profile not found.' }); return p; };
route('POST', /^\/api\/profiles$/, async (req, res) => {
  const b = await body(req);
  const name = String(b.name || '').trim().slice(0, 40);
  if (!name) return send(res, 400, { error: 'Give the profile a name.' });
  const p = db.addProfile({ id: uid(), name, created: Date.now(), yt: {}, meta: {}, li: {}, x: {} });
  send(res, 200, { profile: publicProfile(p) });
});
route('POST', /^\/api\/profiles\/(\w+)$/, async (req, res, m) => {
  if (!profileOr404(res, m[1])) return;
  const b = await body(req);
  const name = String(b.name || '').trim().slice(0, 40);
  if (name) db.updateProfile(m[1], { name });
  send(res, 200, { profile: publicProfile(db.profile(m[1])) });
});
route('DELETE', /^\/api\/profiles\/(\w+)$/, (req, res, m) => {
  if (!profileOr404(res, m[1])) return;
  if (db.profiles().length < 2) return send(res, 400, { error: 'Keep at least one profile.' });
  db.removeProfile(m[1]);
  db.updateSettings({ default_targets: platforms.clean(db.settings().default_targets) });
  for (const sc of db.schedules()) if (Array.isArray(sc.targets)) { sc.targets = platforms.clean(sc.targets); db.saveSchedule(sc); }
  send(res, 200, { ok: true });
});
// YouTube (device code sign-in)
route('POST', /^\/api\/profiles\/(\w+)\/youtube\/start$/, async (req, res, m) => { try { send(res, 200, await youtube.startDevice(m[1])); } catch (e) { send(res, 400, { error: e.message }); } });
route('GET', /^\/api\/youtube\/status$/, (req, res) => send(res, 200, youtube.allStatus()));
route('POST', /^\/api\/profiles\/(\w+)\/youtube\/client$/, async (req, res, m) => {
  const b = await body(req);
  try { youtube.setOwnClient(m[1], b.client_id, b.client_secret); send(res, 200, { ok: true }); } catch (e) { send(res, 400, { error: e.message }); }
});
// Instagram and Facebook
route('POST', /^\/api\/profiles\/(\w+)\/meta\/connect$/, async (req, res, m) => {
  try { const r = await meta.connect(m[1], await body(req)); pipeline.accountsChanged(); send(res, 200, r); }
  catch (e) { send(res, 400, { error: e.message }); }
});
// LinkedIn and X (web sign-in through the return page)
route('POST', /^\/api\/profiles\/(\w+)\/(linkedin|x)\/start$/, async (req, res, m) => {
  if (!profileOr404(res, m[1])) return;
  const b = await body(req);
  try { send(res, 200, { url: (m[2] === 'linkedin' ? linkedin : xapi).authUrl(m[1], b.base || db.settings().public_url) }); }
  catch (e) { send(res, 400, { error: e.message }); }
});
route('POST', /^\/api\/oauth\/paste$/, async (req, res) => {
  try { send(res, 200, await oauth.finish(oauth.parsePasted((await body(req)).link))); }
  catch (e) { send(res, 400, { error: e.message }); }
});
route('GET', /^\/oauth\/callback$/, async (req, res) => {
  const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  let ok = true, msg;
  try { const r = await oauth.finish(q); msg = `${r.kind === 'linkedin' ? 'LinkedIn' : 'X'} is connected for ${r.profile} (${r.who}).`; }
  catch (e) { ok = false; msg = e.message; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KMR Studio</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#120D19;color:#F6F0E8;font:16px system-ui;padding:24px">
<div style="max-width:420px;text-align:center"><div style="font-size:52px">${ok ? '✅' : '⚠️'}</div><h1 style="font-size:22px">${ok ? 'Connected' : 'Not connected'}</h1>
<p style="color:#A898B9">${String(msg).replace(/[<>&]/g, '')}</p><p style="color:#A898B9">You can close this page.</p>
<a href="/#connections" style="color:#FFB547">Open KMR Studio</a></div></body>`);
}, true);
// checks and disconnects for any platform
route('POST', /^\/api\/profiles\/(\w+)\/(youtube|meta|linkedin|x)\/(check|disconnect)$/, async (req, res, m) => {
  const p = profileOr404(res, m[1]); if (!p) return;
  const [, pid, pl, act] = m;
  try {
    if (act === 'disconnect') { ({ youtube, meta, linkedin, x: xapi })[pl].disconnect(pid); return send(res, 200, { ok: true }); }
    let message;
    if (pl === 'meta') message = await meta.check(pid);
    else if (pl === 'youtube') { const ch = await youtube.channel(pid); db.updateAccount(pid, 'yt', { problem: '', channel: ch?.title || p.yt.channel }); message = `${p.name}: YouTube channel "${ch?.title || '?'}" works.`; }
    else if (pl === 'linkedin') { if (!linkedin.connected(p)) throw new Error('LinkedIn is not connected or its 60-day login ended. Press Reconnect.'); message = `${p.name}: LinkedIn works until ${new Date(p.li.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}.`; }
    else { const r = await fetch('https://api.x.com/2/users/me', { headers: { Authorization: 'Bearer ' + await require('./lib/x').tokenFor(p) } }).then(r => r.json()); if (!r.data) throw new Error('X: ' + (r.detail || r.title || 'login not working')); message = `${p.name}: X @${r.data.username} works.`; }
    send(res, 200, { ok: true, message });
  } catch (e) { send(res, 400, { error: e.message }); }
});

// Flow mode: upload clips made in Google Flow
route('PUT', /^\/api\/jobs\/(\w+)\/clip$/, async (req, res, m) => {
  const j = db.job(m[1]);
  if (!j || j.status !== 'flow') return send(res, 400, { error: 'This video is not waiting for Flow clips.' });
  const u = new URL(req.url, 'http://x');
  const n = Number(u.searchParams.get('shot'));
  const ext = (path.extname(u.searchParams.get('name') || '.mp4') || '.mp4').toLowerCase();
  if (!(n >= 0 && n < (j.script?.shots || []).length)) return send(res, 400, { error: 'Unknown shot number.' });
  if (!['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) return send(res, 400, { error: 'Upload the MP4 you downloaded from Flow.' });
  const tmp = path.join(ensureDir(path.join(DATA, 'tmp')), `clip_${uid()}${ext}`);
  try { await toFile(req, tmp, 1e9); } catch (e) { return send(res, 400, { error: e.message }); }
  try { send(res, 200, await pipeline.attachClip(j.id, n, tmp, ext)); }
  catch (e) { send(res, 400, { error: e.message }); }
});
route('DELETE', /^\/api\/jobs\/(\w+)\/clip\/(\d+)$/, (req, res, m) => send(res, 200, { job: pipeline.removeClip(m[1], Number(m[2])) }));
route('POST', /^\/api\/jobs\/(\w+)\/finish-flow$/, (req, res, m) => {
  try { send(res, 200, { job: pipeline.flowFinish(m[1]) }); }
  catch (e) { send(res, 400, { error: e.message }); }
});
route('POST', /^\/api\/jobs\/(\w+)\/resend-flow$/, async (req, res, m) => {
  const j = db.job(m[1]);
  if (!j || j.status !== 'flow') return send(res, 400, { error: 'This video is not waiting for Flow clips.' });
  if (!db.settings().telegram_chat_id) return send(res, 400, { error: 'Connect Telegram first (Connections page).' });
  try { await telegram.sendFlow(j); send(res, 200, { ok: true }); }
  catch (e) { send(res, 400, { error: e.message }); }
});

// viral analysis
route('GET', /^\/api\/trends$/, (req, res) => send(res, 200, { trends: db.trends() }));
route('POST', /^\/api\/trends$/, async (req, res) => {
  try { send(res, 200, { trend: await trends.analyze(await body(req)) }); }
  catch (e) { send(res, 400, { error: e.message }); }
});
route('DELETE', /^\/api\/trends\/(\w+)$/, (req, res, m) => { db.removeTrend(m[1]); send(res, 200, { ok: true }); });

// video to video (long video -> Shorts)
route('PUT', /^\/api\/tools\/upload-video$/, async (req, res) => {
  const orig = safeName(new URL(req.url, 'http://x').searchParams.get('name') || 'video.mp4');
  const ext = (path.extname(orig) || '.mp4').toLowerCase();
  if (!['.mp4', '.mov', '.mkv', '.webm', '.m4v', '.avi'].includes(ext)) return send(res, 400, { error: 'Use an MP4, MOV, MKV, WEBM or AVI video.' });
  const name = 'src_' + uid() + ext;
  try { await toFile(req, path.join(pipeline.toolDir(), name), 4e9); send(res, 200, { source: name, name: orig }); }
  catch (e) { send(res, 400, { error: e.message }); }
});
route('POST', /^\/api\/tools\/repurpose$/, async (req, res) => {
  const b = await body(req);
  if (!b.source) return send(res, 400, { error: 'Upload a video first.' });
  if (!gemini.hasWriter()) return send(res, 400, { error: 'Connect Groq or Gemini first. They transcribe and pick the best moments.' });
  send(res, 200, { tool: repurpose.create(b) });
});

// upload and post your own videos
route('PUT', /^\/api\/uploads\/file$/, async (req, res) => {
  const orig = safeName(new URL(req.url, 'http://x').searchParams.get('name') || 'video.mp4');
  const ext = (path.extname(orig) || '.mp4').toLowerCase();
  if (!uploads.VIDEO_EXT.includes(ext)) return send(res, 400, { error: `${orig}: use an MP4, MOV, MKV, WEBM or AVI video.` });
  const tmp = path.join(ensureDir(path.join(DATA, 'tmp')), 'upl_' + uid() + ext);
  try { await toFile(req, tmp, 8e9); } catch (e) { return send(res, 400, { error: e.message }); }
  try { send(res, 200, { upload: await uploads.stage(tmp, orig) }); }
  catch (e) { fs.rmSync(tmp, { force: true }); send(res, 400, { error: e.message }); }
});
route('DELETE', /^\/api\/uploads\/file\/([\w.]+)$/, (req, res, m) => { uploads.unstage(m[1]); send(res, 200, { ok: true }); });
route('GET', /^\/staged\/([\w.]+)$/, (req, res, m) => serveFile(req, res, path.join(uploads.STAGE(), safeName(m[1])), 'private, max-age=3600'));
route('POST', /^\/api\/uploads\/post$/, async (req, res) => {
  try { send(res, 200, { jobs: uploads.createPosts(await body(req)).map(slimJob) }); }
  catch (e) { send(res, 400, { error: e.message }); }
});
route('POST', /^\/api\/uploads\/ai-text$/, async (req, res) => {
  try { send(res, 200, await uploads.writeText(await body(req))); }
  catch (e) { send(res, 400, { error: e.message }); }
});


// tools
route('GET', /^\/api\/tools$/, (req, res) => send(res, 200, { tools: db.tools() }));
route('PUT', /^\/api\/tools\/upload$/, async (req, res) => {
  const orig = safeName(new URL(req.url, 'http://x').searchParams.get('name') || 'image.jpg');
  const ext = (path.extname(orig) || '.jpg').toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return send(res, 400, { error: 'Use a JPG, PNG or WEBP picture.' });
  const name = 'up_' + uid() + ext;
  try { await toFile(req, path.join(pipeline.toolDir(), name), 25e6); send(res, 200, { image: name }); }
  catch (e) { send(res, 400, { error: e.message }); }
});
route('POST', /^\/api\/tools\/image$/, async (req, res) => {
  const b = await body(req);
  if (!b.prompt) return send(res, 400, { error: 'Describe the picture first.' });
  const n = Math.max(1, Math.min(4, Number(b.count) || 2));
  const look = (visuals.STYLES[b.style] || visuals.STYLES.cartoon).prompt;
  const made = [];
  for (let i = 0; i < n; i++) {
    const t = { id: uid(), created: Date.now(), kind: 'image', prompt: String(b.prompt).slice(0, 1200), ratio: b.ratio || '1:1', style: b.style, status: 'done' };
    t.file = t.id + '.jpg';
    try {
      await visuals.aiImage({ prompt: `${b.prompt}. ${look}. No text, no watermark.`, ratio: t.ratio, seed: Math.floor(Math.random() * 1e9), dest: path.join(pipeline.toolDir(), t.file), token: db.settings().pollinations_token });
      db.addTool(t); made.push(t);
    } catch (e) { if (!made.length && i === n - 1) return send(res, 500, { error: 'The image service is busy. Try again in a minute, or add a free Pollinations token in Connections.' }); }
  }
  send(res, 200, { tools: made });
});
route('POST', /^\/api\/tools\/video$/, async (req, res) => {
  const b = await body(req);
  if (!kaggle.ready()) return send(res, 400, { error: 'Connect Kaggle (free GPU) in Connections first.' });
  if (!b.prompt && !b.image) return send(res, 400, { error: 'Describe the motion you want.' });
  send(res, 200, { tool: pipeline.createTool({ kind: b.image ? 'i2v' : 't2v', prompt: b.prompt || 'natural smooth motion, subtle camera movement', ratio: b.ratio, seconds: b.seconds, image: b.image }) });
});
route('DELETE', /^\/api\/tools\/(\w+)$/, (req, res, m) => {
  const t = db.tool(m[1]);
  if (t && t.status === 'working') return send(res, 400, { error: 'This clip is being made right now.' });
  if (t) for (const f of [t.file, t.image, t.source]) if (f) fs.rmSync(path.join(pipeline.toolDir(), f), { force: true });
  db.removeTool(m[1]); send(res, 200, { ok: true });
});
route('GET', /^\/tools\/([\w.\-]+)$/, (req, res, m) => serveFile(req, res, path.join(pipeline.toolDir(), safeName(m[1])), 'private, max-age=86400'));

// music library
route('PUT', /^\/api\/music$/, async (req, res) => {
  const name = safeName(new URL(req.url, 'http://x').searchParams.get('name') || 'track.mp3');
  if (!/\.(mp3|m4a|wav|ogg|aac)$/i.test(name)) return send(res, 400, { error: 'Use mp3, m4a, wav, ogg or aac files.' });
  try { await toFile(req, path.join(visuals.MUSIC_DIR(), name), 40e6); send(res, 200, { music: visuals.musicList() }); }
  catch (e) { send(res, 400, { error: e.message }); }
});
route('DELETE', /^\/api\/music\/(.+)$/, (req, res, m) => {
  fs.rmSync(path.join(visuals.MUSIC_DIR(), safeName(decodeURIComponent(m[1]))), { force: true });
  send(res, 200, { music: visuals.musicList() });
});

// update
route('POST', /^\/api\/update$/, async (req, res) => {
  const zip = path.join(ensureDir(path.join(DATA, 'tmp')), 'update.zip');
  try {
    await toFile(req, zip, 300e6);
    const v = await updater.applyZip(zip);
    send(res, 200, { ok: true, version: v });
    setTimeout(() => { db.flush(); process.exit(0); }, 800); // the service restarts us on the new code
  } catch (e) { send(res, 400, { error: e.message }); }
});

// media
route('GET', /^\/media\/(\w+)\/([\w.\-]+)$/, (req, res, m) => serveFile(req, res, path.join(pipeline.jobDir(m[1]), safeName(m[2])), 'private, max-age=3600'));
route('GET', /^\/music\/(.+)$/, (req, res, m) => serveFile(req, res, path.join(visuals.MUSIC_DIR(), safeName(decodeURIComponent(m[1])))));

// Checks every profile's logins twice a day and warns on Telegram before LinkedIn's 60-day login ends.
async function dailyChecks() {
  try { const o = await online.status(true); if (o.funnel && db.settings().door_url) await online.testDoor(); } catch {}
  for (const p of db.profiles()) {
    if (p.meta?.page_token) await meta.check(p.id).catch(e => telegram.notify(`⚠️ <b>${telegram.esc(p.name)}</b>: Instagram/Facebook login problem. ${telegram.esc(e.message)}`).catch(() => {}));
    const li = p.li || {};
    if (li.token && li.expires_at) {
      const days = Math.ceil((li.expires_at - Date.now()) / 864e5);
      if (days <= 7 && Date.now() - (li.reminded || 0) > 20 * 3600000) {
        db.updateAccount(p.id, 'li', { reminded: Date.now() });
        telegram.notify(days > 0 ? `🔔 LinkedIn login for <b>${telegram.esc(p.name)}</b> ends in ${days} day${days > 1 ? 's' : ''}. Open KMR Studio, Connections, and press Reconnect next to LinkedIn (one click).`
          : `⚠️ LinkedIn login for <b>${telegram.esc(p.name)}</b> has ended. Open KMR Studio, Connections, and press Reconnect next to LinkedIn.`).catch(() => {});
      }
    }
  }
}

// ---------- server ----------
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = p.match(r.pattern);
      if (!m) continue;
      if (!r.open && !authed(req)) return send(res, 401, { error: 'Please sign in.' });
      return await r.handler(req, res, m);
    }
    if (p.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    const file = path.join(PUBLIC, p === '/' ? 'index.html' : path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (file.startsWith(PUBLIC) && fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(req, res, file);
    serveFile(req, res, path.join(PUBLIC, 'index.html'));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: e.message });
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') {
    console.log(`KMR Studio is already running on port ${PORT}. Open http://localhost:${PORT} in your browser.`);
    setTimeout(() => process.exit(1), 60000); // wait before the start script tries again
  } else { console.error(e); process.exit(1); }
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`KMR Studio ${VERSION} running on port ${PORT}`);
  pipeline.start();
  tunnel.start().catch(() => {});
  try { uploads.sweep(); } catch {}
  setTimeout(dailyChecks, 60000); setInterval(dailyChecks, 12 * 3600000);
  // online status and the website address check, soon after start
  setTimeout(async () => { try { const o = await online.status(true); if (o.funnel && db.settings().door_url) await online.testDoor(); } catch {} }, 15000);
  repurpose.start();
  scheduler.start();
  telegram.loop();
  tts.listVoices().catch(() => {});
});
