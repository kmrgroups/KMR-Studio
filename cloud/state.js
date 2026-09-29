// Everything KMR Studio Cloud remembers: settings (app keys), profiles with their accounts, and post jobs.
const crypto = require('crypto');
const kv = require('./kv');

const uid = () => Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
const PLATFORMS = [['youtube', 'YouTube'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'], ['x', 'X']];
const PKEYS = PLATFORMS.map(p => p[0]);
const SECTION = { youtube: 'yt', instagram: 'meta', facebook: 'meta', linkedin: 'li', x: 'x' };

const DEFAULTS = {
  yt_client_id: '', yt_client_secret: '', meta_app_id: '', meta_app_secret: '', li_client_id: '', li_client_secret: '',
  x_client_id: '', x_client_secret: '', gemini_key: '', groq_key: '', telegram_token: '', telegram_chat_id: '', telegram_bot: '', approve_default: true, yt_privacy: 'public', default_targets: [], x_post_limit: 280, meta_graph_version: 'v23.0', logo: '', auto_text: true, auto_thumb: true, text_language: 'English', veo_key_1: '', veo_key_2: '', veo_limit: 9
};
const SECRET_KEYS = ['yt_client_secret', 'meta_app_secret', 'li_client_secret', 'x_client_secret', 'gemini_key', 'groq_key', 'telegram_token', 'veo_key_1', 'veo_key_2'];

async function settings() { return { ...DEFAULTS, ...(await kv.getJ('settings') || {}) }; }
async function saveSettings(patch) {
  const s = await settings();
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULTS)) continue;
    if (SECRET_KEYS.includes(k) && (v === undefined || v === null || String(v).startsWith('••'))) continue; // keep the saved one
    s[k] = typeof DEFAULTS[k] === 'string' ? String(v ?? '').trim() : typeof DEFAULTS[k] === 'boolean' ? (v === true || v === 'true') : v;
  }
  await kv.setJ('settings', s);
  return s;
}
// What the page may see: secrets are only marked as saved.
function publicSettings(s) {
  const o = { ...s };
  for (const k of SECRET_KEYS) o[k] = s[k] ? '••••' + s[k].slice(-4) : '';
  return o;
}

// ---- profiles and their accounts ----
async function profiles() {
  let list = await kv.getJ('profiles');
  if (!Array.isArray(list) || !list.length) { list = [{ id: 'me', name: 'Me' }]; await kv.setJ('profiles', list); }
  return list;
}
async function profile(id) {
  const p = (await profiles()).find(x => x.id === id);
  if (!p) return null;
  const acc = await kv.hallJ('acc:' + id);
  return { ...p, yt: acc.yt || {}, meta: acc.meta || {}, li: acc.li || {}, x: acc.x || {}, mapp: acc.mapp || {} };
}
async function allProfiles() {
  const list = await profiles();
  if (!list.length) return [];
  const accs = await kv.pipeline(list.map(p => ['HGETALL', kv.P + 'acc:' + p.id]));
  return list.map((p, i) => {
    const a = accs[i] || [], o = {};
    for (let k = 0; k < a.length; k += 2) { try { o[a[k]] = JSON.parse(a[k + 1]); } catch {} }
    return { ...p, yt: o.yt || {}, meta: o.meta || {}, li: o.li || {}, x: o.x || {}, mapp: o.mapp || {} };
  });
}
async function addProfile(name) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) throw new Error('Type a name for the profile.');
  const list = await profiles();
  if (list.some(p => p.name.toLowerCase() === name.toLowerCase())) throw new Error('There is already a profile called ' + name + '.');
  let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'p';
  while (list.some(p => p.id === id)) id += Math.floor(Math.random() * 9);
  list.push({ id, name });
  await kv.setJ('profiles', list);
  return { id, name };
}
async function renameProfile(id, name) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) throw new Error('Type a name.');
  const list = await profiles();
  const p = list.find(x => x.id === id); if (!p) throw new Error('Profile not found.');
  p.name = name; await kv.setJ('profiles', list);
}
async function removeProfile(id) {
  const list = await profiles();
  if (list.length <= 1) throw new Error('Keep at least one profile.');
  await kv.setJ('profiles', list.filter(p => p.id !== id));
  await kv.del('acc:' + id);
  const s = await settings();
  await saveSettings({ default_targets: (s.default_targets || []).filter(t => !t.startsWith(id + ':')) });
}
async function account(pid, section) { return await kv.hgetJ('acc:' + pid, section) || {}; }
async function setAccount(pid, section, patch, replace) {
  const cur = replace ? {} : await account(pid, section);
  const next = { ...cur, ...patch };
  if (!Object.keys(next).length) await kv.hdel('acc:' + pid, section);
  else await kv.hsetJ('acc:' + pid, section, next);
  return next;
}

