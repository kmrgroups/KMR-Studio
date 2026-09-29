// AI that watches the video: Gemini (free key) looks at frames and listens to the sound, then writes
// the title, description and hashtags, picks the best frame and a short headline for the thumbnail.
// Thumbnails are made with ffmpeg: the frame, a dark fade at the bottom and the headline (English, Tamil or Hindi fonts).
const fs = require('fs');
const os = require('os');
const path = require('path');
const media = require('./media');
const st = require('./state');

// Fonts are read by name so Vercel packs them with the function; ffmpeg gets them from a temp folder.
let fontDir;
function fonts() {
  if (fontDir && fs.existsSync(fontDir)) return fontDir;
  fontDir = path.join(os.tmpdir(), 'kmr-fonts');
  fs.mkdirSync(fontDir, { recursive: true });
  fs.writeFileSync(path.join(fontDir, 'Anton.ttf'), fs.readFileSync(path.join(__dirname, 'fonts', 'Anton.ttf')));
  fs.writeFileSync(path.join(fontDir, 'NotoSansTamil.ttf'), fs.readFileSync(path.join(__dirname, 'fonts', 'NotoSansTamil.ttf')));
  fs.writeFileSync(path.join(fontDir, 'NotoSansDevanagari.ttf'), fs.readFileSync(path.join(__dirname, 'fonts', 'NotoSansDevanagari.ttf')));
  return fontDir;
}

// Evenly spread frames (small JPEGs for the AI). Returns [{file, t}]
async function grabFrames(file, duration, n, dir, tag = 'f') {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = Math.max(0, Math.min(duration - 0.2, duration * (i + 1) / (n + 1)));
    const f = path.join(dir, `${tag}${i}.jpg`);
    await media.run(['-y', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=512:-2', '-q:v', '5', f], { timeout: 30000 }).catch(() => {});
    if (fs.existsSync(f)) out.push({ file: f, t, src: file });
  }
  return out;
}
async function grabAudio(file, maxSec, dir, tag = 'a') {
  const f = path.join(dir, tag + '.mp3');
  try { await media.run(['-y', '-i', file, '-t', String(maxSec), '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', f], { timeout: 40000 }); } catch { return null; }
  return fs.existsSync(f) && fs.statSync(f).size > 2000 ? f : null;
}

async function gemini(key, parts) {
  let last = '';
  for (const model of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.8, responseMimeType: 'application/json' } }),
      signal: AbortSignal.timeout(70000)
    }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const j = await r.json().catch(() => ({}));
    if (r.status === 400 && /API key/i.test(j.error?.message || '')) throw new Error('The Gemini key is not valid. Copy it again from aistudio.google.com/apikey and save it in Settings.');
    if (!r.ok) { last = j.error?.message || String(r.status); continue; }
    const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    try { return JSON.parse(text.replace(/^\s*```(json)?|```\s*$/g, '').trim()); } catch { last = 'unreadable answer'; }
  }
  throw new Error('Gemini could not look at the video right now (' + last + '). Try again in a minute, or type the text yourself.');
}

/**
 * Watches the video(s) and writes the text.
 * clips: [{ file, info }] in order (one video, or the clips that will be joined).
 * Returns { title, description, hashtags[], thumb_text, frames: [{file,t,src}], best }
 */
async function analyze(clips, { hint = '', dir }) {
  const s = await st.settings();
  if (!s.gemini_key) throw new Error('Add a free Gemini key in Settings so the AI can write titles, captions and hashtags.');
  const total = clips.reduce((a, c) => a + c.info.duration, 0);
  const per = Math.max(1, Math.min(4, Math.round(8 / clips.length)));
  const frames = [];
  for (const [k, c] of clips.entries()) frames.push(...await grabFrames(c.file, c.info.duration, clips.length === 1 ? 8 : per, dir, `c${k}f`));
  const audios = [];
  for (const [k, c] of clips.entries()) {
    if (!c.info.acodec) continue;
    const a = await grabAudio(c.file, Math.max(10, Math.round(120 / clips.length)), dir, `c${k}a`);
    if (a) audios.push(a);
  }
  const lang = s.text_language || 'English';
  const parts = [{ text:
`You are the social media editor for KMR Group. Watch these ${frames.length} frames (numbered 0 to ${frames.length - 1}, in time order) and listen to the sound of a ${Math.round(total)}-second video that will be posted on YouTube, Instagram Reels, Facebook, LinkedIn and X.
${hint ? `The owner says the video is about: ${hint}\n` : ''}Write in ${lang}. Be accurate: describe only what is really shown or said.
Return ONLY JSON:
{"title": "catchy, honest title under 80 characters, with the main keyword early",
 "description": "3 to 5 short sentences: what happens, why it matters, and a call to follow or comment",
 "hashtags": ["12 to 15 hashtags, most relevant first, mixing specific and popular ones, each starting with #"],
 "thumb_text": "2 to 4 punchy words for the thumbnail, in ${lang}",
 "best_frame": "number of the frame that makes the most eye-catching thumbnail: sharp, clear subject or face, not a fade or transition"}` }];
  frames.forEach((f, i) => parts.push({ text: `Frame ${i}` }, { inline_data: { mime_type: 'image/jpeg', data: fs.readFileSync(f.file).toString('base64') } }));
  audios.forEach(a => parts.push({ inline_data: { mime_type: 'audio/mp3', data: fs.readFileSync(a).toString('base64') } }));
  const o = await gemini(s.gemini_key, parts);
  const best = Math.max(0, Math.min(frames.length - 1, parseInt(o.best_frame, 10) || 0));
  const tags = (Array.isArray(o.hashtags) ? o.hashtags : String(o.hashtags || '').split(/[\s,]+/)).map(String).filter(Boolean).slice(0, 15);
  return { title: String(o.title || '').replace(/\s+/g, ' ').trim().slice(0, 100), description: String(o.description || '').trim(), hashtags: tags, thumb_text: String(o.thumb_text || '').trim().slice(0, 40), frames, best };
}

