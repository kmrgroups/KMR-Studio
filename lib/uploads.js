// Upload and post: your own videos go to every connected platform.
// One video, several videos posted one by one, or several videos joined into one.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { DATA, ensureDir, run, uid } = require('./util');
const { dims } = require('./render');

const STAGE = () => ensureDir(path.join(DATA, 'uploads'));
const VIDEO_EXT = ['.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi', '.3gp'];
const FPS = 30;

async function probe(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,pix_fmt:stream_tags=rotate:stream_side_data=rotation:format=duration,format_name', '-of', 'json', file]);
  const p = JSON.parse(out);
  const v = (p.streams || []).find(s => s.codec_type === 'video');
  const a = (p.streams || []).find(s => s.codec_type === 'audio');
  if (!v || !v.width) throw new Error('This file has no video KMR Studio can read.');
  let w = v.width, h = v.height;
  const rot = Math.abs(Number(v.tags?.rotate || (v.side_data_list || []).find(x => x.rotation !== undefined)?.rotation || 0));
  if (rot === 90 || rot === 270) [w, h] = [h, w]; // phone videos filmed upright
  return { w, h, dur: parseFloat(p.format?.duration) || 0, vcodec: v.codec_name, pix: v.pix_fmt, acodec: a?.codec_name || null, container: p.format?.format_name || '', rotated: !!rot };
}

// Nearest supported shape for a width and height.
function ratioOf(w, h) {
  const r = w / h;
  const opts = [['9:16', 9 / 16], ['4:5', 4 / 5], ['1:1', 1], ['16:9', 16 / 9]];
  return opts.reduce((a, b) => Math.abs(Math.log(b[1] / r)) < Math.abs(Math.log(a[1] / r)) ? b : a)[0];
}

