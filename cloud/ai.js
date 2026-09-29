// Optional: Gemini (free key from aistudio.google.com) writes the title, caption and hashtags.
const st = require('./state');

async function write({ about, name, language }) {
  const s = await st.settings();
  if (!s.gemini_key) throw new Error('Add a free Gemini key in Settings, App keys, to use this.');
  const hint = String(about || '').trim() || String(name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  if (!hint) throw new Error('Type a few words about the video in the title box first.');
  const prompt = `Write social media text for a video that will be posted on YouTube, Instagram Reels, Facebook, LinkedIn and X.
What the video is about: ${hint}
Language: ${language || 'English'} (hashtags may mix in popular English tags)
Return ONLY JSON: {"title": "catchy honest title under 90 characters", "description": "2-4 engaging sentences ending with a call to follow", "hashtags": ["8 to 12 relevant hashtags, each starting with #"]}`;
  let last = '';
  for (const model of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(s.gemini_key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.9, responseMimeType: 'application/json' } }),
      signal: AbortSignal.timeout(45000)
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 400 && /API key/i.test(j.error?.message || '')) throw new Error('This Gemini key is not valid. Copy it again from aistudio.google.com/apikey.');
    if (!r.ok) { last = j.error?.message || String(r.status); continue; }
    const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    try {
      const o = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim());
      return { title: String(o.title || '').slice(0, 100), description: String(o.description || ''), hashtags: (o.hashtags || []).map(String).slice(0, 15) };
    } catch { last = 'unreadable answer'; }
  }
  throw new Error('Gemini could not write it right now (' + last + '). Try again in a minute.');
}
module.exports = { write };
