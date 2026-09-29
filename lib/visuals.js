// Visuals (AI images + stock footage), sound effects and background music.
const fs = require('fs');
const path = require('path');
const { DATA, ensureDir, download, sleep } = require('./util');

const STYLES = {
  cartoon:   { label: 'Cartoon',            prompt: 'high quality 2D cartoon illustration, crisp clean outlines, vibrant colors, expressive characters, detailed background, animated series key frame, sharp focus' },
  '3d':      { label: '3D animated',        prompt: 'high-end 3D animated feature film still, expressive characters, detailed textures, soft global illumination, cinematic lighting, sharp focus, 8k render' },
  anime:     { label: 'Anime',              prompt: 'high quality anime key visual, detailed painted background, dramatic lighting, clean cel shading, sharp focus' },
  cinematic: { label: 'Cinematic realistic', prompt: 'cinematic film still, photorealistic, 35mm lens, shallow depth of field, dramatic lighting, ultra detailed, sharp focus, 8k' },
  storybook: { label: 'Storybook',          prompt: 'beautiful watercolor storybook illustration, soft textured paper, warm gentle colors, whimsical, fine detail' },
  stock:     { label: 'Real footage',       prompt: 'photorealistic real-world footage' }
};

const orientation = ratio => ratio === '9:16' || ratio === '4:5' ? 'portrait' : ratio === '16:9' ? 'landscape' : 'square';

function genSize(ratio) {
  return { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1280, 1280], '4:5': [1080, 1350] }[ratio] || [1080, 1920];
}

async function aiImage({ prompt, ratio, seed, dest, token }) {
  const [w, h] = genSize(ratio);
  const q = new URLSearchParams({ width: w, height: h, seed: String(seed), model: 'flux', nologo: 'true', enhance: 'false' });
  if (token) q.set('token', token);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}?${q}`;
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await download(url, dest, { timeout: 150000, minBytes: 8000, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!/image/.test(r.type)) throw new Error('Image service returned no image');
      return dest;
    } catch (e) { lastErr = e; await sleep(token ? 4000 : 16000); }
  }
  throw lastErr;
}

async function pexels(pathname, key) {
  const r = await fetch(`https://api.pexels.com${pathname}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Pexels error ${r.status}`);
  return r.json();
}

async function stockVideo({ query, ratio, key, dest, used, minDur = 3 }) {
  const j = await pexels(`/videos/search?query=${encodeURIComponent(query)}&orientation=${orientation(ratio)}&per_page=15&size=medium`, key);
  const vids = (j.videos || []).filter(v => !used.has('v' + v.id) && v.duration >= Math.min(minDur, 6));
  if (!vids.length) throw new Error('No stock video for ' + query);
  const v = vids[Math.floor(Math.random() * Math.min(5, vids.length))];
  const files = (v.video_files || []).filter(f => f.file_type === 'video/mp4' && f.width);
  files.sort((a, b) => Math.abs(Math.max(a.width, a.height) - 1920) - Math.abs(Math.max(b.width, b.height) - 1920));
  if (!files.length) throw new Error('No mp4 file');
  await download(files[0].link, dest, { timeout: 240000, minBytes: 20000 });
  used.add('v' + v.id);
  return dest;
}

async function stockPhoto({ query, ratio, key, dest, used }) {
  const j = await pexels(`/v1/search?query=${encodeURIComponent(query)}&orientation=${orientation(ratio)}&per_page=15`, key);
  const photos = (j.photos || []).filter(p => !used.has('p' + p.id));
  if (!photos.length) throw new Error('No stock photo for ' + query);
  const p = photos[Math.floor(Math.random() * Math.min(5, photos.length))];
  await download(p.src.large2x || p.src.original, dest, { minBytes: 8000 });
  used.add('p' + p.id);
  return dest;
}

async function soundEffect({ query, key, dest }) {
  const q = new URLSearchParams({ query, filter: 'duration:[0.4 TO 5] -tag:music -tag:loop -tag:melody -tag:song -tag:beat', fields: 'id,name,previews', page_size: '6', sort: 'rating_desc', token: key });
  const r = await fetch(`https://freesound.org/apiv2/search/text/?${q}`, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('Freesound error ' + r.status);
  const j = await r.json();
  const hit = (j.results || [])[Math.floor(Math.random() * Math.min(3, (j.results || []).length))];
  if (!hit) throw new Error('No sound for ' + query);
  await download(hit.previews['preview-hq-mp3'], dest, { minBytes: 2000 });
  return dest;
}

const MUSIC_DIR = () => ensureDir(path.join(DATA, 'music'));
function musicList() {
  return fs.readdirSync(MUSIC_DIR()).filter(f => /\.(mp3|m4a|wav|ogg|aac)$/i.test(f)).sort();
}
const MOOD_WORDS = {
  upbeat: ['upbeat', 'energetic', 'pop', 'happy', 'fun'], happy: ['happy', 'cheerful', 'joy', 'fun', 'upbeat', 'kids'],
  calm: ['calm', 'soft', 'peaceful', 'ambient', 'piano', 'relax', 'gentle'], emotional: ['emotional', 'sad', 'piano', 'heart', 'touching'],
  epic: ['epic', 'cinematic', 'trailer', 'battle', 'heroic'], dark: ['dark', 'horror', 'suspense', 'tension', 'scary'],
  mysterious: ['mystery', 'mysterious', 'suspense', 'dark', 'ambient'], funny: ['funny', 'comedy', 'quirky', 'playful', 'kids']
};
// mode: 'match' = only a track whose file name fits the mood (else no music), 'any' = any track, 'off' = never
function pickMusic(mood, mode = 'match') {
  const all = musicList();
  if (!all.length || mode === 'off') return null;
  const words = MOOD_WORDS[String(mood || '').toLowerCase()] || [String(mood || '').toLowerCase()];
  const match = all.filter(f => words.some(w => w && f.toLowerCase().includes(w)));
  const pool = match.length ? match : (mode === 'any' ? all : []);
  if (!pool.length) return null;
  return path.join(MUSIC_DIR(), pool[Math.floor(Math.random() * pool.length)]);
}

module.exports = { STYLES, aiImage, stockVideo, stockPhoto, soundEffect, musicList, pickMusic, MUSIC_DIR, orientation };