// Is this platform of this profile ready to post?
function connected(p, platform) {
  if (!p) return false;
  if (platform === 'youtube') return !!p.yt.refresh;
  if (platform === 'facebook') return !!p.meta.page_token;
  if (platform === 'instagram') return !!(p.meta.page_token && p.meta.ig_id);
  if (platform === 'linkedin') return !!(p.li.token && (!p.li.expires_at || p.li.expires_at > Date.now()));
  if (platform === 'x') return !!p.x.refresh;
  return false;
}
function label(p, platform) {
  if (platform === 'youtube') return p.yt.channel || '';
  if (platform === 'facebook') return p.meta.page_name || '';
  if (platform === 'instagram') return p.meta.ig_username ? '@' + p.meta.ig_username : '';
  if (platform === 'linkedin') return p.li.name || '';
  if (platform === 'x') return p.x.username ? '@' + p.x.username : '';
  return '';
}
function problem(p, platform) {
  const sec = p[SECTION[platform]] || {};
  if (platform === 'linkedin' && p.li.token && p.li.expires_at && p.li.expires_at < Date.now()) return 'The 60-day LinkedIn login ended. Press Connect again.';
  return sec.problem || '';
}
// Profiles as the page sees them: names, account labels, no tokens.
function publicProfile(p) {
  const o = { id: p.id, name: p.name };
  for (const k of PKEYS) o[k] = { ok: connected(p, k), label: label(p, k), problem: problem(p, k) };
  o.youtube.own_keys = !!(p.yt.client_id && p.yt.client_secret);
  o.facebook.own_app = p.mapp && p.mapp.app_id ? p.mapp.app_id : '';
  if (p.li.expires_at) o.linkedin.expires_at = p.li.expires_at;
  o.facebook.pages = p.meta.pages || [];
  return o;
}

// ---- jobs (one per video to post) ----
async function job(id) { return kv.getJ('job:' + id); }
async function saveJob(j) { j.updated = Date.now(); await kv.setJ('job:' + j.id, j); return j; }
async function addJob(j) { await saveJob(j); await kv.lpush('jobs', j.id); return j; }
async function patchJob(id, patch) { const j = await job(id); if (!j) return null; Object.assign(j, patch); return saveJob(j); }
async function removeJob(id) { await kv.del('job:' + id); await kv.del('res:' + id); await kv.lrem('jobs', id); }
async function jobIds(n = 60) { return await kv.lrange('jobs', 0, n - 1) || []; }
async function results(id) { return kv.hallJ('res:' + id); }
async function setResult(id, target, patch, replace) {
  const cur = replace ? {} : (await kv.hgetJ('res:' + id, target) || {});
  const next = { ...cur, ...patch, updated: Date.now() };
  await kv.hsetJ('res:' + id, target, next);
  return next;
}
async function log(id, msg) {
  const j = await job(id); if (!j) return;
  j.log = [...(j.log || []), { t: Date.now(), msg: String(msg).slice(0, 500) }].slice(-60);
  await saveJob(j);
}

module.exports = { uid, PLATFORMS, PKEYS, SECTION, settings, saveSettings, publicSettings, profiles, profile, allProfiles, addProfile, renameProfile, removeProfile, account, setAccount, connected, publicProfile, job, saveJob, addJob, patchJob, removeJob, jobIds, results, setResult, log };
