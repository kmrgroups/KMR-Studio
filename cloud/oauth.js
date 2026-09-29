// Web sign-in for LinkedIn and X. Both come back to <studio address>/oauth/callback.
const crypto = require('crypto');
const kv = require('./kv');

const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const callback = base => base + '/oauth/callback';

async function begin(kind, pid, base, extra = {}) {
  const state = b64url(crypto.randomBytes(18));
  await kv.setJ('oauth:' + state, { kind, pid, base, ...extra }, 1800);
  return state;
}
function pkce() {
  const verifier = b64url(crypto.randomBytes(40));
  return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()) };
}
async function finish({ code, state, error, error_description }) {
  if (error) throw new Error(error === 'user_cancelled_authorize' || error === 'access_denied' ? 'Sign-in was cancelled.' : 'Sign-in failed: ' + (error_description || error));
  const rec = state && await kv.getJ('oauth:' + state);
  if (!rec || !code) throw new Error('This sign-in link is old or was already used. Press Connect again.');
  await kv.del('oauth:' + state);
  const mod = rec.kind === 'linkedin' ? require('./linkedin') : require('./x');
  const who = await mod.exchange(rec, code);
  return { kind: rec.kind, pid: rec.pid, who };
}
module.exports = { begin, pkce, finish, callback };
