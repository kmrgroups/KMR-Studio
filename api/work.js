// Background work: preparing (joining) a video and posting it to one account.
// Answers at once, then keeps working for up to 5 minutes (Vercel waitUntil).
const H = require('../cloud/http');
const jobs = require('../cloud/jobs');

let waitUntil;
try { waitUntil = require('@vercel/functions').waitUntil; } catch {}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') return H.send(res, 405, { error: 'Not allowed' });
    const b = await H.body(req);
    // the Post page's AI preview runs here too (it needs ffmpeg), for the signed-in owner
    if (b.kind === 'preview') {
      if (!await H.authed(req)) return H.send(res, 401, { error: 'Please sign in again.' });
      try { return H.send(res, 200, await require('../cloud/preview').preview(b)); }
      catch (e) { return H.send(res, 400, { error: e.message }); }
    }
    if (req.headers['x-kmr-key'] !== await jobs.workKey()) return H.send(res, 403, { error: 'Not allowed' });
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
