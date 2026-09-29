// Request helpers and the login (one owner password, set as KMR_PASSWORD in Vercel).
const crypto = require('crypto');
const kv = require('./kv');

async function body(req) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
  const chunks = [];
  for await (const c of req) { chunks.push(c); if (chunks.reduce((a, b) => a + b.length, 0) > 1e6) throw new Error('Request too large'); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}
function send(res, status, obj, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}
function html(res, status, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(text);
}
function redirect(res, to) { res.statusCode = 302; res.setHeader('Location', to); res.setHeader('Cache-Control', 'no-store'); res.end(); }
function cookies(req) {
  const o = {};
  for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) o[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return o;
}
function base(req) {
  if (process.env.KMR_PUBLIC_URL) return process.env.KMR_PUBLIC_URL.replace(/\/+$/, '');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}
const ip = req => String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

// ---- login ----
const PW = () => String(process.env.KMR_PASSWORD || '');
async function secret() {
  let s = await kv.getJ('secret');
  if (!s) { s = crypto.randomBytes(32).toString('hex'); await kv.setJ('secret', s); }
  return crypto.createHash('sha256').update(s + '|' + PW()).digest(); // changing the password signs everyone out
}
async function makeSession() {
  const exp = Date.now() + 60 * 864e5;
  const sig = crypto.createHmac('sha256', await secret()).update(String(exp)).digest('base64url');
  return `${exp}.${sig}`;
}
async function authed(req) {
  const c = cookies(req).kmr;
  if (!c || !PW()) return false;
  const [exp, sig] = c.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = crypto.createHmac('sha256', await secret()).update(String(exp)).digest('base64url');
  return sig.length === want.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want));
}
function sessionCookie(value, req, maxAge = 60 * 86400) {
  const secure = base(req).startsWith('https') ? '; Secure' : '';
  return `kmr=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
async function login(req, password) {
  if (!PW()) throw Object.assign(new Error('No password is set yet. In Vercel, project Settings, Environment Variables, add KMR_PASSWORD, then Redeploy.'), { status: 400 });
  const key = 'fail:' + ip(req);
  const fails = Number(await kv.cmd('GET', kv.P + key) || 0);
  if (fails >= 10) throw Object.assign(new Error('Too many wrong passwords. Wait 15 minutes.'), { status: 429 });
  const a = crypto.createHash('sha256').update(String(password || '')).digest(), b = crypto.createHash('sha256').update(PW()).digest();
  if (!crypto.timingSafeEqual(a, b)) { await kv.incr(key, 900); throw Object.assign(new Error('Wrong password.'), { status: 401 }); }
  return makeSession();
}

module.exports = { body, send, html, redirect, cookies, base, ip, authed, login, sessionCookie };
