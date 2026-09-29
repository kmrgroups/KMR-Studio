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
  const jobs = Array.from({ length: n }, (_, i) => {
    const t = Math.max(0, Math.min(duration - 0.2, duration * (i + 1) / (n + 1)));
    const f = path.join(dir, `${tag}${i}.jpg`);
    return media.run(['-y', '-ss', t.toFixed(2), '-i', file, '-frames:v', '1', '-vf', 'scale=448:-2', '-q:v', '6', f], { timeout: 30000 }).catch(() => {}).then(() => ({ file: f, t, src: file }));
  });
  return (await Promise.all(jobs)).filter(x => fs.existsSync(x.file));
}
async function grabAudio(file, maxSec, dir, tag = 'a') {
  const f = path.join(dir, tag + '.mp3');
  try { await media.run(['-y', '-i', file, '-t', String(maxSec), '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', f], { timeout: 40000 }); } catch { return null; }
  return fs.existsSync(f) && fs.statSync(f).size > 2000 ? f : null;
}

const gemini = (key, parts) => require('./gemini').json(key, parts);

/**
 * Watches the video(s) and writes the text.
 * clips: [{ file, info }] in order (one video, or the clips that will be joined).
 * Returns { title, description, hashtags[], thumb_text, frames: [{file,t,src}], best }
 */
async function analyze(clips, { hint = '', dir }) {
  const s = await st.settings();
  if (!s.gemini_key && !s.groq_key) throw new Error('Add a free Gemini key in Settings so the AI can write titles, captions and hashtags.');
  const total = clips.reduce((a, c) => a + c.info.duration, 0);
  const per = Math.max(1, Math.min(3, Math.round(6 / clips.length)));
  const [frameSets, audioList] = await Promise.all([
    Promise.all(clips.map((c, k) => grabFrames(c.file, c.info.duration, clips.length === 1 ? 6 : per, dir, `c${k}f`))),
    Promise.all(clips.map((c, k) => c.info.acodec ? grabAudio(c.file, Math.max(10, Math.round(90 / clips.length)), dir, `c${k}a`) : null))
  ]);
  const frames = frameSets.flat();
  const audios = audioList.filter(Boolean);
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
  let o, via = 'gemini';
  try {
    if (!s.gemini_key) throw Object.assign(new Error('no Gemini key'), { busy: true });
    o = await gemini(s.gemini_key, parts);
  } catch (e) {
    if (!s.groq_key) throw e; // any Gemini problem: the Groq backup takes over when it is set up
    // Gemini busy or down: Groq listens to the sound and writes from what is said
    const groq = require('./groq');
    const words = [];
    for (const a of audios) { const t = await groq.transcribe(s.groq_key, a).catch(() => ''); if (t) words.push(t); }
    if (!words.length && !hint) throw new Error(e.message + ' (The backup AI, Groq, needs speech in the video or a few words in the title box.)');
    const said = words.length ? 'What is said in the video:\n<<<\n' + words.join('\n').slice(0, 5000) + '\n>>>\n' : 'The video has no speech.\n';
    try {
      o = await groq.json(s.groq_key, `You are the social media editor for KMR Group. Write post text for a ${Math.round(total)}-second video for YouTube, Instagram Reels, Facebook, LinkedIn and X.
  ${hint ? 'The owner says the video is about: ' + hint + '\n' : ''}${said}Write in ${lang}. Be accurate: use only what is said or what the owner says.
  Return ONLY JSON: {"title": "catchy, honest title under 80 characters", "description": "3 to 5 short sentences ending with a call to follow or comment", "hashtags": ["12 to 15 hashtags each starting with #"], "thumb_text": "2 to 4 punchy words in ${lang}"}`);
    } catch (g) { throw new Error(e.message + ' The backup AI (Groq) did not work either: ' + g.message); }
    o.best_frame = Math.floor(frames.length / 3);
    via = 'groq';
  }
  const best = Math.max(0, Math.min(frames.length - 1, parseInt(o.best_frame, 10) || 0));
  const tags = (Array.isArray(o.hashtags) ? o.hashtags : String(o.hashtags || '').split(/[\s,]+/)).map(String).filter(Boolean).slice(0, 15);
  return { title: String(o.title || '').replace(/\s+/g, ' ').trim().slice(0, 100), description: String(o.description || '').trim(), hashtags: tags, thumb_text: String(o.thumb_text || '').trim().slice(0, 40), frames, best, via };
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
