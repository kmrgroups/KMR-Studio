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

const busy = (status, msg) => status === 503 || status === 500 || /high demand|overloaded|unavailable|try again later/i.test(msg);
const daily = msg => /per day|daily|PerDay/i.test(msg);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// parts: Gemini content parts. Returns the parsed JSON answer.
// When Google is busy it waits a moment, tries again, then moves to the next model (lite, older generation).
async function json(key, parts, { temperature = 0.8, timeout = 60000, budget = 110000 } = {}) {
  const until = Date.now() + budget;
  let list = await models(key);
  const errors = [];
  let refreshed = false;
  for (let i = 0; i < Math.min(list.length, 6) && Date.now() < until; i++) {
    const model = list[i];
    for (let attempt = 0; attempt < 2 && Date.now() < until; attempt++) {
      const r = await fetch(`${BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature, responseMimeType: 'application/json' } }),
        signal: AbortSignal.timeout(Math.min(timeout, Math.max(5000, until - Date.now())))
      }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        try { return JSON.parse(text.replace(/^\s*```(json)?|```\s*$/g, '').trim()); } catch { errors.push(model + ' gave an unreadable answer'); break; }
      }
      const msg = j.error?.message || String(r.status);
      if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|denied access/i.test(msg)) throw new Error(friendly(r.status, msg));
      errors.push(friendly(r.status, msg));
      if (gone(r.status, msg)) {
        if (!refreshed) { refreshed = true; list = await models(key, true); i = -1; }
        break;
      }
      if (busy(r.status, msg) || r.status === 0) { await sleep(attempt ? 1000 : 2500); continue; }
      if (r.status === 429 && !daily(msg)) { await sleep(4000); continue; }
      break; // daily limit or a bad request: try the next model
    }
  }
  const e = new Error((errors.find(x => /high demand|busy|limit/i.test(x)) || errors[0] || 'Gemini did not answer'));
  e.busy = errors.some(x => /high demand|overloaded|unavailable|limit/i.test(x));
  throw e;
}

module.exports = { json, models, rank };
