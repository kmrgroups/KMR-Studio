// Google Veo through the Gemini API, paid from the monthly Cloud credit that comes with Google AI Pro.
// Up to two keys (two Pro accounts): KMR Studio uses the first until its monthly limit, then the second.
const fs = require('fs');
const kv = require('./kv');
const st = require('./state');
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const RATE = 0.05;      // US$ per second, Veo 3.1 Lite 720p with sound (Google's list price; used for the limit)
const CLIP = 8;         // seconds per clip
const month = () => new Date().toISOString().slice(0, 7);
const tail = k => String(k).slice(-6);

async function keys() {
  const s = await st.settings();
  return [s.veo_key_1, s.veo_key_2].map(k => String(k || '').trim()).filter(Boolean);
}
async function spent(key) { return Number(await kv.getJ(`veo:${month()}:${tail(key)}`)) || 0; }
async function addSpent(key, usd) { await kv.setJ(`veo:${month()}:${tail(key)}`, +((await spent(key)) + usd).toFixed(2), 40 * 86400); }
async function limit() { return Number((await st.settings()).veo_limit) || 9; }

// The key that still has room for this many clips this month, or null.
async function pickKey(clips) {
  const need = clips * CLIP * RATE, lim = await limit();
  for (const k of await keys()) if ((await spent(k)) + need <= lim) return k;
  return null;
}
async function status() {
  const lim = await limit();
  return Promise.all((await keys()).map(async (k, i) => ({ n: i + 1, tail: tail(k), spent: await spent(k), limit: lim })));
}

async function model(key, fresh) {
  const c = await kv.getJ('veo_model:' + tail(key));
  if (c && !fresh) return c;
  const r = await fetch(`${BASE}/models?key=${encodeURIComponent(key)}&pageSize=300`, { signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendly(r.status, j.error?.message || String(r.status)));
  const all = (j.models || []).filter(m => /veo/i.test(m.name) && (m.supportedGenerationMethods || []).includes('predictLongRunning')).map(m => m.name.replace('models/', ''));
  if (!all.length) throw new Error('This key cannot use Veo yet. In Google Cloud, switch on billing for the key\'s project (the Pro credit pays for it).');
  const ver = n => Number((/veo-(\d+(?:\.\d+)?)/.exec(n) || [0, 0])[1]);
  const pick = [...all].sort((a, b) => (/lite/.test(b) - /lite/.test(a)) || ver(b) - ver(a))[0];
  await kv.setJ('veo_model:' + tail(key), pick, 7 * 86400);
  return pick;
}
function friendly(status, msg) {
  if (/billing|FAILED_PRECONDITION|paid|prepay/i.test(msg)) return 'Veo needs billing switched on for this key\'s Google Cloud project (the Google AI Pro credit then pays for it). Google said: ' + msg.slice(0, 160);
  if (status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(msg)) return 'Veo is busy or the limit is reached for now.';
  if (/API key not valid/i.test(msg)) return 'A video key in Autopilot is not valid. Copy it again.';
  return 'Veo: ' + msg.slice(0, 240);
}

// Starts one 8-second clip. Returns the operation name to check later.
async function start(key, prompt, ratio) {
  let m = await model(key);
  const params = { aspectRatio: ratio === '16:9' ? '16:9' : '9:16', resolution: '720p', durationSeconds: CLIP, negativePrompt: 'subtitles, captions, text, watermark, logo, distorted face, extra fingers, blurry' };
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`${BASE}/models/${m}:predictLongRunning?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ instances: [{ prompt: String(prompt).slice(0, 3000) }], parameters: params })
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.name) { await addSpent(key, CLIP * RATE); return j.name; }
    const msg = j.error?.message || String(r.status);
    if (r.status === 404) { m = await model(key, true); continue; }
    if (r.status === 400 && /negativePrompt|durationSeconds|resolution/i.test(msg)) { delete params.negativePrompt; params.durationSeconds = undefined; continue; }
    throw new Error(friendly(r.status, msg));
  }
  throw new Error('Veo did not accept the request.');
}
// Checks a clip: { done:false } or { done:true, uri } (throws when Google refused it).
async function check(key, op) {
  const r = await fetch(`${BASE}/${op}?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendly(r.status, j.error?.message || String(r.status)));
  if (!j.done) return { done: false };
  if (j.error) throw new Error(friendly(400, j.error.message || 'the clip failed'));
  const resp = j.response?.generateVideoResponse || j.response || {};
  const s = (resp.generatedSamples || resp.generatedVideos || [])[0];
  const uri = s?.video?.uri || s?.uri;
  if (!uri) throw new Error('Google\'s safety filter blocked a shot: ' + ((resp.raiMediaFilteredReasons || []).join(' ') || 'no video').slice(0, 160));
  return { done: true, uri };
}
async function download(key, uri, dest) {
  const r = await fetch(uri + (uri.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key), { redirect: 'follow', signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error('Could not download a Veo clip (' + r.status + ')');
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}
async function test() {
  const ks = await keys();
  if (!ks.length) throw new Error('Paste at least one video key first.');
  const out = [];
  for (const [i, k] of ks.entries()) {
    try { out.push(`Key ${i + 1}: works (${await model(k, true)}), $${(await spent(k)).toFixed(2)} of $${await limit()} used this month.`); }
    catch (e) { out.push(`Key ${i + 1}: ${e.message}`); }
  }
  return out.join(' ');
}

module.exports = { keys, pickKey, status, start, check, download, test, CLIP, RATE };
