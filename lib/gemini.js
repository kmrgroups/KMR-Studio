// Script writing with Google Gemini (free tier).
const db = require('./db');
const { sleep } = require('./util');
const { STYLES } = require('./visuals');

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

function parseJson(text) {
  let t = String(text || '').replace(/```json|```/g, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch {}
  // light repair: trailing commas, raw line breaks inside strings
  const fixed = t.replace(/,\s*([}\]])/g, '$1').replace(/\r?\n/g, ' ');
  return JSON.parse(fixed);
}

async function pickModel(key) {
  const r = await fetch(`${BASE}/models?key=${key}&pageSize=200`);
  const j = await r.json();
  const list = (j.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', ''));
  const stable = list.filter(n => /flash/.test(n) && !/lite|image|tts|live|preview|exp|thinking|audio/.test(n));
  return stable.sort().reverse()[0] || list.find(n => /flash/.test(n)) || list[0];
}

function geminiError(status, msg) {
  if (/denied access|PERMISSION_DENIED|suspended/i.test(msg) || status === 403)
    return 'Google blocked this Gemini key. Make a new key with a personal @gmail.com account (work and business Google accounts are often blocked), or add a free Groq key in Connections.';
  if (/API key not valid|API_KEY_INVALID/i.test(msg)) return 'This Gemini key is not valid. Copy it again from aistudio.google.com/apikey.';
  if (/location is not supported/i.test(msg)) return 'Gemini is not available from your location. Add a free Groq key in Connections instead.';
  return 'Gemini: ' + msg;
}

async function viaGemini(prompt, { json, temperature }) {
  const s = db.settings();
  let model = s.gemini_model || 'gemini-2.5-flash';
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(`${BASE}/models/${model}:generateContent?key=${s.gemini_key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(180000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: json ? { responseMimeType: 'application/json', temperature } : { temperature }
      })
    });
    if (r.status === 404) {
      const m = await pickModel(s.gemini_key);
      if (!m || m === model) throw new Error('No usable Gemini model found for this key.');
      model = m; db.updateSettings({ gemini_model: m });
      continue;
    }
    if (r.status === 429 || r.status >= 500) { await sleep(15000 * (attempt + 1)); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(geminiError(r.status, j.error?.message || String(r.status))); e.fatal = true; throw e; }
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    if (!text) { await sleep(3000); continue; }
    try { return json ? parseJson(text) : text; }
    catch { if (attempt >= 2) throw new Error('Gemini returned an unreadable script.'); }
  }
  throw new Error('Gemini is busy (free-tier rate limit). It will work again in a minute.');
}

// Groq: free, fast, no card. OpenAI-compatible API.
const GROQ = 'https://api.groq.com/openai/v1';
const GROQ_PREFER = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'moonshotai/kimi-k2-instruct', 'llama-3.1-70b-versatile'];
async function pickGroqModel(key) {
  const r = await fetch(`${GROQ}/models`, { headers: { Authorization: 'Bearer ' + key } });
  const j = await r.json();
  if (!r.ok) throw new Error('Groq: ' + (j.error?.message || r.status));
  const ids = (j.data || []).map(m => m.id).filter(id => !/whisper|guard|tts|vision|embed|prompt/i.test(id));
  return GROQ_PREFER.find(m => ids.includes(m)) || ids.find(id => /70b|120b/.test(id)) || ids[0];
}
async function viaGroq(prompt, { json, temperature }) {
  const s = db.settings();
  let model = s.groq_model || GROQ_PREFER[0];
  let strict = json; // use Groq's JSON mode first; drop it if Groq rejects its own output
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(`${GROQ}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.groq_key },
      signal: AbortSignal.timeout(180000),
      body: JSON.stringify({
        model, temperature: json ? 0.7 : Math.min(temperature, 1), max_tokens: 8000,
        messages: [
          { role: 'system', content: json ? 'Reply with ONE valid JSON object only. No markdown, no comments, no text before or after. Escape any double quotes inside strings.' : 'You are a helpful writer.' },
          { role: 'user', content: prompt }
        ],
        ...(strict ? { response_format: { type: 'json_object' } } : {})
      })
    });
    const j = await r.json().catch(() => ({}));
    const err = j.error || {};
    if (r.status === 404 || (/model/i.test(err.code || '') && /not.*(exist|found)|decommission/i.test(err.message || ''))) {
      model = await pickGroqModel(s.groq_key); db.updateSettings({ groq_model: model }); continue;
    }
    if (r.status === 400 && (err.code === 'json_validate_failed' || /validate JSON/i.test(err.message || ''))) {
      if (err.failed_generation) { try { return parseJson(err.failed_generation); } catch {} }
      strict = false; continue;
    }
    if (r.status === 429 || r.status >= 500) { await sleep(12000 * (attempt + 1)); continue; }
    if (!r.ok) { const e = new Error(r.status === 401 ? 'This Groq key is not valid. Copy it again from console.groq.com/keys.' : 'Groq: ' + (err.message || r.status)); e.fatal = true; throw e; }
    const text = j.choices?.[0]?.message?.content || '';
    if (!json) return text;
    try { return parseJson(text); }
    catch { strict = false; if (attempt >= 4) throw new Error('Groq returned an unreadable script. Press Try again.'); }
  }
  throw new Error('Groq is busy (free-tier rate limit). It will work again in a minute.');
}

