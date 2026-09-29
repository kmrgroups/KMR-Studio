// Video assembly with FFmpeg: animated scenes, voice, music, sound effects, subtitles.
const fs = require('fs');
const path = require('path');
const { run, probeDuration } = require('./util');

const FPS = 30;

function dims(ratio, quality) {
  const base = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080], '4:5': [1080, 1350] }[ratio] || [1080, 1920];
  if (String(quality) === '720') return base.map(v => Math.round(v * 2 / 3 / 2) * 2);
  return base;
}

function motion(kind, N) {
  const cx = `x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  switch (kind) {
    case 0: return `z='1+0.16*on/${N}':${cx}`;
    case 1: return `z='1.16-0.16*on/${N}':${cx}`;
    case 2: return `z='1.14':x='(iw-iw/zoom)*on/${N}':y='ih/2-(ih/zoom/2)'`;
    default: return `z='1.14':x='(iw-iw/zoom)*(1-on/${N})':y='ih/2-(ih/zoom/2)'`;
  }
}

const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
const finalEnc = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS)];
const SHARP = 'unsharp=5:5:0.6:5:5:0';

async function sceneClip({ dir, i, src, isVideo, hold, clipDur, dur, W, H }) {
  const N = Math.round(dur * FPS);
  const out = `clip_${i}.mp4`;
  const fade = `fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0, dur - 0.25).toFixed(3)}:d=0.25`;
  if (isVideo && hold) {
    const k = Math.min(1.6, Math.max(1, dur / Math.max(0.5, clipDur || dur)));
    await run('ffmpeg', ['-y', '-i', src, '-an',
      '-vf', `setpts=${k.toFixed(3)}*PTS,scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},${SHARP},fps=${FPS},tpad=stop_mode=clone:stop_duration=${Math.ceil(dur)},${fade},format=yuv420p`,
      '-frames:v', String(N), ...enc, out], { cwd: dir });
  } else if (isVideo) {
    await run('ffmpeg', ['-y', '-stream_loop', '-1', '-i', src, '-an',
      '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},${fade},format=yuv420p`,
      '-frames:v', String(N), ...enc, out], { cwd: dir });
  } else {
    const SW = Math.round(W * 1.5 / 2) * 2, SH = Math.round(H * 1.5 / 2) * 2;
    await run('ffmpeg', ['-y', '-i', src,
      '-vf', `scale=${SW}:${SH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${SW}:${SH},zoompan=${motion(i % 4, N)}:d=${N}:s=${W}x${H}:fps=${FPS},${SHARP},${fade},format=yuv420p`,
      '-frames:v', String(N), ...enc, out], { cwd: dir });
  }
  return out;
}

async function sceneAudio({ dir, i, voice, dur }) {
  const out = `aud_${i}.wav`;
  await run('ffmpeg', ['-y', '-i', voice, '-af', 'apad', '-t', dur.toFixed(3), '-ar', '44100', '-ac', '2', out], { cwd: dir });
  return out;
}

function assTime(t) {
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function chunks(text, vertical) {
  const words = text.trim().split(/\s+/);
  if (words.length <= 2 && text.length > 16) {
    const out = []; for (let i = 0; i < text.length; i += 12) out.push(text.slice(i, i + 12)); return out;
  }
  const size = vertical ? 4 : 7, out = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(' '));
  return out;
}

// cues: [{ start, end, text }] in seconds; each cue is split into short on-screen chunks
function writeAss({ dir, cues, W, H, file = 'subs.ass' }) {
  const vertical = H > W;
  const fs_ = Math.round(Math.min(W, H) * (vertical ? 0.068 : 0.055));
  const marginV = Math.round(H * (vertical ? 0.2 : 0.07));
  let body = '';
  for (const c of cues) {
    const parts = chunks(String(c.text || '').trim() || ' ', vertical);
    const total = parts.reduce((a, p) => a + p.length, 0) || 1;
    const span = Math.max(0.3, c.end - c.start);
    let t = c.start;
    for (const p of parts) {
      const d = span * (p.length / total);
      const txt = p.replace(/\\/g, '').replace(/[{}]/g, '').replace(/\n/g, ' ');
      body += `Dialogue: 0,${assTime(t)},${assTime(t + d)},Main,,0,0,0,,${txt}\n`;
      t += d;
    }
  }
  const head = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Main,Noto Sans,${fs_},&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,0,0,1,${Math.round(fs_ / 11)},${Math.round(fs_ / 20)},2,${Math.round(W * 0.06)},${Math.round(W * 0.06)},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  fs.writeFileSync(path.join(dir, file), head + body);
  return file;
}

