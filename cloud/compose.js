// Builds the finished video: Veo clips or AI pictures (with slow zoom), the AI voice, and big subtitles.
const fs = require('fs');
const path = require('path');
const media = require('./media');
const describe = require('./describe');

// Free AI pictures (Pollinations). If a picture cannot be made, a plain branded card is used instead.
async function picture(prompt, W, H, dest, seed) {
  const q = new URLSearchParams({ width: String(W), height: String(H), nologo: 'true', seed: String(seed), model: 'flux', enhance: 'true' });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`https://image.pollinations.ai/prompt/${encodeURIComponent(String(prompt).slice(0, 800))}?${q}`, { signal: AbortSignal.timeout(70000) });
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.ok && buf.length > 5000 && /image/.test(r.headers.get('content-type') || 'image')) { fs.writeFileSync(dest, buf); return dest; }
    } catch {}
  }
  await media.run(['-y', '-f', 'lavfi', '-i', `gradients=s=${W}x${H}:c0=0x2A1A3A:c1=0x7A3E1C:x0=0:y0=0:x1=${W}:y1=${H}:speed=0`, '-frames:v', '1', dest], { timeout: 20000 })
    .catch(() => media.run(['-y', '-f', 'lavfi', '-i', `color=c=0x2A1A3A:s=${W}x${H}`, '-frames:v', '1', dest], { timeout: 20000 }));
  return dest;
}

const script = t => /[஀-௿]/.test(t) ? 'tamil' : /[ऀ-ॿ]/.test(t) ? 'hindi' : 'latin';
// Narration split into short subtitle lines, each shown for its share of the voice.
function subtitles(text, total, W, H) {
  const sc = script(text);
  const words = String(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const per = sc === 'latin' ? 5 : 3;
  const lines = [];
  for (let i = 0; i < words.length; i += per) lines.push(words.slice(i, i + per).join(' '));
  const weight = lines.map(l => [...l].length + 3), sum = weight.reduce((a, b) => a + b, 0) || 1;
  const ts = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = (s % 60).toFixed(2).padStart(5, '0'); return `${h}:${String(m).padStart(2, '0')}:${x}`; };
  const font = sc === 'tamil' ? 'Noto Sans Tamil' : sc === 'hindi' ? 'Noto Sans Devanagari' : 'Anton';
  const size = Math.round(W * (sc === 'latin' ? 0.085 : 0.062));
  let t = 0.15;
  const ev = lines.map((l, i) => { const d = total * weight[i] / sum; const a = t; t += d; return `Dialogue: 0,${ts(a)},${ts(Math.min(total, t))},S,,0,0,0,,${(sc === 'latin' ? l.toUpperCase() : l).replace(/[{}\\]/g, '')}`; });
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: S,${font},${size},&H00FFFFFF,&H0047B5FF,&H00000000,&H78000000,${sc === 'latin' ? 0 : -1},0,0,0,100,100,1,0,1,${Math.round(size / 11)},${Math.round(size / 20)},2,${Math.round(W * 0.07)},${Math.round(W * 0.07)},${Math.round(H * (H > W ? 0.2 : 0.1))},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${ev.join('\n')}
`;
}
const duration = file => media.durationOf(file);

/**
 * kind 'clips': inputs are Veo mp4 clips. kind 'pictures': inputs are images.
 * narration: text; voice: wav file or null. Returns the output mp4 path.
 */
async function build({ kind, inputs, narration, voice, W, H, dir, out, timeLeft }) {
  const vdur = voice ? await duration(voice) : 0;
  const args = ['-y'];
  let fc = '', total;
  if (kind === 'clips') {
    inputs.forEach(f => args.push('-i', f));
    const durs = [];
    for (const f of inputs) durs.push(await duration(f) || 8);
    total = durs.reduce((a, b) => a + b, 0);
    fc = inputs.map((_, k) => `[${k}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30,format=yuv420p[v${k}]`).join(';') + ';' + inputs.map((_, k) => `[v${k}]`).join('') + `concat=n=${inputs.length}:v=1:a=0[vv]`;
  } else {
    const per = Math.max(3, (vdur || inputs.length * 4) / inputs.length + 0.2);
    total = per * inputs.length;
    // each picture is sized once (a little larger than the frame), then slowly zoomed in or out
    const big = [Math.round(W * 1.25 / 2) * 2, Math.round(H * 1.25 / 2) * 2];
    const sized = [];
    for (const [k, f] of inputs.entries()) {
      const s = path.join(dir, `sized${k}.png`);
      await media.run(['-y', '-i', f, '-vf', `scale=${big[0]}:${big[1]}:force_original_aspect_ratio=increase,crop=${big[0]}:${big[1]}`, '-frames:v', '1', s], { timeout: 30000 });
      sized.push(s);
    }
    sized.forEach(f => args.push('-framerate', '30', '-loop', '1', '-t', per.toFixed(2), '-i', f));
    const frames = Math.round(per * 30);
    fc = sized.map((_, k) => {
      const z = k % 2 === 0 ? `1+0.18*on/${frames}` : `1.18-0.18*on/${frames}`;
      return `[${k}:v]zoompan=z='${z}':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=30,setsar=1,format=yuv420p[v${k}]`;
    }).join(';') + ';' + sized.map((_, k) => `[v${k}]`).join('') + `concat=n=${sized.length}:v=1:a=0[vv]`;
  }
  // subtitles from the narration, timed to the voice (or spread over the video when there is no voice)
  let vlabel = '[vv]';
  if (narration) {
    const assFile = path.join(dir, 'subs.ass');
    fs.writeFileSync(assFile, subtitles(narration, Math.min(total, vdur || total) - 0.2, W, H));
    fc += `;[vv]ass=${assFile}:fontsdir=${describe.fonts()}[vs]`;
    vlabel = '[vs]';
  }
  // sound: the voice (and the clips' own sound quietly under it), or silence
  const n = inputs.length;
  if (voice) {
    args.push('-i', voice);
    const speed = vdur > total - 0.3 ? Math.min(1.3, vdur / (total - 0.5)) : 1;
    const va = `[${n}:a]${speed > 1.01 ? `atempo=${speed.toFixed(3)},` : ''}aresample=44100,aformat=channel_layouts=stereo,apad[va]`;
    if (kind === 'clips') {
      const withSound = [];
      for (const [k, f] of inputs.entries()) { try { if ((await media.probe(f)).acodec) withSound.push(k); } catch {} }
      if (withSound.length === n) fc += `;${inputs.map((_, k) => `[${k}:a]`).join('')}concat=n=${n}:v=0:a=1,volume=0.22,aresample=44100,aformat=channel_layouts=stereo[bg];${va};[bg][va]amix=inputs=2:duration=first:normalize=0[aa]`;
      else fc += `;${va};[va]atrim=0:${total.toFixed(2)}[aa]`;
    } else fc += `;${va};[va]atrim=0:${total.toFixed(2)}[aa]`;
  } else {
    args.push('-f', 'lavfi', '-t', total.toFixed(2), '-i', 'anullsrc=r=44100:cl=stereo');
    fc += `;[${n}:a]anull[aa]`;
  }
  args.push('-filter_complex', fc, '-map', vlabel, '-map', '[aa]', '-t', total.toFixed(2),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-movflags', '+faststart', out);
  await media.run(args, { timeout: Math.max(60000, timeLeft() - 30000) });
  return out;
}

module.exports = { picture, build, subtitles };
