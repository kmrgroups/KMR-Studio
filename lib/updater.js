// One-click updates: upload a new KMR Studio zip in Settings. Your data folder is never touched.
const fs = require('fs');
const path = require('path');
const { ROOT, DATA, ensureDir, run } = require('./util');

const KEEP = new Set(['data', '.venv', 'runtime', 'node_modules', '.git']);

function findRoot(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, 'server.js')) && fs.existsSync(path.join(dir, 'VERSION'))) return dir;
  if (depth > 2) return null;
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { const r = findRoot(p, depth + 1); if (r) return r; }
  }
  return null;
}

// Copy new files over the app, skipping identical files (so a running START.bat is never disturbed).
function copyTree(from, to, top) {
  for (const f of fs.readdirSync(from)) {
    if (top && KEEP.has(f)) continue;
    const a = path.join(from, f), b = path.join(to, f);
    if (fs.statSync(a).isDirectory()) { ensureDir(b); copyTree(a, b, false); continue; }
    const nb = fs.readFileSync(a);
    if (fs.existsSync(b) && fs.readFileSync(b).equals(nb)) continue;
    fs.writeFileSync(b, nb);
  }
}

async function applyZip(zipFile) {
  const tmp = path.join(DATA, 'tmp', 'update');
  fs.rmSync(tmp, { recursive: true, force: true });
  ensureDir(tmp);
  if (process.platform === 'win32') {
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    await run(tar, ['-xf', zipFile, '-C', tmp]).catch(() =>
      run('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${tmp}' -Force`]));
  }
  else await run('unzip', ['-o', '-q', zipFile, '-d', tmp]);
  const src = findRoot(tmp);
  if (!src) throw new Error('This zip is not a KMR Studio update (server.js and VERSION not found).');
  const version = fs.readFileSync(path.join(src, 'VERSION'), 'utf8').trim();
  copyTree(src, ROOT, true);
  try { await require('./tts').repair(); } catch (e) { console.error('voice engine update', e.message); }
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.rmSync(zipFile, { force: true });
  return version;
}

module.exports = { applyZip };
