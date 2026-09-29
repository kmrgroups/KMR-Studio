// Tiny JSON database. Everything lives in data/db.json so app updates never touch it.
const fs = require('fs');
const path = require('path');
const { DATA, ensureDir } = require('./util');

const FILE = path.join(DATA, 'db.json');

const DEFAULT_SETTINGS = {
  password_hash: null,
  gemini_key: '', gemini_model: 'gemini-2.5-flash', groq_key: '', groq_model: '',
  pexels_key: '', freesound_key: '', pollinations_token: '',
  telegram_token: '', telegram_chat_id: '', telegram_bot: '', telegram_offset: 0,
  yt_client_id: '', yt_client_secret: '', yt_refresh_token: '', yt_channel: '',
  default_language: 'English', default_voice: 'en-US-AndrewNeural',
  default_style: 'cartoon', default_ratio: '9:16', default_duration: 45,
  default_niche: '', auto_approve: false,
  yt_privacy: 'public', quality: '1080', burn_subtitles: true, music_volume: 0.12,
  timezone: 'Asia/Kolkata', public_url: '',
  kaggle_username: '', kaggle_key: '', motion_default: false, motion_max_scenes: 6, motion_steps: 25, motion_model: 'Lightricks/LTX-Video',
  meta_app_id: '', meta_app_secret: '', meta_user_token: '', meta_page_id: '', meta_page_name: '', meta_page_token: '',
  meta_ig_id: '', meta_ig_username: '', meta_pages: [], meta_graph_version: 'v23.0',
  post_to: ['youtube', 'instagram', 'facebook'], default_targets: null, music_mode: 'match', sfx_enabled: true,
  li_client_id: '', li_client_secret: '', x_client_id: '', x_client_secret: '', oauth_redirect: '', x_post_limit: 280, tunnel_token: '', tunnel_enabled: false, brand_v: 0, door_url: 'https://studio.kmr-groups.com', door_ok: false, door_msg: '',
  default_engine: 'lumen', cinematic_voice: 'veo',
  veo_key: '', veo_model: '', veo_tier: 'lite', veo_resolution: '720p', veo_monthly_cap: 10, veo_spent: { month: '', usd: 0 }
};

let state;
function load() {
  ensureDir(DATA);
  try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { state = {}; }
  state.settings = { ...DEFAULT_SETTINGS, ...(state.settings || {}) };
  state.jobs = state.jobs || [];
  state.schedules = state.schedules || [];
  state.sessions = state.sessions || {};
  state.tools = state.tools || [];
  state.trends = state.trends || [];
  state.profiles = state.profiles || null;
  if (!state.profiles) migrateProfiles();
  // v1.9.1: the studio has its own Vercel project and address, no longer a page of the company website
  if (/kmr-groups\.com\/kmr-studio/i.test(state.settings.door_url || '')) Object.assign(state.settings, { door_url: 'https://studio.kmr-groups.com', door_ok: false, door_msg: '' });
}

// v1.7: accounts moved from settings into profiles. The existing accounts become profile "Me".
function migrateProfiles() {
  const s = state.settings;
  const me = { id: 'me', name: 'Me', created: Date.now(), yt: {}, meta: {}, li: {}, x: {} };
  if (s.yt_refresh_token) me.yt = { refresh: s.yt_refresh_token, channel: s.yt_channel };
  if (s.meta_page_token) me.meta = { user_token: s.meta_user_token, page_id: s.meta_page_id, page_name: s.meta_page_name, page_token: s.meta_page_token,
    ig_id: s.meta_ig_id, ig_username: s.meta_ig_username, pages: s.meta_pages || [], expires: s.meta_expires ?? -1, data_expires: s.meta_data_expires || 0,
    problem: s.meta_problem || '', missing: s.meta_missing || [] };
  state.profiles = [me];
  if (!s.default_targets) s.default_targets = (Array.isArray(s.post_to) && s.post_to.length ? s.post_to : ['youtube', 'instagram', 'facebook']).map(p => 'me:' + p);
}
let timer = null;
function flush() {
  clearTimeout(timer);
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 1));
  fs.renameSync(tmp, FILE);
}
function save() { clearTimeout(timer); timer = setTimeout(flush, 250); }
load();
process.on('exit', () => { try { flush(); } catch {} });

const job = id => state.jobs.find(j => j.id === id);
module.exports = {
  get state() { return state; },
  save, flush,
  settings: () => state.settings,
  updateSettings(p) { Object.assign(state.settings, p); save(); return state.settings; },
  jobs: () => state.jobs,
  job,
  addJob(j) { state.jobs.unshift(j); save(); return j; },
  updateJob(id, p) { const j = job(id); if (j) { Object.assign(j, p, { updated: Date.now() }); save(); } return j; },
  log(id, msg) {
    const j = job(id); if (!j) return;
    j.log = j.log || []; j.log.push({ t: Date.now(), msg });
    if (j.log.length > 200) j.log = j.log.slice(-200);
    j.updated = Date.now(); save();
  },
  removeJob(id) { state.jobs = state.jobs.filter(j => j.id !== id); save(); },
  schedules: () => state.schedules,
  schedule: id => state.schedules.find(s => s.id === id),
  saveSchedule(s) {
    const i = state.schedules.findIndex(x => x.id === s.id);
    if (i >= 0) state.schedules[i] = s; else state.schedules.push(s);
    save(); return s;
  },
  tools: () => state.tools,
  tool: id => state.tools.find(t => t.id === id),
  addTool(t) { state.tools.unshift(t); state.tools = state.tools.slice(0, 200); save(); return t; },
  updateTool(id, p) { const t = state.tools.find(x => x.id === id); if (t) { Object.assign(t, p); save(); } return t; },
  removeTool(id) { state.tools = state.tools.filter(t => t.id !== id); save(); },
  trends: () => state.trends,
  trend: id => state.trends.find(t => t.id === id),
  addTrend(t) { state.trends.unshift(t); state.trends = state.trends.slice(0, 30); save(); return t; },
  removeTrend(id) { state.trends = state.trends.filter(t => t.id !== id); save(); },
  removeSchedule(id) { state.schedules = state.schedules.filter(s => s.id !== id); save(); },
  profiles: () => state.profiles,
  profile: id => state.profiles.find(p => p.id === id),
  addProfile(p) { state.profiles.push(p); save(); return p; },
  // patch one account section of a profile, e.g. updateAccount('me', 'yt', { refresh: '...' })
  updateAccount(id, section, patch, replace = false) {
    const p = state.profiles.find(x => x.id === id); if (!p) return null;
    p[section] = replace ? { ...patch } : { ...(p[section] || {}), ...patch }; save(); return p;
  },
  updateProfile(id, patch) { const p = state.profiles.find(x => x.id === id); if (p) { Object.assign(p, patch); save(); } return p; },
  removeProfile(id) { state.profiles = state.profiles.filter(p => p.id !== id); save(); }
};
