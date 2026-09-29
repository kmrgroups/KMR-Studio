// Online access, the easy way: Tailscale Funnel gives this PC a fixed https address
// (like https://kmr-pc.tail1234.ts.net) without touching the domain's DNS. Free on every Tailscale plan.
// studio.kmr-groups.com (the separate Vercel project from the KMR-Studio GitHub repo) then forwards to that address.
// KMR Studio drives the Tailscale app for the owner: detect it, sign in, switch Funnel on.
const fs = require('fs');
const { spawn } = require('child_process');
const db = require('./db');

const PORT = Number(process.env.PORT || 3456);
const WIN = process.platform === 'win32';
const DOWNLOAD = WIN ? 'https://tailscale.com/download/windows' : process.platform === 'darwin' ? 'https://tailscale.com/download/mac' : 'https://tailscale.com/download/linux';

function bin() {
  if (process.env.TAILSCALE_BIN) return process.env.TAILSCALE_BIN;
  const c = WIN ? ['C:\\Program Files\\Tailscale\\tailscale.exe', 'C:\\Program Files (x86)\\Tailscale\\tailscale.exe']
    : ['/usr/bin/tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];
  return c.find(f => { try { return fs.existsSync(f); } catch { return false; } }) || null;
}

// run a Tailscale command and collect its output; onLine sees each line as it arrives
function ts(args, { timeout = 20000, onLine } = {}) {
  return new Promise(resolve => {
    const b = bin();
    if (!b) return resolve({ code: -1, out: 'not installed' });
    let out = '';
    const p = spawn(b, args, { windowsHide: true });
    const t = setTimeout(() => { try { p.kill(); } catch {} }, timeout);
    const take = d => { const s = String(d); out += s; if (onLine) s.split(/\r?\n/).filter(Boolean).forEach(onLine); };
    p.stdout.on('data', take); p.stderr.on('data', take);
    p.on('error', e => { clearTimeout(t); resolve({ code: -1, out: e.message }); });
    p.on('close', code => { clearTimeout(t); resolve({ code, out }); });
  });
}
const urlIn = (text, re) => (String(text).match(re) || [])[0] || '';
const LOGIN_RE = /https:\/\/login\.tailscale\.com\/[^\s"']+/;

const st = { busy: '', login_url: '', approve_url: '', message: '', checked: 0 };
let cache = null;

async function probe() {
  const installed = !!bin();
  const r = { installed, running: false, logged_in: false, dns: '', funnel: false, download: DOWNLOAD };
  if (!installed) return r;
  const s = await ts(['status', '--json'], { timeout: 10000 });
  let j = null; try { j = JSON.parse(s.out.slice(s.out.indexOf('{'))); } catch {}
  if (!j) { r.message = /tailscaled|connect|service/i.test(s.out) ? 'The Tailscale app is installed but not running. Open Tailscale from the Start menu.' : ''; return r; }
  r.running = true;
  r.logged_in = j.BackendState === 'Running';
  if (j.BackendState === 'NeedsLogin' && j.AuthURL) st.login_url = j.AuthURL;
  r.dns = String(j.Self?.DNSName || '').replace(/\.$/, '');
  if (r.logged_in && r.dns) {
    const f = await ts(['funnel', 'status', '--json'], { timeout: 10000 });
    let fj = null; try { fj = JSON.parse(f.out.slice(f.out.indexOf('{'))); } catch {}
    const allow = fj && fj.AllowFunnel && Object.entries(fj.AllowFunnel).some(([k, v]) => v && k.startsWith(r.dns));
    const proxies = fj && fj.Web ? JSON.stringify(fj.Web) : '';
    r.funnel = !!(allow && proxies.includes(String(PORT)));
  }
  return r;
}

async function status(fresh = false) {
  if (fresh || !cache || Date.now() - st.checked > 8000) {
    cache = await probe(); st.checked = Date.now();
    if (cache.logged_in) st.login_url = '';
    if (cache.funnel) {
      st.approve_url = '';
      const addr = 'https://' + cache.dns;
      if (db.settings().public_url !== addr) db.updateSettings({ public_url: addr });
    }
  }
  const s = db.settings();
  return { ...cache, address: cache.funnel ? 'https://' + cache.dns : '', busy: st.busy, login_url: st.login_url, approve_url: st.approve_url, message: st.message || cache.message || '',
    door: s.door_url || '', door_ok: !!s.door_ok, door_msg: s.door_msg || '' };
}

// Step 2: sign in to Tailscale. Shows a link the owner opens (Google sign-in works).
async function login() {
  if (!bin()) throw new Error('Install Tailscale first.');
  st.busy = 'login'; st.message = '';
  ts(['up', '--timeout=600s'], { timeout: 620000, onLine: l => { const u = urlIn(l, LOGIN_RE); if (u) st.login_url = u; } })
    .then(r => { st.busy = ''; if (r.code !== 0 && !st.login_url) st.message = 'Tailscale sign-in did not start: ' + r.out.trim().slice(-200); cache = null; });
  for (let i = 0; i < 20 && !st.login_url; i++) { await new Promise(r => setTimeout(r, 500)); if (!st.busy) break; }
  return status(true);
}

// Step 3: publish this studio on the internet with Funnel (stays on after restarts).
async function goOnline() {
  if (!bin()) throw new Error('Install Tailscale first.');
  st.busy = 'funnel'; st.message = ''; st.approve_url = '';
  let addr = '';
  const run = ts(['funnel', '--bg', String(PORT)], { timeout: 600000, onLine: l => {
    const u = urlIn(l, LOGIN_RE); if (u) st.approve_url = u;
    const a = urlIn(l, /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.ts\.net/i); if (a) addr = a;
  } }).then(r => {
    st.busy = '';
    if (r.code === 0 || addr) { st.approve_url = ''; if (addr) db.updateSettings({ public_url: addr }); }
    else if (!st.approve_url) st.message = friendly(r.out);
    cache = null;
  });
  for (let i = 0; i < 30 && st.busy && !st.approve_url; i++) await new Promise(r => setTimeout(r, 500));
  if (!st.busy) await run;
  return status(true);
}

async function goOffline() {
  await ts(['funnel', '--https=443', 'off'], { timeout: 15000 });
  st.approve_url = ''; cache = null;
  return status(true);
}

function friendly(out) {
  const o = String(out || '');
  if (/not logged in|NeedsLogin|log in/i.test(o)) return 'Sign in to Tailscale first (step 2).';
  if (/HTTPS.*not enabled|enable HTTPS/i.test(o)) return 'Tailscale needs HTTPS switched on. Press Go online again and approve on the page that opens.';
  if (/access denied|permission|elevat/i.test(o)) return 'Windows blocked the Tailscale command. Close KMR Studio and start START.bat again.';
  return 'Tailscale said: ' + o.trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 240);
}

// Step 4: check that studio.kmr-groups.com (the Vercel door) leads to this studio.
async function testDoor(door) {
  const s = db.settings();
  let d = String(door ?? s.door_url ?? '').trim().replace(/\/+$/, '');
  if (d && !/^https?:\/\//i.test(d)) d = 'https://' + d;
  if (!d) { db.updateSettings({ door_url: '', door_ok: false, door_msg: '' }); return status(true); }
  const want = String(s.public_url || '').replace(/\/+$/, '');
  let ok = false, msg = '';
  try {
    const r = await fetch(d, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    const loc = r.headers.get('location') || '';
    if (r.status >= 300 && r.status < 400 && want && loc.replace(/\/+$/, '').startsWith(want)) ok = true;
    else if (r.status >= 300 && r.status < 400) msg = `The website sends people to ${loc || 'another address'}, not to this studio (${want || 'not online yet'}). Check KMR_STUDIO_URL in the Vercel project KMR-Studio and redeploy.`;
    else if (r.status === 200) msg = r.headers.get('x-kmr-door') ? 'The door works but does not know the studio address yet. Add KMR_STUDIO_URL in Vercel (step 4) and press Redeploy.' : 'This address shows a page, not the KMR Studio door. Check the address above.';
    else msg = `Your website could not be checked right now (it answered ${r.status}). Wait a minute and press Test again.`;
  } catch (e) {
    const c = String(e.cause?.code || e.cause?.message || e.message);
    msg = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(c) ? d.replace(/^https?:\/\//, '') + ' does not exist yet. In Vercel, project KMR-Studio, Settings, Domains, add it (see the setup guide). It can take up to an hour to start working.' : 'Could not open ' + d + ': ' + (e.cause?.message || e.message);
  }
  db.updateSettings({ door_url: d, door_ok: ok, door_msg: ok ? '' : msg });
  return status(true);
}

// last known state, for the page state (no waiting)
function snapshot() {
  const s = db.settings(), c = cache || { installed: !!bin(), running: false, logged_in: false, dns: '', funnel: false, download: DOWNLOAD };
  return { ...c, address: c.funnel ? 'https://' + c.dns : '', busy: st.busy, login_url: st.login_url, approve_url: st.approve_url, message: st.message || c.message || '',
    door: s.door_url || '', door_ok: !!s.door_ok, door_msg: s.door_msg || '' };
}

module.exports = { status, snapshot, login, goOnline, goOffline, testDoor, bin, DOWNLOAD };
