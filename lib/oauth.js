// Web sign-in for LinkedIn and X. They only send people back to an https address:
// studio.kmr-groups.com/oauth/callback (the Vercel door forwards it here) or the studio's own Tailscale address.
const crypto = require('crypto');
const db = require('./db');

const pending = new Map(); // nonce -> { kind, pid, verifier, created }
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// With KMR Studio on its own https address (Online access), LinkedIn and X come straight back to it.
function callbackUrl() {
  const s = db.settings();
  // 1. the door (studio.kmr-groups.com/oauth/callback) once it is checked to lead here
  const door = String(s.door_url || '').trim().replace(/\/+$/, '');
  if (s.door_ok && /^https:\/\//i.test(door)) return door + '/oauth/callback';
  // 2. the studio's own https address
  const pub = String(s.public_url || '').trim().replace(/\/+$/, '');
  if (/^https:\/\//i.test(pub)) return pub + '/oauth/callback';
  const r = String(s.oauth_redirect || '').trim();
  return /^https:\/\//i.test(r) ? r : '';
}
function redirectUri() {
  const u = callbackUrl();
  if (!u) throw new Error('Put KMR Studio online first: Settings, Online access.');
  return u;
}

// base = the address this KMR Studio is opened at (so the return page knows where to send the sign-in)
function begin(kind, pid, base, extra = {}) {
  for (const [k, v] of pending) if (Date.now() - v.created > 30 * 60000) pending.delete(k);
  const nonce = b64url(crypto.randomBytes(18));
  const rec = { kind, pid, created: Date.now(), ...extra };
  pending.set(nonce, rec);
  const state = b64url(JSON.stringify({ u: String(base || '').replace(/\/$/, ''), n: nonce }));
  return { state, rec };
}

function pkce() {
  const verifier = b64url(crypto.randomBytes(40));
  return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()) };
}

// Accepts the code and state from the return page (or from a pasted link) and finishes the sign-in.
async function finish({ code, state, error, error_description }) {
  if (error) throw new Error(error === 'user_cancelled_authorize' || error === 'access_denied' ? 'Sign-in was cancelled.' : 'Sign-in failed: ' + (error_description || error));
  let n;
  try { n = JSON.parse(Buffer.from(String(state).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()).n; } catch {}
  const rec = n && pending.get(n);
  if (!rec || !code) throw new Error('This sign-in link is old or was already used. Press Connect again.');
  pending.delete(n);
  const mod = rec.kind === 'linkedin' ? require('./linkedin') : require('./x');
  const who = await mod.exchange(rec, code);
  require('./pipeline').youtubeConnected();
  return { kind: rec.kind, pid: rec.pid, who, profile: db.profile(rec.pid)?.name };
}

// A pasted link: the full address from the return page, or just the part after "?".
function parsePasted(text) {
  const t = String(text || '').trim();
  const q = t.includes('?') ? t.slice(t.indexOf('?') + 1) : t;
  const p = new URLSearchParams(q.replace(/#.*$/, ''));
  return { code: p.get('code'), state: p.get('state'), error: p.get('error'), error_description: p.get('error_description') };
}

module.exports = { begin, finish, pkce, redirectUri, callbackUrl, parsePasted };