function writeSubtitles({ dir, scenes, W, H }) {
  const cues = []; let t0 = 0;
  for (const s of scenes) { cues.push({ start: t0 + 0.05, end: t0 + 0.05 + s.voiceDur, text: s.narration }); t0 += s.dur; }
  return writeAss({ dir, cues, W, H });
}

/**
 * scenes: [{ src, isVideo, voice, voiceDur, narration, sfx? }]
 */
async function renderVideo({ dir, scenes, W, H, music, musicVolume = 0.12, subtitles = true, onProgress = () => {} }) {
  // timing: each scene lasts as long as its voice plus a short breath
  scenes.forEach((s, i) => {
    const pad = i === scenes.length - 1 ? 0.9 : 0.35;
    s.dur = Math.round((s.voiceDur + pad) * FPS) / FPS;
  });
  const clips = [], auds = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    clips.push(await sceneClip({ dir, i, src: s.src, isVideo: s.isVideo, hold: s.hold, clipDur: s.clipDur, dur: s.dur, W, H }));
    auds.push(await sceneAudio({ dir, i, voice: s.voice, dur: s.dur }));
    onProgress((i + 1) / scenes.length);
  }
  fs.writeFileSync(path.join(dir, 'clips.txt'), clips.map(c => `file '${c}'`).join('\n'));
  fs.writeFileSync(path.join(dir, 'auds.txt'), auds.map(c => `file '${c}'`).join('\n'));
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', 'auds.txt', '-c', 'copy', 'voice.wav'], { cwd: dir });

  const T = scenes.reduce((a, s) => a + s.dur, 0);
  const inputs = [], fc = [], mix = ['[1:a]'];
  let idx = 2;
  if (music) {
    inputs.push('-stream_loop', '-1', '-i', music);
    fc.push(`[${idx}:a]atrim=0:${T.toFixed(3)},asetpts=N/SR/TB,volume=${musicVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0, T - 2.5).toFixed(3)}:d=2.5,apad[m]`);
    mix.push('[m]'); idx++;
  }
  let t0 = 0, k = 0;
  for (const s of scenes) {
    if (s.sfx) {
      const ms = Math.round((t0 + 0.1) * 1000);
      inputs.push('-i', s.sfx);
      fc.push(`[${idx}:a]adelay=${ms}|${ms},volume=0.28,apad[s${k}]`);
      mix.push(`[s${k}]`); idx++; k++;
    }
    t0 += s.dur;
  }
  if (mix.length > 1) fc.push(`${mix.join('')}amix=inputs=${mix.length}:duration=first:dropout_transition=0,volume=${mix.length},loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100[aout]`);
  else fc.push('[1:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100[aout]');
  if (subtitles) { writeSubtitles({ dir, scenes, W, H }); fc.push('[0:v]subtitles=subs.ass[vout]'); }
  else fc.push('[0:v]null[vout]');

  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', 'clips.txt', '-i', 'voice.wav', ...inputs,
    '-filter_complex', fc.join(';'), '-map', '[vout]', '-map', '[aout]',
    ...finalEnc, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', T.toFixed(3), 'final.mp4'], { cwd: dir });

  await run('ffmpeg', ['-y', '-ss', '0.8', '-i', 'final.mp4', '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', 'thumb.jpg'], { cwd: dir });

  // tidy intermediates
  for (const f of fs.readdirSync(dir)) {
    if (/^(clip_|aud_)|^(clips|auds)\.txt$|^voice\.wav$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  }
  return { video: 'final.mp4', thumb: 'thumb.jpg', duration: T };
}


