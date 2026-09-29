// Branding: the studio name and the owner's logo (sidebar, sign-in screen, browser tab, phone app icon).
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { DATA, ensureDir, run } = require('./util');

const NAME = 'KMR Studio';
const DIR = () => ensureDir(path.join(DATA, 'brand'));
const BG = () => (db.settings().brand_bg === 'dark' ? '0x120D19' : '0xFFFFFF');

function logoFile() {
  const f = fs.readdirSync(DIR()).find(x => /^logo\.(png|jpe?g|webp|svg)$/i.test(x));
  return f ? path.join(DIR(), f) : null;
}

function info() {
  const s = db.settings();
  return { name: NAME, logo: !!logoFile(), v: s.brand_v || 0, bg: s.brand_bg === 'dark' ? 'dark' : 'light' };
}

// square app icons with the logo centred on a light or dark tile
async function makeIcons(src) {
  for (const size of [192, 512]) {
    const inner = Math.round(size * 0.72);
    await run('ffmpeg', ['-y', '-i', src, '-f', 'lavfi', '-i', `color=c=${BG()}:s=${size}x${size}`,
      '-filter_complex', `[0:v]scale=${inner}:${inner}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba[l];[1:v][l]overlay=(W-w)/2:(H-h)/2:format=auto,format=rgb24`,
      '-frames:v', '1', path.join(DIR(), `icon-${size}.png`)]);
  }
}

async function setLogo(tmp, ext) {
  ext = ext === '.jpeg' ? '.jpg' : ext;
  for (const f of fs.readdirSync(DIR())) fs.rmSync(path.join(DIR(), f), { force: true });
  const dest = path.join(DIR(), 'logo' + ext);
  fs.renameSync(tmp, dest);
  if (ext !== '.svg') {
    try { await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', dest]); }
    catch { fs.rmSync(dest, { force: true }); throw new Error('This picture could not be read. Save the logo as PNG and try again.'); }
  }
  try { await makeIcons(dest); } catch { /* SVG without an SVG-capable ffmpeg: the sidebar still shows it; app icons stay default */ }
  db.updateSettings({ brand_v: Date.now() });
  return info();
}

function clearLogo() {
  for (const f of fs.readdirSync(DIR())) fs.rmSync(path.join(DIR(), f), { force: true });
  db.updateSettings({ brand_v: Date.now() });
  return info();
}

async function setBackground(bg) {
  db.updateSettings({ brand_bg: bg === 'dark' ? 'dark' : 'light', brand_v: Date.now() });
  const l = logoFile();
  if (l) { try { await makeIcons(l); } catch {} }
  return info();
}

function file(kind) {
  if (kind === 'logo') return logoFile();
  const f = path.join(DIR(), kind);
  return fs.existsSync(f) ? f : null;
}

function manifest() {
  const v = db.settings().brand_v || 0, own = !!file('icon-192.png');
  return {
    name: NAME, short_name: 'KMR Studio', description: 'Make videos and post them to all your social media',
    start_url: '/', display: 'standalone', background_color: '#120D19', theme_color: '#120D19',
    icons: [
      { src: `/brand/icon-192.png?v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/brand/icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: own ? 'any' : 'any maskable' }
    ]
  };
}

module.exports = { NAME, info, setLogo, clearLogo, setBackground, file, manifest };
