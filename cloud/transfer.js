// Moving keys and accounts: import from the laptop (PC) version's data\db.json, and a backup file of the cloud version.
// The page reads db.json itself and sends only this small part (keys and account logins), never videos or history.
const st = require('./state');
const kv = require('./kv');

const KEYS = ['yt_client_id', 'yt_client_secret', 'meta_app_id', 'meta_app_secret', 'li_client_id', 'li_client_secret', 'x_client_id', 'x_client_secret', 'gemini_key', 'groq_key', 'telegram_token', 'telegram_chat_id', 'yt_privacy', 'x_post_limit', 'meta_graph_version', 'text_language', 'auto_text', 'auto_thumb'];
const ACC = {
  yt: ['refresh', 'channel', 'channel_id', 'client_id', 'client_secret'],
  meta: ['user_token', 'page_id', 'page_name', 'page_token', 'ig_id', 'ig_username', 'pages', 'expires', 'missing'],
  li: ['token', 'expires_at', 'urn', 'name'],
  x: ['access', 'refresh', 'expires_at', 'username', 'name'],
  mapp: ['app_id', 'app_secret']
};
const pick = (o, keys) => { const r = {}; for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') r[k] = o[k]; return r; };

// Accepts either the laptop's db.json shape { settings, profiles } or this app's backup shape.
async function importData(data, base) {
  if (!data || typeof data !== 'object') throw new Error('This is not a KMR Studio file.');
  const s = data.settings || {};
  let profiles = Array.isArray(data.profiles) ? data.profiles : null;
  if (!profiles) { // laptop versions before 1.7 kept one account set in the settings
    const me = { id: 'me', name: 'Me', yt: {}, meta: {}, li: {}, x: {} };
    if (s.yt_refresh_token) me.yt = { refresh: s.yt_refresh_token, channel: s.yt_channel };
    if (s.meta_page_token) me.meta = { user_token: s.meta_user_token, page_id: s.meta_page_id, page_name: s.meta_page_name, page_token: s.meta_page_token, ig_id: s.meta_ig_id, ig_username: s.meta_ig_username, pages: s.meta_pages || [] };
    profiles = [me];
  }
  const keys = pick(s, KEYS);
  if (!Object.keys(keys).length && !profiles.some(p => ['yt', 'meta', 'li', 'x'].some(k => p[k] && Object.keys(p[k]).length))) throw new Error('No keys or accounts were found in this file. Choose data\\db.json from the KMR Studio (or Lumen Studio) folder on the laptop.');
  const patch = { ...keys };
  const targets = Array.isArray(s.default_targets) ? s.default_targets.filter(t => /^[\w-]+:(youtube|instagram|facebook|linkedin|x)$/.test(t)) : null;
  if (targets) patch.default_targets = targets;
  await st.saveSettings(patch);

  // profiles: same id is updated, new ones are added, cloud-only ones are kept
  const list = await st.profiles();
  const out = { keys: Object.keys(keys).filter(k => /(_id|_secret|_key)$/.test(k)).length, profiles: [], accounts: 0 };
  for (const p of profiles.slice(0, 30)) {
    const id = String(p.id || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 20) || 'p' + list.length;
    const name = String(p.name || id).slice(0, 40);
    const have = list.find(x => x.id === id);
    if (have) have.name = name; else list.push({ id, name });
    let n = 0;
    for (const [sec, fields] of Object.entries(ACC)) {
      const acc = pick(p[sec], fields);
      const real = sec === 'yt' ? acc.refresh || acc.client_id : sec === 'meta' ? acc.page_token : sec === 'li' ? acc.token : sec === 'mapp' ? acc.app_id : acc.refresh;
      if (!real) continue;
      await st.setAccount(id, sec, { ...acc, problem: '' }, true);
      if (sec === 'yt' ? acc.refresh : sec !== 'mapp') n++;
    }
    out.accounts += n;
    out.profiles.push(name + (n ? ` (${n} account${n > 1 ? 's' : ''})` : ''));
  }
  await kv.setJ('profiles', list);
  if (keys.telegram_token && base) { // point the bot at the cloud studio at once
    try { await require('./telegram').connect(base, keys.telegram_token); out.telegram = keys.telegram_chat_id ? 'connected' : 'needs start'; } catch (e) { out.telegram = e.message; }
  }
  return out;
}

// A backup of everything needed to rebuild the cloud studio: keys and account logins. Keep it private.
async function exportData() {
  const s = await st.settings();
  const profiles = await st.allProfiles();
  return {
    kind: 'kmr-studio-backup', version: 1, created: new Date().toISOString(),
    note: 'Contains your app keys and account logins. Keep this file private. Import it in KMR Studio, Settings, Bring keys from a file.',
    settings: { ...pick(s, KEYS), default_targets: s.default_targets || [] },
    profiles: profiles.map(p => ({ id: p.id, name: p.name, yt: pick(p.yt, ACC.yt), meta: pick(p.meta, ACC.meta), li: pick(p.li, ACC.li), x: pick(p.x, ACC.x), mapp: pick(p.mapp, ACC.mapp) }))
  };
}

// The page sends only this part of the laptop's db.json (it can be many MB because of video history).
function slim(db) {
  return { settings: db.settings || {}, profiles: db.profiles || null };
}

module.exports = { importData, exportData, slim };
