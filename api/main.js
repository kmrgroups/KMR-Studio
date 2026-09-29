// KMR Studio Cloud: every page request except the heavy background work.
const H = require('../cloud/http');
const st = require('../cloud/state');
const kv = require('../cloud/kv');
const files = require('../cloud/files');
const jobs = require('../cloud/jobs');

const VERSION = '2.4.0';

function route(req) {
  const u = new URL(req.url, 'http://x');
  let p = u.searchParams.get('__p');
  if (p === null) p = u.pathname.replace(/^\/api\/?/, '');
  u.searchParams.delete('__p');
  return { path: '/' + p.replace(/^\/+|\/+$/g, ''), query: Object.fromEntries(u.searchParams) };
}

async function state(req) {
  const needs = { password: !process.env.KMR_PASSWORD, database: !kv.ready(), storage: !files.ready() };
  const out = { version: VERSION, needs, authed: false, platforms: st.PLATFORMS, upload: process.env.KMR_FAKE_DIR ? 'direct' : 'blob' };
  if (needs.password || needs.database) return out;
  out.authed = await H.authed(req);
  if (!out.authed) return out;
  const s = await st.settings();
  out.settings = st.publicSettings(s);
  out.profiles = (await st.allProfiles()).map(st.publicProfile);
  out.callback = H.base(req) + '/oauth/callback';
  return out;
}

const PLATFORM_MOD = { youtube: 'youtube', instagram: 'meta', facebook: 'meta', meta: 'meta', linkedin: 'linkedin', x: 'x' };
const mod = name => require('../cloud/' + PLATFORM_MOD[name]);

