// Backup writer when Gemini is busy: Groq (free key from console.groq.com/keys).
// Groq listens to the video (Whisper speech-to-text) and writes from what is said plus the owner's hint.
// Its free plan has no model that looks at pictures, so the thumbnail frame is chosen without it.
const fs = require('fs');
const kv = require('./kv');
const API = 'https://api.groq.com/openai/v1';

async function transcribe(key, mp3) {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(mp3)], { type: 'audio/mpeg' }), 'audio.mp3');
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('response_format', 'text');
  const r = await fetch(API + '/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd, signal: AbortSignal.timeout(60000) });
  if (!r.ok) return '';
  return (await r.text()).trim().slice(0, 6000);
}

async function chatModels(key) {
  const c = await kv.getJ('groq_models');
  if (c && Date.now() - c.t < 3 * 864e5) return c.list;
  let ids = [];
  try {
    const r = await fetch(API + '/models', { headers: { Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(15000) });
    const j = await r.json();
    ids = (j.data || []).filter(m => m.active !== false).map(m => m.id).filter(id => !/whisper|tts|guard|safeguard|playai|orpheus|distil/i.test(id));
  } catch {}
  const prefer = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'openai/gpt-oss-20b'];
  const list = [...prefer.filter(p => ids.includes(p)), ...ids.filter(i => !prefer.includes(i))];
  const out = list.length ? list : prefer;
  await kv.setJ('groq_models', { t: Date.now(), list: out });
  return out;
}

async function json(key, prompt) {
  let last = '';
  for (const model of (await chatModels(key)).slice(0, 3)) {
    const r = await fetch(API + '/chat/completions', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0.8, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(60000)
    }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('The Groq key is not valid. Copy it again from console.groq.com/keys.');
    if (!r.ok) { last = j.error?.message || String(r.status); continue; }
    try { return JSON.parse(j.choices?.[0]?.message?.content || ''); } catch { last = 'unreadable answer'; }
  }
  throw new Error('Groq: ' + last);
}

module.exports = { transcribe, json };