// ---- thumbnails ----
const script = t => /[஀-௿]/.test(t) ? 'tamil' : /[ऀ-ॿ]/.test(t) ? 'hindi' : 'latin';
function assFor(text, W, H) {
  const sc = script(text);
  const vertical = H > W;
  const font = sc === 'tamil' ? 'Noto Sans Tamil' : sc === 'hindi' ? 'Noto Sans Devanagari' : 'Anton';
  const shown = sc === 'latin' ? text.toUpperCase() : text;
  const words = shown.split(/\s+/).filter(Boolean);
  // two balanced lines when it is long (always on tall videos), so the words can be big
  const L = w => [...w.join(' ')].length;
  let lines = [words];
  if (words.length > 1 && (vertical ? L(words) > 8 : L(words) > 16)) {
    let best = 1, diff = 1e9;
    for (let k = 1; k < words.length; k++) { const d = Math.abs(L(words.slice(0, k)) - L(words.slice(k))); if (d < diff) { diff = d; best = k; } }
    lines = [words.slice(0, best), words.slice(best)];
  }
  const longest = Math.max(...lines.map(L));
  const base = vertical ? (sc === 'latin' ? 300 : 190) : (sc === 'latin' ? 170 : 115);
  const size = Math.round(base * Math.min(1, (vertical ? 8 : 13) / Math.max(1, longest)) ** 0.8);
  // the last line in amber, the first in white
  const safe = lines.length > 1 ? lines[0].join(' ') + '\\N{\\c&H0047B5FF&}' + lines[1].join(' ') : (words.length > 1 ? words.slice(0, -1).join(' ') + ' {\\c&H0047B5FF&}' + words.at(-1) : '{\\c&H0047B5FF&}' + shown);
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: T,${font},${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,${sc === 'latin' ? 0 : -1},0,0,0,100,100,${sc === 'latin' ? 2 : 0},0,1,${Math.round(size / 14)},${Math.round(size / 22)},${vertical ? 2 : 1},${Math.round(W * 0.06)},${Math.round(W * 0.06)},${vertical ? Math.round(H * 0.2) : Math.round(H * 0.08)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,T,,0,0,0,,${safe}
`;
}
// Makes one thumbnail JPEG from a video at time t. W x H follows the video's shape.
async function thumbnail(file, t, text, W, H, out) {
  const dir = path.dirname(out);
  const frame = out.replace(/\.jpg$/, '-src.png');
  await media.run(['-y', '-ss', Math.max(0, t).toFixed(2), '-i', file, '-frames:v', '1', frame], { timeout: 30000 });
  const vf = [`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, 'eq=contrast=1.06:saturation=1.12', 'format=rgba'];
  const args = ['-y', '-i', frame];
  const clean = String(text || '').replace(/[{}\\]/g, '').trim();
  if (clean) {
    const assFile = path.join(dir, path.basename(out, '.jpg') + '.ass');
    fs.writeFileSync(assFile, assFor(clean, W, H));
    args.push('-f', 'lavfi', '-i', `color=c=black:s=${W}x${H},format=rgba,geq=r=0:g=0:b=0:a='255*0.82*clip((Y/H-0.42)/0.58\\,0\\,1)'`);
    args.push('-filter_complex', `[0:v]${vf.join(',')}[bg];[bg][1:v]overlay=0:0,ass=${assFile}:fontsdir=${fonts()}[v]`, '-map', '[v]');
  } else args.push('-vf', vf.join(','));
  args.push('-frames:v', '1', '-q:v', '3', out);
  await media.run(args, { timeout: 40000 });
  fs.rmSync(frame, { force: true });
  if (fs.statSync(out).size > 1900000) await media.run(['-y', '-i', out, '-q:v', '8', out + '.jpg'], { timeout: 20000 }).then(() => fs.renameSync(out + '.jpg', out)); // YouTube allows up to 2 MB
  return out;
}
const thumbSize = (w, h) => h > w ? [1080, 1920] : Math.abs(w / h - 1) < 0.1 ? [1080, 1080] : [1280, 720];

module.exports = { analyze, thumbnail, thumbSize, grabFrames, fonts };