async function hasAudio(file) {
  const out = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).catch(() => '');
  return out.trim().length > 0;
}

/**
 * Joins ready-made clips (Veo / Flow) into one video.
 * clips: [{ file, text, narration?, narrationDur? }]  narration = optional voice-over mp3 for that clip
 */
async function renderClips({ dir, clips, W, H, music, musicVolume = 0.08, subtitles = true, clipVolume = 1, onProgress = () => {} }) {
  const segs = [], cues = [];
  let t0 = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const cd = await probeDuration(c.file);
    const audio = await hasAudio(c.file);
    const D = Math.round(Math.max(cd, c.narration ? (c.narrationDur || 0) + 0.4 : 0) * FPS) / FPS;
    const N = Math.round(D * FPS);
    const args = ['-y', '-i', c.file];
    let idx = 1;
    let base = '[0:a]';
    if (!audio) { args.push('-f', 'lavfi', '-t', D.toFixed(3), '-i', 'anullsrc=r=44100:cl=stereo'); base = `[${idx}:a]`; idx++; }
    const norm = `aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,atrim=0:${D.toFixed(3)}`;
    let fc = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},fps=${FPS},tpad=stop_mode=clone:stop_duration=${Math.ceil(D)},format=yuv420p[v];`;
    if (c.narration) {
      args.push('-i', c.narration);
      fc += `${base}${norm},volume=${Math.min(clipVolume, 0.3)}[bg];[${idx}:a]${norm}[nv];[bg][nv]amix=inputs=2:duration=first:dropout_transition=0,volume=2[a]`;
    } else fc += `${base}${norm},volume=${clipVolume}[a]`;
    const out = `seg_${i}.mp4`;
    await run('ffmpeg', [...args, '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-frames:v', String(N), '-t', D.toFixed(3),
      ...enc, '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', out], { cwd: dir });
    segs.push(out);
    if (c.text) cues.push({ start: t0 + 0.15, end: t0 + D - 0.25, text: c.text });
    t0 += D;
    onProgress((i + 1) / clips.length);
  }
  fs.writeFileSync(path.join(dir, 'segs.txt'), segs.map(s => `file '${s}'`).join('\n'));
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', 'segs.txt', '-c', 'copy', 'joined.mp4'], { cwd: dir });

  const T = t0;
  const inputs = [], fc = [];
  if (music) {
    inputs.push('-stream_loop', '-1', '-i', music);
    fc.push(`[1:a]atrim=0:${T.toFixed(3)},asetpts=N/SR/TB,volume=${musicVolume},afade=t=in:st=0:d=1.5,afade=t=out:st=${Math.max(0, T - 2.5).toFixed(3)}:d=2.5,apad[m]`);
    fc.push(`[0:a][m]amix=inputs=2:duration=first:dropout_transition=0,volume=2,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100[aout]`);
  } else fc.push('[0:a]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100[aout]');
  if (subtitles && cues.length) { writeAss({ dir, cues, W, H }); fc.push('[0:v]subtitles=subs.ass[vout]'); }
  else fc.push('[0:v]null[vout]');
  await run('ffmpeg', ['-y', '-i', 'joined.mp4', ...inputs, '-filter_complex', fc.join(';'), '-map', '[vout]', '-map', '[aout]',
    ...finalEnc, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', T.toFixed(3), 'final.mp4'], { cwd: dir });
  await run('ffmpeg', ['-y', '-ss', '1', '-i', 'final.mp4', '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', 'thumb.jpg'], { cwd: dir });
  for (const f of fs.readdirSync(dir)) if (/^seg_\d+\.mp4$|^segs\.txt$|^joined\.mp4$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  return { video: 'final.mp4', thumb: 'thumb.jpg', duration: T };
}

module.exports = { renderVideo, renderClips, dims, FPS, writeAss };