function hasWriter() { const s = db.settings(); return !!(s.gemini_key || s.groq_key); }

// Uses Gemini first; if Gemini fails and a Groq key exists, Groq takes over automatically.
async function generate(prompt, { json = true, temperature = 0.9, only } = {}) {
  const s = db.settings();
  if (!s.gemini_key && !s.groq_key) throw new Error('Add a Gemini or Groq key in Connections first.');
  const order = only ? [only] : [s.gemini_key && 'gemini', s.groq_key && 'groq'].filter(Boolean);
  let last;
  for (const w of order) {
    try { return await (w === 'gemini' ? viaGemini : viaGroq)(prompt, { json, temperature }); }
    catch (e) { last = e; }
  }
  throw last;
}

function formatName(ratio) {
  return { '9:16': 'vertical short / reel', '16:9': 'horizontal YouTube video', '1:1': 'square feed video', '4:5': 'portrait feed video' }[ratio] || ratio;
}

async function writeScript({ topic, language, style, ratio, duration }) {
  const words = Math.round(duration * 2.4);
  const scenes = Math.max(4, Math.min(40, Math.round(duration / 6)));
  const look = (STYLES[style] || STYLES.cartoon).prompt;
  const stock = style === 'stock';
  const prompt = `You are a top scriptwriter for viral faceless video channels.
Write a complete video plan.

Topic: ${topic}
Narration language: ${language} (title, description and narration must be in ${language}; visual prompts and search words must be in English)
Format: ${ratio} ${formatName(ratio)}
Target narration length: about ${duration} seconds (around ${words} spoken words in total)
Visual look: ${look}

Return ONLY this JSON:
{
 "title": "catchy title under 90 characters, no clickbait lies",
 "description": "2-4 sentence description for YouTube",
 "tags": ["8 to 15 search keywords"],
 "hashtags": ["#five", "#to", "#eight"],
 "music_mood": "one of: upbeat, calm, epic, dark, happy, emotional, funny, mysterious",
 "character": "${stock ? '' : 'one-sentence fixed visual description of the main character (species/age/clothes/colors), or empty if none'}",
 "scenes": [
  {"narration": "what the narrator says in this scene, 1-3 sentences",
   "visual": "${stock ? 'short English description of the shot' : 'detailed English image prompt for this scene; if a main character appears, repeat the exact character description'}",
   "stock_query": "2-4 English words to search stock footage",
   "sfx": "1-3 English words for a realistic sound effect, or empty"}
 ]
}
Rules:
- ${scenes} scenes (you may use a few more or fewer).
- Scene 1 is a hook that grabs attention in under 3 seconds.
- Short sentences, natural spoken rhythm, no stage directions inside narration.
- Last scene ends with a short call to follow or subscribe.
- Sound effects: leave sfx EMPTY for most scenes. Only add one when the scene shows a clear physical event that makes a real sound (door slam, thunder, crowd cheering, footsteps, splash). Never add weather or ambience sounds that the scene does not show.`;
  const out = await generate(prompt);
  if (!Array.isArray(out.scenes) || !out.scenes.length) throw new Error('The script came back without scenes.');
  out.scenes = out.scenes.filter(s => s && s.narration).slice(0, 45);
  out.tags = Array.isArray(out.tags) ? out.tags : [];
  out.hashtags = Array.isArray(out.hashtags) ? out.hashtags.map(h => h.startsWith('#') ? h : '#' + h) : [];
  return out;
}

