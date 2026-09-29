// Post page preview: as soon as the videos are uploaded, the AI watches them and suggests the title,
// caption, hashtags and three thumbnails to choose from. Nothing is saved; the page keeps the choice.
const fs = require('fs');
const path = require('path');
const files = require('./files');
const media = require('./media');
const describe = require('./describe');
const st = require('./state');

const RATIO = { '9:16': [1080, 1920], '16:9': [1280, 720], '1:1': [1080, 1080], '4:5': [1080, 1350] };

async function preview(b) {
  const list = (Array.isArray(b.pathnames) ? b.pathnames : []).filter(p => files.okPath(p) && p.startsWith('up/')).slice(0, 12);
  if (!list.length) throw new Error('Upload a video first.');
  const dir = media.tmpDir('pv');
  try {
    const clips = [];
    let total = 0;
    for (const [k, p] of list.entries()) {
      const f = path.join(dir, `v${k}` + (path.extname(p).toLowerCase().replace(/[^.\w]/g, '') || '.mp4'));
      total += await files.download(p, f);
      if (total > 250 * 1024 * 1024) throw new Error('These videos are too large to preview together. Post them and the AI writes the text while posting.');
      clips.push({ file: f, info: await media.probe(f).catch(() => { throw new Error(`Video ${k + 1} is not a video file KMR Studio can read.`); }) });
    }
    const first = clips[0].info;
    const [W, H] = RATIO[b.ratio] || describe.thumbSize(first.w, first.h);
    const s = await st.settings();
    let a = null, warn = '';
    const remake = Array.isArray(b.picks) && b.picks.length > 0; // only new thumbnail words: skip the AI
    if (!remake && s.gemini_key) {
      try { a = await describe.analyze(clips, { hint: b.hint || '', dir }); } catch (e) { warn = e.message; }
    } else if (!remake) warn = 'Add a free Gemini key in Settings and the AI will write the title, caption and hashtags for you.';
    // three frames to choose from: the AI's pick first, then two others spread through the video
    let picks = Array.isArray(b.picks) ? b.picks.filter(p => clips[p.clip]).slice(0, 3) : [];
    if (!picks.length) {
      const frames = a ? a.frames : await describe.grabFrames(clips[0].file, first.duration, 6, dir, 'g');
      const order = a ? [a.best, ...frames.map((_, i) => i).filter(i => i !== a.best)] : frames.map((_, i) => i);
      const chosen = [];
      for (const i of order) { if (chosen.length >= 3) break; if (chosen.every(j => Math.abs(j - i) >= Math.max(1, Math.floor(frames.length / 4)))) chosen.push(i); }
      for (const i of order) { if (chosen.length >= 3) break; if (!chosen.includes(i)) chosen.push(i); }
      picks = chosen.map(i => ({ clip: Math.max(0, clips.findIndex(c => c.file === frames[i].src)), t: frames[i].t }));
    }
    const words = String(b.thumb_text ?? a?.thumb_text ?? String(b.hint || baseName(list[0])).split(/\s+/).slice(0, 4).join(' ')).slice(0, 40);
    const thumbs = [];
    for (const [k, p] of picks.entries()) {
      const out = await describe.thumbnail(clips[p.clip].file, p.t, words, W, H, path.join(dir, `th${k}.jpg`));
      thumbs.push('data:image/jpeg;base64,' + fs.readFileSync(out).toString('base64'));
    }
    return { title: a?.title || '', description: a?.description || '', hashtags: a?.hashtags || [], thumb_text: words, thumbs, picks, warn };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const baseName = p => String(p).replace(/^up\/[a-z0-9]+-/, '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

module.exports = { preview };