module.exports = async function handler(req, res) {
  const { path, query } = route(req);
  const M = req.method;
  try {
    // ---- open to everyone ----
    if (path === '/work') return require('./work')(req, res); // in case the platform routed it here
    if (path === '/state' && M === 'GET') return H.send(res, 200, await state(req));
    if (path === '/login' && M === 'POST') {
      const b = await H.body(req);
      const sess = await H.login(req, b.password);
      return H.send(res, 200, { ok: true }, { 'Set-Cookie': H.sessionCookie(sess, req) });
    }
    if (path === '/logout' && M === 'POST') return H.send(res, 200, { ok: true }, { 'Set-Cookie': H.sessionCookie('', req, 0) });
    if (path === '/oauth/callback' && M === 'GET') {
      if (!await H.authed(req)) return H.redirect(res, '/#msg=' + encodeURIComponent('Sign in to KMR Studio first, then press Connect again.'));
      try {
        const r = await require('../cloud/oauth').finish(query);
        const p = await st.profile(r.pid);
        return H.redirect(res, '/#profiles&msg=' + encodeURIComponent(`${r.kind === 'linkedin' ? 'LinkedIn' : 'X'} connected for ${p?.name || 'the profile'}: ${r.who}`));
      } catch (e) { return H.redirect(res, '/#profiles&err=' + encodeURIComponent(e.message)); }
    }

    if (path === '/telegram' && M === 'POST') { // Telegram webhook (checked by its secret header)
      try { await require('../cloud/telegram').handleUpdate(req, await H.body(req), H.base(req)); } catch (e) { console.error('telegram', e.message); }
      return H.send(res, 200, { ok: true });
    }
    // ---- signed in only ----
    if (!await H.authed(req)) return H.send(res, 401, { error: 'Please sign in again.' });
    const b = M === 'GET' ? {} : await H.body(req);
    const base = H.base(req);
    let m;

    if (path === '/settings' && M === 'POST') { const s = await st.saveSettings(b); return H.send(res, 200, { settings: st.publicSettings(s) }); }

    // profiles
    if (path === '/profiles' && M === 'POST') return H.send(res, 200, { profile: await st.addProfile(b.name) });
    if ((m = /^\/profiles\/([\w-]+)$/.exec(path))) {
      if (M === 'DELETE') { await st.removeProfile(m[1]); return H.send(res, 200, { ok: true }); }
      if (M === 'POST') { await st.renameProfile(m[1], b.name); return H.send(res, 200, { ok: true }); }
    }
    if ((m = /^\/profiles\/([\w-]+)\/youtube\/(start|poll|keys)$/.exec(path))) {
      const yt = require('../cloud/youtube');
      if (m[2] === 'start') return H.send(res, 200, await yt.start(m[1]));
      if (m[2] === 'poll') return H.send(res, 200, await yt.poll(m[1]));
      await yt.setOwnKeys(m[1], b.client_id, b.client_secret); return H.send(res, 200, { ok: true });
    }
    if ((m = /^\/profiles\/([\w-]+)\/meta\/connect$/.exec(path)) && M === 'POST') return H.send(res, 200, { message: await require('../cloud/meta').connect(m[1], b) });
    if ((m = /^\/profiles\/([\w-]+)\/(linkedin|x)\/start$/.exec(path))) return H.send(res, 200, { url: await mod(m[2]).authUrl(m[1], base) });
    if ((m = /^\/profiles\/([\w-]+)\/(youtube|meta|instagram|facebook|linkedin|x)\/(check|disconnect)$/.exec(path)) && M === 'POST') {
      if (m[3] === 'check') return H.send(res, 200, { message: await mod(m[2]).check(m[1]) });
      await mod(m[2]).disconnect(m[1]); return H.send(res, 200, { ok: true });
    }

    // uploads (the browser sends the file straight to storage)
    if (path === '/upload' && M === 'POST') return H.send(res, 200, await files.handleUpload(b, req));
    if (path === '/upload/discard' && M === 'POST') { await files.remove((b.pathnames || []).filter(p => String(p).startsWith('up/'))); return H.send(res, 200, { ok: true }); }
    if (path === '/logo' && M === 'GET') {
      const s = await st.settings();
      if (!files.okPath(s.logo)) return H.send(res, 404, { error: 'No logo' });
      return H.redirect(res, await files.signedUrl(s.logo, 24 * 60));
    }
    if (path === '/preview' && M === 'GET') {
      if (!files.okPath(query.p)) return H.send(res, 400, { error: 'Bad file' });
      return H.redirect(res, await files.signedUrl(query.p, 60));
    }

    // posts
    if (path === '/posts' && M === 'POST') return H.send(res, 200, { jobs: await jobs.create(b, base) });
    if (path === '/posts' && M === 'GET') return H.send(res, 200, { jobs: await jobs.list(Number(query.n) || 40) });
    if ((m = /^\/posts\/([\w]+)\/retry$/.exec(path)) && M === 'POST') { await jobs.retry(m[1], b.target, base); return H.send(res, 200, { ok: true }); }
    if ((m = /^\/posts\/([\w]+)$/.exec(path)) && M === 'DELETE') { await jobs.remove(m[1]); return H.send(res, 200, { ok: true }); }

    if (path === '/import' && M === 'POST') return H.send(res, 200, await require('../cloud/transfer').importData(b.data, base));
    if ((m = /^\/telegram\/(connect|test|disconnect)$/.exec(path)) && M === 'POST') {
      const tg = require('../cloud/telegram');
      if (m[1] === 'connect') return H.send(res, 200, await tg.connect(base, b.token));
      if (m[1] === 'test') return H.send(res, 200, { message: await tg.test() });
      await tg.disconnect(); return H.send(res, 200, { ok: true });
    }
    if ((m = /^\/posts\/([\w]+)\/(approve|reject)$/.exec(path)) && M === 'POST') { m[2] === 'approve' ? await jobs.approve(m[1], base) : await jobs.reject(m[1]); return H.send(res, 200, { ok: true }); }
    if (path === '/export' && M === 'GET') {
      const data = await require('../cloud/transfer').exportData();
      return H.send(res, 200, data, { 'Content-Disposition': `attachment; filename="kmr-studio-backup-${new Date().toISOString().slice(0, 10)}.json"` });
    }
    if (path === '/ai/write' && M === 'POST') return H.send(res, 200, await require('../cloud/ai').write(b));

    return H.send(res, 404, { error: 'Not found: ' + path });
  } catch (e) {
    if (!e.status && !/^[A-Z]/.test(e.message || '')) console.error(path, e);
    return H.send(res, e.status || 400, { error: e.message || String(e) });
  }
};
module.exports.VERSION = VERSION;
