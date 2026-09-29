// Background work: preparing (joining) a video and posting it to one account.
// Answers at once, then keeps working for up to 5 minutes (Vercel waitUntil).
const H = require('../cloud/http');
const jobs = require('../cloud/jobs');

let waitUntil;
try { waitUntil = require('@vercel/functions').waitUntil; } catch {}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST' || req.headers['x-kmr-key'] !== await jobs.workKey()) return H.send(res, 403, { error: 'Not allowed' });
    const b = await H.body(req);
    const base = H.base(req);
    const work = b.kind === 'prepare' ? jobs.prepare(b.job, base) : b.kind === 'post' ? jobs.postTarget(b.job, b.target, base) : null;
    if (!work) return H.send(res, 400, { error: 'Unknown work' });
    const safe = work.catch(e => console.error('work failed', b, e));
    if (waitUntil) waitUntil(safe);
    return H.send(res, 202, { ok: true });
  } catch (e) {
    return H.send(res, 500, { error: e.message });
  }
};
