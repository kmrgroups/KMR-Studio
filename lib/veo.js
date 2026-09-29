// Google Veo through the Gemini API: cinematic 8-second clips with native speech and sound.
// Paid per second by Google (needs billing on the API key). KMR Studio keeps a monthly spending limit.
const fs = require('fs');
const db = require('./db');
const { sleep } = require('./util');

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Approximate Google list prices per second (USD). Shown as estimates only.
const RATES = { lite: { '720p': 0.05, '1080p': 0.08 }, fast: { '720p': 0.10, '1080p': 0.12 }, standard: { '720p': 0.40, '1080p': 0.40 } };
const rate = () => { const s = db.settings(); return (RATES[s.veo_tier] || RATES.lite)[s.veo_resolution] || 0.05; };
const key = () => { const s = db.settings(); return (s.veo_key || s.gemini_key || '').trim(); };
const month = () => new Date().toISOString().slice(0, 7);

function spent() {
  const s = db.settings();
  return s.veo_spent && s.veo_spent.month === month() ? s.veo_spent.usd : 0;
}
function addSpend(usd) { db.updateSettings({ veo_spent: { month: month(), usd: +(spent() + usd).toFixed(2) } }); }
function estimate(shots) { return +(shots * 8 * rate()).toFixed(2); }
function budgetLeft() { return +((Number(db.settings().veo_monthly_cap) || 0) - spent()).toFixed(2); }

async function listVeo() {
  if (!key()) throw new Error('Add a Gemini API key in Connections (Veo uses the same kind of key, with billing turned on).');
  const r = await fetch(`${BASE}/models?key=${key()}&pageSize=300`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Google: ' + (j.error?.message || r.status));
  return (j.models || []).filter(m => /veo/i.test(m.name) && (m.supportedGenerationMethods || []).includes('predictLongRunning')).map(m => m.name.replace('models/', ''));
}

async function pickModel(force) {
  const s = db.settings();
  if (s.veo_model && !force) return s.veo_model;
  const all = await listVeo();
  if (!all.length) throw new Error('This API key cannot see any Veo models. Turn on billing for the key in Google AI Studio, or use a key from a personal Gmail account.');
  const tier = s.veo_tier || 'lite';
  const newest = list => list.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const inTier = all.filter(n => tier === 'standard' ? !/lite|fast/.test(n) : n.includes(tier));
  const pick = newest(inTier.filter(n => /3\.1/.test(n)))[0] || newest(inTier)[0] || newest(all)[0];
  db.updateSettings({ veo_model: pick });
  return pick;
}

async function test() {
  const all = await listVeo();
  if (!all.length) throw new Error('No Veo models are available for this key. Billing is probably not turned on.');
  db.updateSettings({ veo_model: '' });
  const m = await pickModel(true);
  return `Veo is reachable. Using ${m}. This month: about $${spent()} of your $${db.settings().veo_monthly_cap} limit.`;
}

function friendly(status, msg) {
  if (/billing|FAILED_PRECONDITION|paid|quota tier/i.test(msg) || status === 403) return 'Veo needs billing turned on for this API key (Google AI Studio, Billing). ' + msg.slice(0, 160);
  if (/quota|RESOURCE_EXHAUSTED/i.test(msg) || status === 429) return 'Veo rate limit reached. KMR Studio will retry.';
  return 'Veo: ' + msg.slice(0, 300);
}

/** Generates one clip. Returns seconds billed. */
async function generateClip({ prompt, ratio, dest, image, onLog = () => {} }) {
  const s = db.settings();
  let model = await pickModel();
  const params = {
    aspectRatio: ratio === '16:9' ? '16:9' : '9:16',
    resolution: s.veo_resolution === '1080p' ? '1080p' : '720p',
    durationSeconds: 8,
    negativePrompt: 'subtitles, captions, on-screen text, watermark, logo, distorted face, extra fingers, blurry'
  };
  const instance = { prompt: prompt.slice(0, 3500) };
  if (image) instance.image = { bytesBase64Encoded: fs.readFileSync(image).toString('base64'), mimeType: 'image/jpeg' };

  let op = null;
  for (let attempt = 0; attempt < 6 && !op; attempt++) {
    const r = await fetch(`${BASE}/models/${model}:predictLongRunning?key=${key()}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ instances: [instance], parameters: params })
    });
    const j = await r.json().catch(() => ({}));
    const msg = j.error?.message || String(r.status);
    if (r.ok && j.name) { op = j; break; }
    if (r.status === 404) { model = await pickModel(true); continue; }
    if (r.status === 400 && instance.image && /image/i.test(msg)) { delete instance.image; continue; }
    if (r.status === 400 && /resolution|1080/i.test(msg) && params.resolution !== '720p') { params.resolution = '720p'; continue; }
    if (r.status === 429 || r.status >= 500) { onLog('Veo is busy, waiting a minute'); await sleep(60000 * (attempt + 1)); continue; }
    throw new Error(friendly(r.status, msg));
  }
  if (!op) throw new Error('Veo did not accept the request after several tries.');

  const t0 = Date.now();
  let done = null;
  while (Date.now() - t0 < 15 * 60000) {
    await sleep(10000);
    const r = await fetch(`${BASE}/${op.name}?key=${key()}`, { signal: AbortSignal.timeout(60000) });
    const j = await r.json().catch(() => ({}));
    if (j.done) { done = j; break; }
  }
  if (!done) throw new Error('Veo took more than 15 minutes for one shot.');
  if (done.error) throw new Error(friendly(400, done.error.message || 'generation failed'));
  const resp = done.response?.generateVideoResponse || done.response || {};
  const sample = (resp.generatedSamples || resp.generatedVideos || [])[0];
  const uri = sample?.video?.uri || sample?.uri;
  if (!uri) {
    const why = (resp.raiMediaFilteredReasons || []).join(' ') || 'no video returned';
    throw new Error("Google's safety filter blocked this shot: " + why.slice(0, 200) + ' Try rewording the topic.');
  }
  const dl = await fetch(uri + (uri.includes('?') ? '&' : '?') + 'key=' + key(), { redirect: 'follow', signal: AbortSignal.timeout(300000) });
  if (!dl.ok) throw new Error('Could not download the Veo clip (' + dl.status + ')');
  fs.writeFileSync(dest, Buffer.from(await dl.arrayBuffer()));
  addSpend(8 * rate());
  return 8;
}

module.exports = { generateClip, test, estimate, spent, budgetLeft, rate };
