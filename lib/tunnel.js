// Online access: puts KMR Studio on your own web address (for example https://studio.kmr-groups.com)
// through a free Cloudflare Tunnel. No router settings, no open ports, no server to rent.
// KMR Studio downloads Cloudflare's small "cloudflared" program by itself and keeps it running.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const db = require('./db');
const { ROOT, ensureDir } = require('./util');

const WIN = process.platform === 'win32';
const BIN = () => path.join(ensureDir(path.join(ROOT, 'runtime')), WIN ? 'cloudflared.exe' : 'cloudflared');
const URL_FOR = () => {
  const base = 'https://github.com/cloudflare/cloudflared/releases/latest/download/';
  if (WIN) return base + 'cloudflared-windows-amd64.exe';
  if (process.platform === 'darwin') return null;
  return base + (process.arch === 'arm64' ? 'cloudflared-linux-arm64' : 'cloudflared-linux-amd64');
};

let child = null, stopping = false, restartTimer = null;
const st = { state: 'off', message: '', since: 0, lines: [] };
function set(state, message) { st.state = state; st.message = message || ''; st.since = Date.now(); }

// Accepts the token itself or anything Cloudflare shows that contains it (the whole install command).
function extractToken(text) {
  const m = String(text || '').match(/eyJ[A-Za-z0-9_\-+/=]{40,}/);
  return m ? m[0] : '';
}

async function ensureBinary() {
  const bin = BIN();
  if (fs.existsSync(bin) && fs.statSync(bin).size > 1e6) return bin;
  const url = URL_FOR();
  if (!url) throw new Error('On a Mac, install cloudflared yourself (brew install cloudflared).');
  set('starting', 'Downloading the Cloudflare connector (about 40 MB, once)');
  const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10 * 60000) });
  if (!r.ok) throw new Error('Could not download the Cloudflare connector (' + r.status + '). Check the internet connection.');
  const tmp = bin + '.part';
  fs.writeFileSync(tmp, Buffer.from(await r.arrayBuffer()));
  fs.renameSync(tmp, bin);
  if (!WIN) fs.chmodSync(bin, 0o755);
  return bin;
}

function friendly(line) {
  if (/token is not valid|Invalid tunnel secret|Unauthorized/i.test(line)) return 'Cloudflare did not accept the tunnel token. Copy it again from Cloudflare (Networking, Tunnels, your tunnel, Configure) and paste it here.';
  if (/failed to dial|dial tcp|no such host|i\/o timeout|network is unreachable/i.test(line)) return 'Cannot reach Cloudflare. Check the internet connection of this computer. KMR Studio keeps trying.';
  if (/already running|already exists/i.test(line)) return line;
  return line.replace(/^\S+\s+(ERR|WRN)\s+/, '').slice(0, 240);
}

async function start() {
  const s = db.settings();
  clearTimeout(restartTimer);
  if (child || !s.tunnel_enabled || !s.tunnel_token) { if (!s.tunnel_token || !s.tunnel_enabled) set('off', ''); return status(); }
  stopping = false;
  let bin;
  try { bin = await ensureBinary(); }
  catch (e) { set('error', e.message); restartTimer = setTimeout(start, 5 * 60000); return status(); }
  set('starting', 'Connecting to Cloudflare');
  child = spawn(bin, ['tunnel', '--no-autoupdate', '--loglevel', 'info', 'run', '--token', s.tunnel_token], { windowsHide: true });
  const onData = d => {
    for (const line of String(d).split(/\r?\n/).filter(Boolean)) {
      st.lines.push(line); if (st.lines.length > 60) st.lines.shift();
      if (/Registered tunnel connection/i.test(line)) set('online', '');
      else if (/token is not valid|Invalid tunnel secret|Unauthorized/i.test(line)) set('error', friendly(line));
      else if (/\sERR\s/.test(line) && st.state !== 'online') set('error', friendly(line)); // warnings (WRN) are ignored
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', e => set('error', 'The Cloudflare connector could not start: ' + e.message));
  child.on('exit', code => {
    child = null;
    if (stopping) { set('off', ''); return; }
    if (st.state !== 'error') set('error', 'The Cloudflare connector stopped (code ' + code + '). Restarting in 15 seconds.');
    restartTimer = setTimeout(start, st.message.includes('did not accept') ? 10 * 60000 : 15000);
  });
  return status();
}

function stop() {
  stopping = true; clearTimeout(restartTimer);
  if (child) { try { child.kill(); } catch {} }
  set('off', '');
}

async function restart() { stop(); await new Promise(r => setTimeout(r, 800)); stopping = false; return start(); }

function status() {
  const s = db.settings();
  return { state: st.state, message: st.message, since: st.since, address: s.public_url || '', enabled: !!s.tunnel_enabled, has_token: !!s.tunnel_token, log: st.lines.slice(-12) };
}

process.on('exit', () => { try { child && child.kill(); } catch {} });

module.exports = { start, stop, restart, status, extractToken };
