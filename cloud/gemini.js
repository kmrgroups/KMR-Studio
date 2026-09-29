// Talks to Gemini. Google retires model names over time, so KMR Studio asks which models this key
// may use and picks the newest fast one ("flash"), remembering it until Google says it is gone.
const kv = require('./kv');
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const ver = n => (/gemini-(\d+(?:\.\d+)?)/.exec(n) || [0, '0'])[1] * 1;
function rank(names) {
  const ok = names.filter(n => /^gemini-/.test(n) && /flash/.test(n) && !/image|tts|live|audio|embedding|thinking|exp|learnlm|computer/.test(n));
  const score = n => ver(n) * 100 + (/-lite/.test(n) ? 0 : 20) + (/preview/.test(n) ? 0 : 10) + (/latest/.test(n) ? 5 : 0);
  return ok.sort((a, b) => score(b) - score(a));
}
async function models(key, fresh) {
  if (!fresh) { const c = await kv.getJ('gemini_models'); if (c && c.key === key.slice(-6) && Date.now() - c.t < 7 * 864e5) return c.list; }
  const r = await fetch(`${BASE}/models?key=${encodeURIComponent(key)}&pageSize=200`, { signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendly(r.status, j.error?.message || String(r.status)));
  const names = (j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
  const list = rank(names);
  if (!list.length) throw new Error('This Gemini key cannot use any Gemini "flash" model. Make a new key at aistudio.google.com/apikey.');
  await kv.setJ('gemini_models', { key: key.slice(-6), t: Date.now(), list });
  return list;
}
function friendly(status, msg) {
  if (/API key not valid|API_KEY_INVALID/i.test(msg)) return 'The Gemini key is not valid. Copy it again from aistudio.google.com/apikey and save it in Settings.';
  if (/denied access|PERMISSION_DENIED|suspended/i.test(msg) || status === 403) return 'Google blocked this Gemini key. Make a new key with a personal @gmail.com account at aistudio.google.com/apikey.';
  if (/location is not supported/i.test(msg)) return 'Gemini is not available from this location.';
  if (status === 429 || /quota|exhausted/i.test(msg)) return 'The free Gemini limit is used up for now. Try again in a minute (or tomorrow if it is the daily limit).';
  return 'Gemini: ' + msg;
}
const gone = (status, msg) => status === 404 || /no longer available|not found|is not supported for generateContent|deprecated/i.test(msg);

// parts: Gemini content parts. Returns the parsed JSON answer.
async function json(key, parts, { temperature = 0.8, timeout = 70000 } = {}) {
  let list = await models(key);
  const errors = [];
  for (let round = 0; round < 2; round++) {
    for (const model of list.slice(0, 3)) {
      const r = await fetch(`${BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(timeout)
      }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        try { return JSON.parse(text.replace(/^\s*```(json)?|```\s*$/g, '').trim()); } catch { errors.push(model + ': unreadable answer'); continue; }
      }
      const msg = j.error?.message || String(r.status);
      if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|denied access/i.test(msg)) throw new Error(friendly(r.status, msg));
      errors.push(friendly(r.status, msg));
      if (!gone(r.status, msg) && r.status !== 429 && r.status !== 503 && r.status !== 500) break;
    }
    if (round === 0 && errors.some(e => /no longer available|not found|deprecated/i.test(e))) { list = await models(key, true); errors.length = 0; continue; }
    break;
  }
  throw new Error((errors[0] || 'Gemini did not answer') + ' You can type the text yourself.');
}

module.exports = { json, models, rank };