// Cinematic plan for Veo / Flow: 8-second shots where the character speaks.
async function writeShots({ topic, language, style, ratio, duration, narrator }) {
  const shots = Math.max(1, Math.min(12, Math.round(duration / 8)));
  const look = (STYLES[style === 'stock' ? 'cinematic' : style] || STYLES.cinematic).prompt;
  const prompt = `You are a film director planning a short ${ratio === '16:9' ? 'widescreen' : 'vertical'} video made of ${shots} separate 8-second AI video shots (Google Veo).
Topic: ${topic}
Language of speech, title and description: ${language}
Visual look: ${look}

Return ONLY this JSON:
{
 "title": "catchy title in ${language}, under 90 characters",
 "description": "2-3 sentences in ${language}",
 "tags": ["8 to 12 keywords"],
 "hashtags": ["#five", "#to", "#eight"],
 "music_mood": "one of: upbeat, calm, epic, dark, happy, emotional, funny, mysterious",
 "character": "ONE fixed, very specific English description of the main character reused in every shot: age range, face, skin tone, hair style and colour, exact clothing with colours, accessories",
 "setting": "one fixed English description of the main location, time of day and lighting",
 "shots": [
  {"visual": "English: exactly what happens in this 8-second shot: action, expression, background, lighting",
   "camera": "English: shot size and camera movement, e.g. slow push-in medium close-up",
   "dialogue": "${narrator ? 'narration line' : 'what the character says to camera'} in ${language}, natural spoken words, at most 18 words so it fits 8 seconds",
   "sound": "English: ambient sound and effects that fit the shot"}
 ]
}
Rules: exactly ${shots} shots. Shot 1 hooks instantly. Keep the same character, clothes and setting in every shot (continuity). Each shot is a complete moment. The last line invites viewers to follow. No text or subtitles inside the video.`;
  const out = await generate(prompt);
  if (!Array.isArray(out.shots) || !out.shots.length) throw new Error('The shot list came back empty.');
  out.shots = out.shots.slice(0, shots);
  out.tags = Array.isArray(out.tags) ? out.tags : [];
  out.hashtags = Array.isArray(out.hashtags) ? out.hashtags.map(h => h.startsWith('#') ? h : '#' + h) : [];
  out.scenes = out.shots.map(sh => ({ narration: sh.dialogue || '', visual: sh.visual, sfx: '' })); // for display
  return out;
}

async function topicIdea(niche, language, avoid = []) {
  const out = await generate(`Suggest ONE fresh, specific video topic for a faceless channel about "${niche || 'surprising facts'}".
It should have strong viral potential (curiosity, emotion or surprise). Write it in ${language}.
Avoid these recent topics: ${avoid.slice(0, 30).join(' | ') || 'none'}.
Return ONLY JSON: {"topic": "..."}`, { temperature: 1.1 });
  return out.topic;
}

async function ideas(niche, language) {
  const out = await generate(`Give 8 specific, viral-potential video topics for a faceless channel about "${niche || 'surprising facts'}", written in ${language}.
Each under 80 characters. Return ONLY JSON: {"ideas": ["..."]}`, { temperature: 1.1 });
  return (out.ideas || []).slice(0, 8);
}

module.exports = { generate, writeScript, writeShots, topicIdea, ideas, pickModel, hasWriter };
