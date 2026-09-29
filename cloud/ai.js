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
  const o = await require('./gemini').json(s.gemini_key, [{ text: prompt }], { temperature: 0.9, timeout: 45000 });
  return { title: String(o.title || '').slice(0, 100), description: String(o.description || ''), hashtags: (o.hashtags || []).map(String).slice(0, 15) };
}
module.exports = { write };