// A file the dashboard just uploaded: check it and make a preview picture.
async function stage(tmp, original) {
  const ext = (path.extname(original) || '.mp4').toLowerCase();
  const id = 'u' + uid();
  const file = id + ext;
  const dest = path.join(STAGE(), file);
  fs.renameSync(tmp, dest);
  let info;
  try { info = await probe(dest); }
  catch { fs.rmSync(dest, { force: true }); throw new Error(`${original} is not a video KMR Studio can read. Use MP4, MOV, MKV, WEBM or AVI.`); }
  if (info.dur < 1) { fs.rmSync(dest, { force: true }); throw new Error(`${original} is shorter than 1 second.`); }
  const thumb = id + '.jpg';
  await run('ffmpeg', ['-y', '-ss', String(Math.min(1, info.dur / 3)), '-i', dest, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', path.join(STAGE(), thumb)]).catch(() => {});
  return { file, thumb: fs.existsSync(path.join(STAGE(), thumb)) ? thumb : null, name: original, duration: info.dur, w: info.w, h: info.h, ratio: ratioOf(info.w, info.h), audio: !!info.acodec, size: fs.statSync(dest).size };
}

function unstage(file) {
  const f = path.basename(String(file));
  if (!/^u\w+\.\w+$/.test(f)) return;
  fs.rmSync(path.join(STAGE(), f), { force: true });
  fs.rmSync(path.join(STAGE(), f.replace(/\.\w+$/, '.jpg')), { force: true });
}

// Old staged files (uploaded but never posted) are removed after 2 days.
function sweep() {
  const old = Date.now() - 2 * 864e5;
  for (const f of fs.readdirSync(STAGE())) {
    try { if (fs.statSync(path.join(STAGE(), f)).mtimeMs < old) fs.rmSync(path.join(STAGE(), f), { force: true }); } catch {}
  }
}

const cleanTags = list => (Array.isArray(list) ? list : String(list || '').split(/[\s,]+/))
  .map(t => String(t).trim()).filter(Boolean).map(t => t.startsWith('#') ? t : '#' + t).slice(0, 30);

/**
 * body: { mode: 'each' | 'join', items: [{ file, name, title, description, hashtags }],
 *         join: { title, description, hashtags, ratio: 'auto'|'9:16'|..., fit: 'blur'|'crop' },
 *         targets: ['me:youtube', 'kmr:linkedin', ...], approve: bool }
 */
function createPosts(b) {
  const pipeline = require('./pipeline');
  const items = (Array.isArray(b.items) ? b.items : []).filter(it => it && it.file);
  if (!items.length) throw new Error('Add at least one video first.');
  for (const it of items) if (!fs.existsSync(path.join(STAGE(), path.basename(it.file)))) throw new Error(`${it.name || 'A video'} is no longer on the server. Add it again.`);
  const P = require('./platforms');
  const raw = Array.isArray(b.targets) ? b.targets : (Array.isArray(b.platforms) ? b.platforms.map(p => P.firstProfile() + ':' + p) : []);
  const targets = P.clean(raw);
  if (!targets.length) throw new Error('Choose at least one profile and platform to post to.');
  const join = b.mode === 'join' && items.length > 1;
  const s = db.settings();
  const base = name => String(name || 'My video').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 100);
  const groups = join
    ? [{ files: items, meta: { title: b.join?.title || base(items[0].name), description: b.join?.description || '', hashtags: b.join?.hashtags } }]
    : items.map(it => ({ files: [it], meta: { title: it.title || base(it.name), description: it.description || '', hashtags: it.hashtags } }));
  const made = [];
  const batch = uid();
  for (const g of groups) {
    const hashtags = cleanTags(g.meta.hashtags);
    const job = {
      id: uid(), created: Date.now(), updated: Date.now(), source: 'upload', batch,
      status: 'queued', stage: 'render', progress: 0,
      topic: String(g.meta.title).slice(0, 100), title: String(g.meta.title).slice(0, 100), description: String(g.meta.description).slice(0, 4500),
      hashtags, tags: hashtags.map(h => h.slice(1)).filter(Boolean),
      targets,
      upload: { files: [], names: g.files.map(f => f.name || f.file), join: g.files.length > 1, ratio: b.join?.ratio || 'auto', fit: b.join?.fit === 'crop' ? 'crop' : 'blur' },
      options: { language: b.language || s.default_language, style: 'upload', ratio: '9:16', duration: 0, auto_approve: !b.approve, motion: false, engine: 'upload' },
      log: []
    };
    const dir = ensureDir(pipeline.jobDir(job.id));
    g.files.forEach((f, i) => {
      const src = path.basename(f.file), name = `src_${i}${path.extname(src)}`;
      fs.renameSync(path.join(STAGE(), src), path.join(dir, name));
      fs.rmSync(path.join(STAGE(), src.replace(/\.\w+$/, '.jpg')), { force: true });
      job.upload.files.push(name);
    });
    db.addJob(job);
    db.log(job.id, job.upload.join ? `Uploaded ${g.files.length} videos to join into one` : `Uploaded ${job.upload.names[0]}`);
    made.push(job);
  }
  pipeline.kick();
  return made;
}

// ---- preparing the final file (runs in the production worker) ----
function fitFilter(W, H, fit) {
  if (fit === 'crop') return `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=${FPS},format=yuv420p`;
  return `split[a][b];[a]scale=${Math.round(W / 8) * 2}:${Math.round(H / 8) * 2}:force_original_aspect_ratio=increase,crop=${Math.round(W / 8) * 2}:${Math.round(H / 8) * 2},boxblur=12:2,scale=${W}:${H},eq=brightness=-0.08[bg];` +
    `[b]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=${FPS},format=yuv420p`;
}

const even = n => Math.max(2, Math.round(n / 2) * 2);

async function prepare(job) {
  const pipeline = require('./pipeline');
  const id = job.id, dir = pipeline.jobDir(id), u = job.upload;
  const step = (p, msg) => { db.updateJob(id, { stage: 'render', progress: Math.round(p) }); if (msg) db.log(id, msg); };
  const srcs = u.files.map(f => path.join(dir, f));
  for (const f of srcs) if (!fs.existsSync(f)) throw new Error('The uploaded file is missing. Upload the video again.');
  const infos = [];
  for (const f of srcs) infos.push(await probe(f));
  const enc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart'];
  let W, H;

  if (!u.join) {
    const i = infos[0], src = srcs[0];
    step(10, 'Preparing the video for posting');
    const ready = /mp4|mov/.test(i.container) && i.vcodec === 'h264' && (!i.pix || i.pix === 'yuv420p') && (i.acodec === 'aac') && !i.rotated;
    if (ready) {
      await run('ffmpeg', ['-y', '-i', src, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-movflags', '+faststart', 'final.mp4'], { cwd: dir });
    } else {
      // re-encode to the format every platform accepts; keep the size, at most 1080 on the short side
      const scale = Math.min(1, 1080 / Math.min(i.w, i.h), 1920 / Math.max(i.w, i.h));
      W = even(i.w * scale); H = even(i.h * scale);
      const args = ['-y', '-i', src];
      if (!i.acodec) args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
      args.push('-vf', `scale=${W}:${H}:flags=lanczos,setsar=1,format=yuv420p`, '-map', '0:v:0', '-map', i.acodec ? '0:a:0' : '1:a:0', '-shortest', ...enc, 'final.mp4');
      step(20, i.acodec ? 'Converting to MP4 (H.264 and AAC) so every platform accepts it' : 'Converting to MP4 and adding a silent sound track');
      await run('ffmpeg', args, { cwd: dir, timeout: 6 * 3600000 });
    }
  } else {
    const ratio = u.ratio && u.ratio !== 'auto' ? u.ratio : ratioOf(infos[0].w, infos[0].h);
    [W, H] = dims(ratio, '1080');
    step(5, `Joining ${srcs.length} videos into one ${ratio} video`);
    const segs = [];
    for (let k = 0; k < srcs.length; k++) {
      const i = infos[k], out = `seg_${k}.mp4`;
      const args = ['-y', '-i', srcs[k]];
      if (!i.acodec) args.push('-f', 'lavfi', '-t', String(i.dur), '-i', 'anullsrc=r=44100:cl=stereo');
      const fc = `[0:v]${fitFilter(W, H, u.fit)}[v];[${i.acodec ? '0:a:0' : '1:a'}]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`;
      args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-t', i.dur.toFixed(3), ...enc, out);
      await run('ffmpeg', args, { cwd: dir, timeout: 6 * 3600000 });
      segs.push(out);
      step(5 + 85 * (k + 1) / srcs.length, `Video ${k + 1} of ${srcs.length} ready`);
    }
    fs.writeFileSync(path.join(dir, 'segs.txt'), segs.map(s => `file '${s}'`).join('\n'));
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', 'segs.txt', '-c', 'copy', '-movflags', '+faststart', 'final.mp4'], { cwd: dir });
    for (const f of [...segs, 'segs.txt']) fs.rmSync(path.join(dir, f), { force: true });
  }

  const fin = await probe(path.join(dir, 'final.mp4'));
  await run('ffmpeg', ['-y', '-ss', String(Math.min(1, fin.dur / 3)), '-i', 'final.mp4', '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', 'thumb.jpg'], { cwd: dir });
  for (const f of srcs) fs.rmSync(f, { force: true });
  const ratio = ratioOf(fin.w, fin.h);
  db.updateJob(id, { video: 'final.mp4', thumb: 'thumb.jpg', duration: fin.dur, options: { ...db.job(id).options, ratio, duration: Math.round(fin.dur) }, status: 'review', stage: 'review', progress: 100 });
  const notes = [];
  const tg = (job.targets || []).join(' ');
  if (/:instagram\b/.test(tg) && (fin.dur < 3 || fin.dur > 900)) notes.push('Instagram Reels must be 3 seconds to 15 minutes long, so Instagram may refuse this one.');
  if (/:x\b/.test(tg) && fin.dur > 140) notes.push('X may refuse long videos on accounts without X Premium; if it does, post a shorter cut.');
  if (/:linkedin\b/.test(tg) && fin.dur > 600) notes.push('LinkedIn allows videos up to 10 minutes, so LinkedIn may refuse this one.');
  if (/:youtube\b/.test(tg) && ratio === '9:16' && fin.dur <= 180) notes.push('It will post on YouTube as a Short.');
  db.log(id, `Ready to post (${Math.round(fin.dur)}s, ${fin.w}x${fin.h}). ${notes.join(' ')}`.trim());
}

// AI writes a title, description and hashtags from a short note about the video.
async function writeText({ about, name, language }) {
  const gemini = require('./gemini');
  if (!gemini.hasWriter()) throw new Error('Connect a script writer (Gemini or Groq) in Connections to use this.');
  const hint = String(about || '').trim() || String(name || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  if (!hint) throw new Error('Type a few words about the video first, in the title box.');
  const out = await gemini.generate(`Write social media text for a video that will be posted on YouTube, Instagram Reels and Facebook.
What the video is about: ${hint}
Language: ${language || 'English'} (title, description and hashtags in this language; hashtags may mix in popular English tags)
Return ONLY JSON: {"title": "catchy honest title under 90 characters", "description": "2-4 engaging sentences with a call to follow", "hashtags": ["#8", "#to", "#12 relevant hashtags"]}`, { temperature: 0.9 });
  return { title: String(out.title || '').slice(0, 100), description: String(out.description || ''), hashtags: cleanTags(out.hashtags).slice(0, 15) };
}

module.exports = { STAGE, VIDEO_EXT, stage, unstage, sweep, createPosts, prepare, writeText, ratioOf, probe };
