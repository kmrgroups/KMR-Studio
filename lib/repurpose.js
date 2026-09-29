// Video to video: turn a long video into vertical Shorts.
// Transcribe (Groq Whisper, or Gemini as backup) -> pick the best moments -> cut, reframe to 9:16, add subtitles.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { DATA, ensureDir, run, probeDuration, sleep, uid } = require('./util');
const gemini = require('./gemini');
const { writeAss } = require('./render');

const toolDir = () => ensureDir(path.join(DATA, 'tools'));

async function groqTranscribe(file, offset) {
  const s = db.settings();
  for (let attempt = 0; attempt < 4; attempt++) {
    const fd = new FormData();
    fd.append('file', new Blob([fs.readFileSync(file)], { type: 'audio/mpeg' }), 'audio.mp3');
    fd.append('model', 'whisper-large-v3-turbo');
    fd.append('response_format', 'verbose_json');
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + s.groq_key }, body: fd, signal: AbortSignal.timeout(600000) });
    const j = await r.json().catch(() => ({}));
    if (r.status === 429 || r.status >= 500) { await sleep(20000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error('Groq transcription: ' + (j.error?.message || r.status));
    return { language: j.language, segments: (j.segments || []).map(x => ({ start: x.start + offset, end: x.end + offset, text: String(x.text || '').trim() })) };
  }
  throw new Error('Groq transcription is busy. Try again in a few minutes.');
}

