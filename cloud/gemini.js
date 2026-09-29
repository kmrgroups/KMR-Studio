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
  if (/has not been used|is disabled|SERVICE_DISABLED|not enabled/i.test(msg)) return 'The Gemini API is switched off in this key\'s Google project. Make the key at aistudio.google.com/apikey (that switches it on) and paste it in Settings. (Google said: ' + msg.slice(0, 160) + ')';
  if (/expired/i.test(msg)) return 'This Gemini key has expired. Make a new one at aistudio.google.com/apikey and paste it in Settings.';
  if (/referer|referrer|ip address|restricted|API_KEY_.*BLOCKED|blocked/i.test(msg)) return 'This Gemini key has restrictions (only some websites, apps or IP addresses may use it). Make a new key at aistudio.google.com/apikey without restrictions. (Google said: ' + msg.slice(0, 160) + ')';
  if (/denied access|PERMISSION_DENIED|suspended/i.test(msg) || status === 403) return 'Google refused this Gemini key: ' + msg.slice(0, 200) + ' Make a new key at aistudio.google.com/apikey with a personal @gmail.com account.';
  if (/location is not supported/i.test(msg)) return 'Gemini is not available from this location.';
  if (status === 429 || /quota|exhausted/i.test(msg)) return 'The free Gemini limit is used up for now. Try again in a minute (or tomorrow if it is the daily limit).';
  return 'Gemini: ' + msg;
}
const gone = (status, msg) => status === 404 || /no longer available|not found|is not supported for generateContent|deprecated/i.test(msg);

const busy = (status, msg) => status === 503 || status === 500 || /high demand|overloaded|unavailable|try again later/i.test(msg);
const daily = msg => /per day|daily|PerDay/i.test(msg);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// One try with one model. Thinking is switched off (fastest); if a model refuses that setting, it is asked again without it.
async function ask(key, model, parts, temperature, ms) {
  const call = async cfg => {
    const r = await fetch(`${BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature, responseMimeType: 'application/json', ...cfg } }),
      signal: AbortSignal.timeout(ms)
    }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: /abort|timeout/i.test(e.message) ? 'took too long' : e.message } }) }));
    return { r, j: await r.json().catch(() => ({})) };
  };
  let { r, j } = await call({ thinkingConfig: { thinkingBudget: 0 } });
  if (r.status === 400 && /thinking/i.test(j.error?.message || '')) ({ r, j } = await call({}));
  if (r.ok) {
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    try { return { ok: true, value: JSON.parse(text.replace(/^\s*```(json)?|```\s*$/g, '').trim()) }; } catch { return { ok: false, status: 200, msg: 'unreadable answer' }; }
  }
  return { ok: false, status: r.status, msg: j.error?.message || String(r.status) };
}

// parts: Gemini content parts. Returns the parsed JSON answer.
// Asks the two best models at the same time and takes the first answer; if both are busy, asks the next ones.
async function json(key, parts, { temperature = 0.8, timeout = 45000, budget = 90000 } = {}) {
  const until = Date.now() + budget;
  let list = await models(key);
  const errors = [];
  for (let round = 0; round < 3 && Date.now() < until; round++) {
    const group = list.slice(round * 2, round * 2 + 2);
    if (!group.length) break;
    const ms = Math.min(timeout, Math.max(8000, until - Date.now()));
    const tries = group.map(m => ask(key, m, parts, temperature, ms).then(x => x.ok ? x.value : Promise.reject(Object.assign(new Error(x.msg), x))));
    try { return await Promise.any(tries); }
    catch (agg) {
      const errs = agg.errors || [];
      for (const e of errs) {
        if (/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|denied access/i.test(e.message)) throw new Error(friendly(e.status, e.message));
        errors.push(friendly(e.status, e.message));
      }
      if (errs.some(e => gone(e.status, e.message)) && round === 0) { list = await models(key, true); round = -1; continue; }
    }
  }
  const e = new Error(errors.find(x => /high demand|busy|limit|too long/i.test(x)) || errors[0] || 'Gemini did not answer');
  e.busy = errors.some(x => /high demand|overloaded|unavailable|limit|too long/i.test(x));
  throw e;
}

module.exports = { json, models, rank };
