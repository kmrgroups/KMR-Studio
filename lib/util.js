const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA = process.env.LUMEN_DATA || path.join(ROOT, 'data');
const PY_BIN = path.join(ROOT, '.venv', 'bin');

function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); return d; }

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, opts);
    let out = '', err = '';
    p.stdout && p.stdout.on('data', d => { out += d; if (out.length > 5e6) out = out.slice(-5e6); });
    p.stderr && p.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out) : reject(new Error(`${path.basename(cmd)} failed (${code}): ${err.slice(-1200)}`)));
  });
}

async function probeDuration(file) {
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  return parseFloat(out.trim()) || 0;
}

async function download(url, dest, opts = {}) {
  const r = await fetch(url, { headers: opts.headers || {}, signal: AbortSignal.timeout(opts.timeout || 120000) });
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (opts.minBytes && buf.length < opts.minBytes) throw new Error('Downloaded file is too small');
  fs.writeFileSync(dest, buf);
  return { file: dest, type: r.headers.get('content-type') || '' };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

module.exports = { ROOT, DATA, PY_BIN, ensureDir, run, probeDuration, download, sleep, uid };