async function geminiTranscribe(file, offset) {
  const s = db.settings();
  const data = fs.readFileSync(file).toString('base64');
  const model = s.gemini_model || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${s.gemini_key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(600000),
    body: JSON.stringify({
      contents: [{ parts: [{ inline_data: { mime_type: 'audio/mp3', data } }, { text: 'Transcribe this audio in its original language. Return ONLY JSON: {"language":"...","segments":[{"start":seconds,"end":seconds,"text":"..."}]} with one segment per sentence and accurate times.' }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Gemini transcription: ' + (j.error?.message || r.status));
  const text = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  const out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  return { language: out.language, segments: (out.segments || []).map(x => ({ start: +x.start + offset, end: +x.end + offset, text: String(x.text || '').trim() })) };
}

async function transcribe(src, work, note) {
  const s = db.settings();
  if (!s.groq_key && !s.gemini_key) throw new Error('Add a Groq or Gemini key in Connections. It is used to transcribe the video.');
  const total = await probeDuration(src);
  const CHUNK = 600; // 10-minute pieces keep each upload small
  const segments = []; let language = '';
  for (let off = 0, n = 0; off < total; off += CHUNK, n++) {
    note(`Transcribing ${Math.min(100, Math.round((off / total) * 100))}%`);
    const a = path.join(work, `a${n}.mp3`);
    await run('ffmpeg', ['-y', '-ss', String(off), '-t', String(CHUNK), '-i', src, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', a]);
    let r;
    if (s.groq_key) { try { r = await groqTranscribe(a, off); } catch (e) { if (!s.gemini_key) throw e; } }
    if (!r) r = await geminiTranscribe(a, off);
    language = language || r.language || '';
    segments.push(...r.segments.filter(x => x.text && x.end > x.start));
    fs.rmSync(a, { force: true });
  }
  if (!segments.length) throw new Error('No speech was found in this video.');
  return { language, segments, total };
}

async function pickMoments({ segments, total, count, minLen, maxLen }) {
  let lines = segments.map(x => `[${x.start.toFixed(1)}-${x.end.toFixed(1)}] ${x.text}`).join('\n');
  if (lines.length > 90000) lines = lines.slice(0, 90000);
  const out = await gemini.generate(`You are a viral Shorts editor. Below is a timestamped transcript of a ${Math.round(total / 60)}-minute video.
Pick the ${count} best self-contained moments for YouTube Shorts / Instagram Reels.
Each clip: ${minLen}-${maxLen} seconds, starts at the beginning of a sentence with a strong hook, ends on a complete thought, and makes sense without context.
Use only times that appear in the transcript. Write titles, descriptions and hashtags in the same language as the transcript.

Transcript:
${lines}

Return ONLY JSON: {"clips":[{"start":12.3,"end":55.0,"title":"under 90 characters","description":"1-2 sentences","hashtags":["#a","#b","#c"],"why":"why it will hold attention"}]}`);
  return (out.clips || []).map(c => ({ ...c, start: Math.max(0, +c.start), end: Math.min(total, +c.end) }))
    .filter(c => c.end - c.start >= Math.min(10, minLen) && c.end - c.start <= maxLen + 15)
    .slice(0, count);
}

async function cutClip({ src, clip, segments, dir, reframe, subtitles }) {
  const W = 1080, H = 1920;
  const dur = clip.end - clip.start;
  const vf = reframe === 'crop'
    ? `scale=-2:${H},crop=${W}:${H}`
    : `split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:6,eq=brightness=-0.08[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
  let chain = `[0:v]${vf}`;
  if (subtitles) {
    const cues = segments.filter(x => x.end > clip.start && x.start < clip.end)
      .map(x => ({ start: Math.max(0, x.start - clip.start), end: Math.min(dur, x.end - clip.start), text: x.text }));
    writeAss({ dir, cues, W, H });
    chain += `,subtitles=subs.ass`;
  }
  chain += ',format=yuv420p[v]';
  await run('ffmpeg', ['-y', '-ss', clip.start.toFixed(2), '-t', dur.toFixed(2), '-i', src, '-filter_complex', chain,
    '-map', '[v]', '-map', '0:a?', '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '44100',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', 'final.mp4'], { cwd: dir });
  await run('ffmpeg', ['-y', '-ss', '0.8', '-i', 'final.mp4', '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', 'thumb.jpg'], { cwd: dir });
  return probeDuration(path.join(dir, 'final.mp4'));
}

// ---- queue (one at a time, runs on this computer) ----
let busy = false;
async function next() {
  if (busy) return;
  const t = db.tools().filter(x => x.kind === 'repurpose' && x.status === 'queued').sort((a, b) => a.created - b.created)[0];
  if (!t) return;
  busy = true;
  const note = m => db.updateTool(t.id, { note: m });
  db.updateTool(t.id, { status: 'working' });
  const work = ensureDir(path.join(DATA, 'tmp', 'rep_' + t.id));
  try {
    const src = path.join(toolDir(), t.source);
    const { language, segments, total } = await transcribe(src, work, note);
    note('Finding the best moments');
    const clips = await pickMoments({ segments, total, count: t.count, minLen: t.minLen, maxLen: t.maxLen });
    if (!clips.length) throw new Error('No good moments were found. Try a video with more talking.');
    const pipeline = require('./pipeline');
    const made = [];
    for (let i = 0; i < clips.length; i++) {
      note(`Cutting Short ${i + 1} of ${clips.length}`);
      const job = pipeline.addReadyJob({
        title: clips[i].title, description: `${clips[i].description || ''}`, hashtags: clips[i].hashtags || [],
        language: language || db.settings().default_language, source: 'repurpose', topic: clips[i].why || clips[i].title
      });
      const dir = pipeline.jobDir(job.id);
      const duration = await cutClip({ src, clip: clips[i], segments, dir, reframe: t.reframe, subtitles: t.subtitles });
      pipeline.finishReadyJob(job.id, { duration });
      made.push(job.id);
    }
    db.updateTool(t.id, { status: 'done', note: `${made.length} Shorts are waiting for your OK in the Library`, jobs: made });
  } catch (e) {
    db.updateTool(t.id, { status: 'failed', note: e.message });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    busy = false; setTimeout(next, 500);
  }
}

function create({ source, name, count, minLen, maxLen, reframe, subtitles }) {
  const t = {
    id: uid(), created: Date.now(), kind: 'repurpose', source, prompt: name || 'Uploaded video', ratio: '9:16',
    count: Math.max(1, Math.min(10, Number(count) || 3)), minLen: Math.max(10, Number(minLen) || 25), maxLen: Math.min(180, Number(maxLen) || 60),
    reframe: reframe === 'crop' ? 'crop' : 'fit', subtitles: subtitles !== false, status: 'queued', note: 'Queued'
  };
  db.addTool(t); setImmediate(next); return t;
}

function start() {
  for (const t of db.tools()) if (t.kind === 'repurpose' && t.status === 'working') db.updateTool(t.id, { status: 'queued' });
  next(); setInterval(next, 30000);
}

module.exports = { create, start };
