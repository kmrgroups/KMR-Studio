// AI voice-over with Gemini's speech models (they speak Tamil, English, Hindi and many more).
// Tries the Gemini key first, then the video keys. Returns a WAV file path, or null when no voice could be made.
const fs = require('fs');
const kv = require('./kv');
const st = require('./state');
const media = require('./media');
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

const VOICES = { female: 'Kore', male: 'Charon' };

async function ttsModel(key) {
  const c = await kv.getJ('tts_model:' + key.slice(-6));
  if (c) return c;
  const r = await fetch(`${BASE}/models?key=${encodeURIComponent(key)}&pageSize=300`, { signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  const names = (j.models || []).filter(m => /tts/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
  const ver = n => Number((/gemini-(\d+(?:\.\d+)?)/.exec(n) || [0, 0])[1]);
  const pick = names.sort((a, b) => (/flash/.test(b) - /flash/.test(a)) || ver(b) - ver(a))[0] || null;
  if (pick) await kv.setJ('tts_model:' + key.slice(-6), pick, 7 * 86400);
  return pick;
}

async function speak(text, { voice = 'female', style = '', out }) {
  const s = await st.settings();
  const keys = [s.gemini_key, s.veo_key_1, s.veo_key_2].map(k => String(k || '').trim()).filter(Boolean);
  let last = 'no Gemini key';
  for (const key of keys) {
    const model = await ttsModel(key).catch(() => null);
    if (!model) { last = 'no speech model for this key'; continue; }
    const r = await fetch(`${BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: (style ? style + ': ' : 'Say in a warm, clear, engaging narrator voice: ') + text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[voice] || VOICES.female } } } }
      })
    }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const j = await r.json().catch(() => ({}));
    const part = (j.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data);
    const data = part && (part.inlineData || part.inline_data);
    if (!r.ok || !data) { last = j.error?.message || 'no audio returned'; continue; }
    const rate = Number((/rate=(\d+)/.exec(data.mimeType || data.mime_type || '') || [0, 24000])[1]);
    const raw = out + '.pcm';
    fs.writeFileSync(raw, Buffer.from(data.data, 'base64'));
    await media.run(['-y', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '44100', out], { timeout: 60000 });
    fs.rmSync(raw, { force: true });
    return out;
  }
  const e = new Error('The AI voice could not be made (' + String(last).slice(0, 160) + ').');
  e.soft = true;
  throw e;
}

module.exports = { speak, VOICES };
