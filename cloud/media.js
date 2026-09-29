// Getting a video ready to post, inside one Vercel function (1 CPU, 5 minutes):
// - one video that is already MP4 (H.264 + AAC), like Google Flow clips, is used as it is;
// - other single videos are converted;
// - several videos are joined: instantly when they share the same format (Flow clips do),
//   otherwise they are fitted to one frame size and encoded once.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function ffmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try { const p = require('ffmpeg-static'); if (p && fs.existsSync(p)) return p; } catch {}
  return 'ffmpeg';
}

function run(args, { cwd, timeout = 280000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg(), args, { cwd });
    let err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('timeout')); }, timeout);
    p.stderr.on('data', d => { err += d; if (err.length > 200000) err = err.slice(-100000); });
    p.on('error', e => { clearTimeout(t); reject(e); });
    p.on('close', code => { clearTimeout(t); code === 0 ? resolve(err) : reject(Object.assign(new Error('ffmpeg failed: ' + err.split('\n').filter(Boolean).slice(-3).join(' ').slice(0, 400)), { log: err })); });
  });
}

// Reads what ffmpeg says about a file (no ffprobe needed).
async function probe(file) {
  let out = '';
  try { await run(['-hide_banner', '-i', file], { timeout: 30000 }); } catch (e) { out = e.log || e.message; }
  const dur = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(out);
  const vline = (/Stream #\S+.*?Video:\s*(.+)/.exec(out) || [])[1] || '';
  const aline = (/Stream #\S+.*?Audio:\s*(.+)/.exec(out) || [])[1] || '';
  const size = /,\s*(\d{2,5})x(\d{2,5})[\s,\[]/.exec(vline);
  if (!vline || !size) throw new Error('not a video');
  let w = +size[1], h = +size[2];
  const rot = /rotation of (-?[\d.]+) degrees/.exec(out) || /rotate\s*:\s*(-?\d+)/.exec(out);
  const rotated = rot ? Math.abs(Math.round(Number(rot[1]))) % 180 === 90 : false;
  if (rotated) [w, h] = [h, w];
  const fps = /([\d.]+) fps/.exec(vline);
  const hz = /(\d+) Hz/.exec(aline);
  return {
    duration: dur ? +dur[1] * 3600 + +dur[2] * 60 + parseFloat(dur[3]) : 0,
    w, h, rotated: !!rot && Number(rot[1]) !== 0,
    vcodec: vline.split(/[\s,(]/)[0], pix: (/\b(yuv\w+|nv12|p010\w*)/.exec(vline) || [])[1] || '',
    fps: fps ? parseFloat(fps[1]) : 30,
    acodec: aline ? aline.split(/[\s,(]/)[0] : null, hz: hz ? +hz[1] : 0, stereo: /stereo/.test(aline),
    container: (/Input #0, ([^,]+(?:,[^,]+)*?), from/.exec(out) || [])[1] || ''
  };
}

const RATIOS = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] };
function ratioOf(w, h) {
  const r = w / h;
  return Object.entries({ '9:16': 9 / 16, '4:5': 4 / 5, '1:1': 1, '16:9': 16 / 9 }).reduce((a, b) => Math.abs(Math.log(b[1] / r)) < Math.abs(Math.log(a[1] / r)) ? b : a)[0];
}
const even = n => Math.max(2, Math.round(n / 2) * 2);
const postable = i => i.vcodec === 'h264' && (!i.pix || i.pix === 'yuv420p') && (!i.acodec || i.acodec === 'aac') && !i.rotated;

function fitChain(W, H, fit) {
  if (fit === 'crop') return `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;
  if (fit === 'bars') return `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`;
  const w = even(W / 6), h = even(H / 6);
  return `split[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=6:2,scale=${W}:${H},eq=brightness=-0.08[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
}

/**
 * srcs: local files in order. opts: { join, ratio: 'auto'|'9:16'|..., fit: 'blur'|'bars'|'crop', timeLeft }
 * Returns { file, reused, info } where reused means the single source can be posted as it is.
 */
async function prepare(srcs, opts, dir, onStep = () => {}) {
  const infos = [];
  for (const [k, f] of srcs.entries()) {
    try { infos.push(await probe(f)); } catch { throw new Error(`Video ${k + 1} is not a video file KMR Studio can read. Use MP4 or MOV.`); }
    if (infos[k].duration < 0.5) throw new Error(`Video ${k + 1} is shorter than half a second.`);
  }
  const out = path.join(dir, 'final.mp4');
  const enc = speedy => ['-c:v', 'libx264', '-preset', speedy ? 'ultrafast' : 'veryfast', '-crf', speedy ? '22' : '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart'];
  const total = infos.reduce((a, i) => a + i.duration, 0);

  if (!opts.join || srcs.length === 1) {
    const i = infos[0];
    if (postable(i) && /mp4/i.test(i.container) && /\.mp4$/i.test(srcs[0])) return { file: srcs[0], reused: true, info: i };
    if (postable(i)) {
      onStep('Changing the file to MP4');
      await run(['-y', '-i', srcs[0], '-map', '0:v:0', '-map', '0:a:0?', '-c', 'copy', '-movflags', '+faststart', out]);
    } else {
      onStep('Converting to MP4 (H.264) so every platform accepts it');
      const sc = Math.min(1, 1080 / Math.min(i.w, i.h));
      await run(['-y', '-i', srcs[0], '-vf', `scale=${even(i.w * sc)}:${even(i.h * sc)},setsar=1`, '-map', '0:v:0', '-map', '0:a:0?', ...enc(total > 60), out], { timeout: opts.timeLeft() - 30000 });
    }
    return { file: out, reused: false, info: await probe(out) };
  }

  // joining
  const first = infos[0];
  const ratio = opts.ratio && opts.ratio !== 'auto' ? opts.ratio : ratioOf(first.w, first.h);
  const same = infos.every(i => postable(i) && i.w === first.w && i.h === first.h && i.acodec === first.acodec && i.hz === first.hz && Math.abs(i.fps - first.fps) < 0.5)
    && (!opts.ratio || opts.ratio === 'auto' || ratioOf(first.w, first.h) === opts.ratio);
  if (same) {
    onStep(`Joining ${srcs.length} videos (same format, no quality loss)`);
    fs.writeFileSync(path.join(dir, 'list.txt'), srcs.map(s => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
    await run(['-y', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-c', 'copy', '-movflags', '+faststart', out]);
    return { file: out, reused: false, info: await probe(out), ratio, copied: true };
  }
  // different sizes: fit each into one frame and encode once
  let [W, H] = RATIOS[ratio];
  const pixels = total * W * H;
  if (pixels > 240 * 1080 * 1920) [W, H] = [even(W * 2 / 3), even(H * 2 / 3)]; // long mixes are made in 720p so they finish in time
  const budget = opts.timeLeft() - 40000;
  const est = total * W * H / (1080 * 1920) * 900; // measured about 0.35 s of work per second of 1080p video on one CPU; allow for a slower one
  if (est > budget) throw new Error(`These videos are too long to join in one go here (about ${Math.round(total)} seconds in different sizes). Join up to about ${Math.max(20, Math.round(total * budget / est))} seconds at a time, or use clips of the same size (Flow clips join instantly).`);
  onStep(`Joining ${srcs.length} videos into one ${ratio} video (${W}x${H})`);
  const args = ['-y'];
  srcs.forEach(s => args.push('-i', s));
  const silent = [];
  infos.forEach((i, k) => { if (!i.acodec) { silent[k] = srcs.length + silent.filter(x => x !== undefined).length; args.push('-f', 'lavfi', '-t', i.duration.toFixed(3), '-i', 'anullsrc=r=44100:cl=stereo'); } });
  const parts = infos.map((i, k) => {
    const a = i.acodec ? `[${k}:a:0]` : `[${silent[k]}:a]`;
    return `[${k}:v:0]${fitChain(W, H, opts.fit).replace(/\[a\]/g, `[a${k}]`).replace(/\[b\]/g, `[b${k}]`).replace(/\[bg\]/g, `[bg${k}]`).replace(/\[fg\]/g, `[fg${k}]`)},setsar=1,fps=30,format=yuv420p,trim=duration=${i.duration.toFixed(3)},setpts=PTS-STARTPTS[v${k}];` +
      `${a}aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,atrim=duration=${i.duration.toFixed(3)},asetpts=PTS-STARTPTS[s${k}]`;
  });
  const fc = parts.join(';') + ';' + infos.map((_, k) => `[v${k}][s${k}]`).join('') + `concat=n=${infos.length}:v=1:a=1[v][a]`;
  args.push('-filter_complex', fc, '-map', '[v]', '-map', '[a]', ...enc(true), out);
  try { await run(args, { timeout: budget }); }
  catch (e) { if (e.message === 'timeout') throw new Error('Joining took too long here. Join fewer or shorter videos at a time.'); throw e; }
  return { file: out, reused: false, info: await probe(out), ratio };
}

// Length in seconds of any media file (also sound-only files).
async function durationOf(file) {
  let out = '';
  try { await run(['-hide_banner', '-i', file], { timeout: 30000 }); } catch (e) { out = e.log || ''; }
  const d = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(out);
  return d ? +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]) : 0;
}

function tmpDir(id) { const d = path.join(os.tmpdir(), 'kmr-' + id + '-' + Date.now()); fs.mkdirSync(d, { recursive: true }); return d; }

module.exports = { probe, prepare, ratioOf, tmpDir, run, ffmpeg, durationOf };
