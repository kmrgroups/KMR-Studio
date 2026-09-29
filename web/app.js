/* KMR Studio Cloud — upload, join and post videos to every profile's accounts. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PATHS = {
  upload: '<path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c1.8.8 3 2.5 3.5 5.2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5M15 12H4"/>',
  up: '<path d="M6 15l6-6 6 6"/>', down: '<path d="M6 9l6 6 6-6"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  join: '<rect x="3" y="6" width="7" height="12" rx="1.5"/><rect x="14" y="6" width="7" height="12" rx="1.5"/><path d="M10 12h4"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[n] || ''}</svg>`;
const PL = [['youtube', 'YouTube', '▶'], ['instagram', 'Instagram', 'IG'], ['facebook', 'Facebook', 'f'], ['linkedin', 'LinkedIn', 'in'], ['x', 'X', '𝕏']];
const plName = k => (PL.find(p => p[0] === k) || [k, k])[1];
const plBadge = k => `<span class="pl ${k}" aria-hidden="true">${(PL.find(p => p[0] === k) || ['', '', '?'])[2]}</span>`;
const fmtDur = s => { s = Math.round(s || 0); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : s + 's'; };
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(b > 104857600 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const ago = t => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };

const S = { st: null, page: 'post', clips: [], mode: 'join', ratio: 'auto', fit: 'blur', text: { title: '', description: '', hashtags: '' }, targets: null, jobs: [], open: {}, yt: {}, busy: false, ai: freshAi() };
function freshAi() { return { state: 'idle', key: '', warn: '', thumbs: [], picks: [], thumb_text: '', sel: 0, own: null }; }
let seq = 0;

async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: {}, credentials: 'same-origin' };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const r = await fetch('/api' + path, init);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { await boot(); throw new Error(j.error || 'Please sign in again.'); }
  if (!r.ok) throw new Error(j.error || 'Something went wrong (' + r.status + ')');
  return j;
}
function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : ''); t.setAttribute('role', bad ? 'alert' : 'status'); t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), bad ? 9000 : 4500);
}
async function busy(btn, fn) {
  if (btn && btn.disabled) return;
  const html = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (btn.dataset.busy ? ' ' + esc(btn.dataset.busy) : ''); }
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = html; } }
}

// ---------- start ----------
async function boot() {
  try { S.st = await api('/state'); } catch (e) { $('#app').innerHTML = `<div class="center"><div class="panel card"><h2>KMR Studio cannot start</h2><p class="err">${esc(e.message)}</p></div></div>`; return; }
  if (S.st.needs.password || S.st.needs.database) return renderSetup();
  if (!S.st.authed) return renderLogin();
  if (!S.targets) S.targets = new Set((S.st.settings.default_targets || []).filter(t => isConnected(t)));
  route();
}
function isConnected(t) { const [pid, pl] = t.split(':'); const p = (S.st.profiles || []).find(x => x.id === pid); return !!(p && p[pl] && p[pl].ok); }

function brandMark() { return S.st?.settings?.logo ? `<span class="brand-mark logo"><img src="/api/logo?v=${esc(S.st.settings.logo.slice(-12))}" alt=""></span>` : '<span class="brand-mark"></span>'; }

function renderSetup() {
  const n = S.st.needs;
  const item = (done, title, body) => `<div class="check ${done ? 'done' : ''}"><span class="ck">${done ? '✓' : '!'}</span><div><b>${title}</b><div class="muted small">${body}</div></div></div>`;
  $('#app').innerHTML = `<div class="center"><div class="panel card wide">
    <a class="brand" href="/"><span class="brand-mark"></span>KMR<em>Studio</em></a>
    <h2>Two settings in Vercel, then you are ready</h2>
    <p class="muted">Open <a href="https://vercel.com/dashboard" target="_blank" rel="noopener">vercel.com</a>, the project <b>kmr-studio</b>.</p>
    <div style="margin-top:12px">
      ${item(!n.database, 'Database (free)', 'Storage tab, <b>Create Database</b>, choose <b>Upstash for Redis</b>, Free plan, <b>Create</b>, then <b>Connect</b> to this project.')}
      ${item(!n.storage, 'Video storage (free)', 'Storage tab, <b>Create</b>, <b>Blob</b>, set access to <b>Private</b>, <b>Create</b>, then connect it to this project.')}
      ${item(!n.password, 'Your password', 'Settings, <b>Environment Variables</b>: key <code>KMR_PASSWORD</code>, value: the password you want. Save.')}
    </div>
    <p class="muted small" style="margin-top:12px">Then open <b>Deployments</b>, the three dots on the newest one, <b>Redeploy</b>, and reload this page.</p>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary" onclick="location.reload()">${icon('refresh')}Check again</button></div>
  </div></div>`;
}

function renderLogin() {
  $('#app').innerHTML = `<div class="center"><form class="panel card" id="login">
    <a class="brand" href="/"><span class="brand-mark"></span>KMR<em>Studio</em></a>
    <h2>Sign in</h2><p class="muted">Post your videos to every account in one go.</p>
    <label class="field" style="margin-top:14px"><span class="label">Password</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>
    <button class="btn primary big" style="width:100%;margin-top:16px" type="submit">Sign in</button>
    <p class="muted small" style="margin-top:12px">Forgot it? Change <code>KMR_PASSWORD</code> in Vercel, project Settings, Environment Variables, and redeploy.</p>
  </form></div>`;
  $('#login').onsubmit = e => {
    e.preventDefault();
    busy(e.target.querySelector('button'), async () => { await api('/login', { body: { password: e.target.password.value } }); await boot(); });
  };
}

// ---------- shell ----------
function route() {
  const h = location.hash.replace(/^#/, '');
  const [page, ...rest] = h.split('&');
  const q = new URLSearchParams(rest.join('&'));
  if (q.get('msg')) toast(q.get('msg'));
  if (q.get('err')) toast(q.get('err'), true);
  if (q.get('msg') || q.get('err')) history.replaceState(null, '', '#' + (page || 'post'));
  S.page = ['post', 'history', 'profiles', 'settings'].includes(page) ? page : 'post';
  render();
  if (S.page === 'history') loadJobs();
}
window.addEventListener('hashchange', () => S.st?.authed && route());

function activeCount() { return S.jobs.filter(j => j.status === 'preparing' || j.status === 'posting' || j.status === 'review').length; }
function render() {
  const nav = [['post', 'Post', 'upload'], ['history', 'History', 'clock'], ['profiles', 'Profiles', 'users'], ['settings', 'Settings', 'gear']];
  const count = activeCount();
  const link = ([k, l, i], cls) => `<a href="#${k}" class="${S.page === k ? 'on' : ''}">${icon(i)}<span>${l}</span>${k === 'history' && count ? `<span class="count">${count}</span>` : ''}</a>`;
  $('#app').innerHTML = `<div class="shell">
    <aside class="side"><a class="brand" href="#post">${brandMark()}KMR<em>Studio</em></a>
      <nav class="nav">${nav.map(n => link(n)).join('')}</nav>
      <div class="side-foot"><span class="muted small">Version ${esc(S.st.version)} · cloud</span><button class="btn quiet sm" data-act="logout">${icon('logout')}Sign out</button></div></aside>
    <header class="topbar"><a class="brand" href="#post">${brandMark()}KMR<em>Studio</em></a><button class="btn quiet sm" data-act="logout" aria-label="Sign out">${icon('logout')}Sign out</button></header>
    <main class="main" id="main">${PAGES[S.page]()}</main>
    <nav class="bottom">${nav.map(n => link(n)).join('')}</nav>
  </div>`;
  after();
}
function rerenderMain() { const m = $('#main'); if (!m) return render(); const y = scrollY; m.innerHTML = PAGES[S.page](); after(); scrollTo(0, y); }
function after() {
  if (S.page === 'post') bindPost();
  $$('[data-act="logout"]').forEach(b => b.onclick = () => { if (confirm('Sign out of KMR Studio?')) busy(b, async () => { await api('/logout', { body: {} }); S.st = null; S.targets = null; boot(); }); });
}

// ---------- Post page ----------
function readyClips() { return S.clips.filter(c => c.status === 'ready'); }
function pagePost() {
  const profs = S.st.profiles || [];
  const anyAcc = profs.some(p => PL.some(([k]) => p[k].ok));
  const n = S.clips.length, ready = readyClips().length, up = S.clips.filter(c => c.status === 'uploading').length;
  const joining = S.mode === 'join' && n > 1;
  const total = S.clips.reduce((a, c) => a + (c.duration || 0), 0);
  const tcount = [...S.targets].filter(isConnected).length;
  const outCount = joining ? 1 : ready;
  const eachMany = S.mode === 'each' && n > 1;
  const autoOn = (S.st.settings.gemini_key || S.st.settings.groq_key) && S.st.settings.auto_text !== false;
  return `<div class="page-head"><div><p class="eyebrow">Upload and post</p><h1>Post your videos</h1><p>Add your Google Flow clips or any video. Post each one, or join them into one longer video.</p></div></div>
  ${anyAcc ? '' : `<div class="banner"><span>Connect your accounts first, so KMR Studio can post for you.</span><a class="btn primary sm" href="#profiles">Connect accounts</a></div>`}
  <section class="panel">
    <div class="panel-head"><div><h2><span class="step-no">1</span>Add videos</h2><p>One video, or several short clips to post separately or <b>join into one longer video</b>.</p></div></div>
    <label class="drop" id="drop"><input type="file" id="files" accept="video/*,.mp4,.mov,.m4v,.webm" multiple hidden>
      <span class="big-ic">${icon('upload')}</span><b>Tap to choose videos</b><span class="muted small">or drop them here · MP4 or MOV · up to 600 MB each</span></label>
    ${n ? `<div class="clips">${S.clips.map((c, i) => clipRow(c, i, n)).join('')}</div>` : ''}
    ${n === 1 ? `<div class="join-hint">${icon('join')}<span><b>Want one longer video?</b> Tap the box above and add more clips. Then choose <b>Join into one</b> and put them in order with the arrows.</span></div>` : ''}
    ${n > 1 ? `<div class="opts">
      <div class="opt-row"><span class="label">How</span><div class="seg" role="group" aria-label="How to post">
        <button data-mode="join" class="${S.mode === 'join' ? 'on' : ''}">Join into one</button>
        <button data-mode="each" class="${S.mode === 'each' ? 'on' : ''}">Post each separately</button></div>
        <span class="muted small">${joining ? (total ? `One video of about ${fmtDur(total)}, in this order.` : 'One video, in this order.') : `${n} separate posts.`}</span></div>
      ${joining ? `<div class="opt-row"><span class="label">Shape</span><div class="seg" role="group" aria-label="Shape">${[['auto', 'Same as first'], ['9:16', '9:16 Reel'], ['16:9', '16:9 YouTube'], ['1:1', '1:1 Square']].map(([k, l]) => `<button data-ratio="${k}" class="${S.ratio === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="opt-row"><span class="label">If sizes differ</span><div class="seg" role="group" aria-label="Fit">${[['blur', 'Blurred background'], ['bars', 'Black bars'], ['crop', 'Fill (crop)']].map(([k, l]) => `<button data-fit="${k}" class="${S.fit === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <p class="muted small" style="margin:0">Flow clips of the same size join instantly with no quality loss. Different sizes take about a third of the video's length to join.</p>` : ''}
    </div>` : ''}
  </section>
  <section class="panel">
    <div class="panel-head"><div><h2><span class="step-no">2</span>Title, caption and thumbnail</h2><p>${eachMany ? (autoOn ? 'The AI watches each video and writes its own title, caption, hashtags and thumbnail while posting. Type below only what you want on all of them.' : 'Each video uses its own title (above). The caption and hashtags go on all of them.') : 'The AI watches your video and fills these in. Change anything you like.'}</p></div>
      ${eachMany ? '' : `<button class="btn sm" data-act="ai" ${ready && !up && S.ai.state !== 'running' ? '' : 'disabled'}>${icon('spark')}${S.ai.state === 'done' ? 'Write again' : 'Write with AI'}</button>`}</div>
    ${S.ai.state === 'running' ? `<div class="ai-note"><span class="spin"></span><span>AI is watching your video… <b id="ai-secs">${Math.round((Date.now() - (S.ai.started || Date.now())) / 1000)}</b>s. No need to wait: you can press <b>Post now</b> and it finishes the text and thumbnail while posting.</span></div>` : S.ai.warn ? `<div class="ai-note warn">${esc(S.ai.warn)}${/Gemini key/.test(S.ai.warn) ? ' <a href="#settings">Open Settings</a>' : ''}</div>` : ''}
    <div class="form-grid">
      ${S.mode === 'each' && n > 1 ? '' : `<label class="field wide"><span class="label">Title</span><input id="t-title" maxlength="100" value="${esc(S.text.title)}" placeholder="${esc(S.clips[0] ? baseName(S.clips[0].name) : 'What is this video about?')}"></label>`}
      <label class="field wide"><span class="label">Caption</span><textarea id="t-desc" maxlength="4500" placeholder="A few lines about the video, and a call to follow">${esc(S.text.description)}</textarea></label>
      <label class="field wide"><span class="label">Hashtags</span><input id="t-tags" value="${esc(S.text.hashtags)}" placeholder="#ai #manufacturing #kmr"></label>
      ${eachMany || !n ? '' : thumbPicker()}
    </div>
  </section>
  <section class="panel">
    <div class="panel-head"><div><h2><span class="step-no">3</span>Post to</h2><p>Tick accounts from one profile or several. Your choice is remembered.</p></div>
      ${anyAcc ? `<div class="btn-row"><button class="btn sm quiet" data-act="all-on">Tick all</button><button class="btn sm quiet" data-act="all-off">Clear</button></div>` : ''}</div>
    <div class="targets">${profs.map(targetProfile).join('') || '<p class="muted">No profiles yet.</p>'}</div>
  </section>
  <label class="check-row ask-first"><input type="checkbox" id="ask-first" ${askFirst() ? 'checked' : ''}> Ask me first: send it ${S.st.settings.telegram_chat_id ? 'to Telegram' : 'to History'} for my OK before posting</label>
  <div class="post-bar"><span class="muted small">${up ? `Uploading ${up} video${up > 1 ? 's' : ''}…` : ready ? `${outCount} video${outCount === 1 ? '' : 's'} → ${tcount} account${tcount === 1 ? '' : 's'}` : 'Add a video to start'}</span>
    <button class="btn primary big" data-act="post" ${!ready || up || !tcount ? 'disabled' : ''}>${icon('upload')}Post now</button></div>`;
}
function thumbPicker() {
  const a = S.ai;
  const tiles = a.thumbs.map((d, i) => `<button class="th ${a.sel === i ? 'on' : ''}" data-th="${i}" aria-label="Thumbnail ${i + 1}"><img src="${d}" alt=""></button>`).join('')
    + (a.own ? `<button class="th ${a.sel === 'own' ? 'on' : ''}" data-th="own" aria-label="Your picture"><img src="${a.own}" alt=""></button>` : '');
  const waiting = a.state === 'running' ? '<div class="th ph"><span class="spin"></span></div>'.repeat(3) : '';
  return `<div class="field wide"><span class="label">Thumbnail${a.thumbs.length ? ' (tap to choose)' : ''}</span>
    ${tiles || waiting ? `<div class="thumbs">${tiles}${waiting}</div>` : '<p class="muted small" style="margin:0">Made by the AI right after the upload, or while posting.</p>'}
    <div class="btn-row" style="margin-top:8px">
      <label class="btn sm">${icon('upload')}Use my picture<input type="file" id="own-th" accept="image/*" hidden></label>
      <button class="btn sm ${a.sel === 'none' ? 'primary' : 'quiet'}" data-th="none">No thumbnail</button></div>
    ${a.thumbs.length ? `<div class="copyline" style="margin-top:8px"><input id="th-words" class="th-words" maxlength="40" value="${esc(a.thumb_text)}" aria-label="Words on the thumbnail"><button class="btn sm" data-act="remake">Change words</button></div>` : ''}</div>`;
}
function askFirst() { return S.approve ?? (S.st.settings.approve_default !== false); }
const baseName = n => String(n || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
function clipRow(c, i, n) {
  const status = c.status === 'uploading' ? `<div class="bar"><i style="width:${Math.round(c.progress || 0)}%"></i></div><div class="meta">Uploading ${Math.round(c.progress || 0)}%</div>`
    : c.status === 'failed' ? `<div class="meta err">${esc(c.error || 'Upload failed')}</div>` : `<div class="meta">${c.duration ? fmtDur(c.duration) + ' · ' : ''}${c.w ? c.w + '×' + c.h + ' · ' : ''}${fmtSize(c.size)}</div>`;
  return `<div class="clip ${c.status === 'failed' ? 'failed' : ''}" data-key="${c.key}">
    <span class="num">${i + 1}</span>
    <button class="clip-play" data-play="${c.key}" aria-label="Play ${esc(c.name)}"><video src="${c.url}#t=0.5" muted playsinline preload="metadata"></video><span class="play-ic">▶</span></button>
    <div class="info"><div class="name" title="${esc(c.name)}">${esc(c.name)}</div>${status}
      ${S.mode === 'each' && n > 1 && c.status !== 'failed' ? `<div class="title-in"><input data-title="${c.key}" maxlength="100" value="${esc(c.title || '')}" placeholder="Title: ${esc(baseName(c.name))}" aria-label="Title for video ${i + 1}"></div>` : ''}</div>
    <div class="acts">${n > 1 ? `<button class="btn icon quiet" data-move="-1" data-k="${c.key}" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up')}</button><button class="btn icon quiet" data-move="1" data-k="${c.key}" ${i === n - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down')}</button>` : ''}
      <button class="btn icon quiet" data-remove="${c.key}" aria-label="Remove">${icon('x')}</button></div>
  </div>`;
}
function targetProfile(p) {
  const chips = PL.map(([k, l]) => {
    const t = `${p.id}:${k}`, ok = p[k].ok, on = ok && S.targets.has(t);
    return ok ? `<label class="tchip ${on ? 'on' : ''}"><input type="checkbox" data-target="${t}" ${on ? 'checked' : ''}><span class="box"></span>${plBadge(k)}${l}${p[k].label ? ` <small>${esc(p[k].label)}</small>` : ''}</label>`
      : `<a class="tchip off" href="#profiles" title="Not connected: open Profiles">${plBadge(k)}${l} <small>connect</small></a>`;
  }).join('');
  const ids = PL.filter(([k]) => p[k].ok).map(([k]) => `${p.id}:${k}`);
  const allOn = ids.length && ids.every(t => S.targets.has(t));
  return `<div class="tprof"><div class="tprof-head"><b>${esc(p.name)}</b>${ids.length ? `<button class="btn sm quiet" data-prof-all="${p.id}">${allOn ? 'Untick' : 'Tick all'}</button>` : ''}</div><div class="tchips">${chips}</div></div>`;
}
function saveText() {
  const t = $('#t-title'), d = $('#t-desc'), h = $('#t-tags');
  if (t) S.text.title = t.value; if (d) S.text.description = d.value; if (h) S.text.hashtags = h.value;
  $$('[data-title]').forEach(i => { const c = S.clips.find(x => x.key === i.dataset.title); if (c) c.title = i.value; });
}
function bindPost() {
  const input = $('#files'), drop = $('#drop');
  input.onchange = () => { addFiles([...input.files]); input.value = ''; };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files].filter(f => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name))); };
  $$('input,textarea', $('#main')).forEach(el => { if (el.id?.startsWith('t-') || el.dataset.title) el.oninput = saveText; });
  $$('[data-mode]').forEach(b => b.onclick = () => { saveText(); S.mode = b.dataset.mode; rerenderMain(); });
  $$('[data-ratio]').forEach(b => b.onclick = () => { S.ratio = b.dataset.ratio; rerenderMain(); });
  $$('[data-fit]').forEach(b => b.onclick = () => { S.fit = b.dataset.fit; rerenderMain(); });
  $$('[data-move]').forEach(b => b.onclick = () => { saveText(); const i = S.clips.findIndex(c => c.key === b.dataset.k), j = i + Number(b.dataset.move); [S.clips[i], S.clips[j]] = [S.clips[j], S.clips[i]]; rerenderMain(); });
  $$('[data-play]').forEach(b => b.onclick = () => { const c = S.clips.find(x => x.key === b.dataset.play); if (c) player(c.url, c.name); });
  $$('[data-remove]').forEach(b => b.onclick = () => { saveText(); const c = S.clips.find(x => x.key === b.dataset.remove); if (!c) return; c.abort?.abort(); if (c.pathname) api('/upload/discard', { body: { pathnames: [c.pathname] } }).catch(() => {}); URL.revokeObjectURL(c.url); S.clips = S.clips.filter(x => x !== c); if (!S.clips.length) S.ai = freshAi(); rerenderMain(); });
  $$('[data-target]').forEach(i => i.onchange = () => { saveText(); i.checked ? S.targets.add(i.dataset.target) : S.targets.delete(i.dataset.target); rerenderMain(); });
  $$('[data-prof-all]').forEach(b => b.onclick = () => { saveText(); const p = S.st.profiles.find(x => x.id === b.dataset.profAll); const ids = PL.filter(([k]) => p[k].ok).map(([k]) => `${p.id}:${k}`); const all = ids.every(t => S.targets.has(t)); ids.forEach(t => all ? S.targets.delete(t) : S.targets.add(t)); rerenderMain(); });
  const allAct = on => { saveText(); S.st.profiles.forEach(p => PL.forEach(([k]) => { if (p[k].ok) on ? S.targets.add(`${p.id}:${k}`) : S.targets.delete(`${p.id}:${k}`); })); rerenderMain(); };
  const a1 = $('[data-act="all-on"]'), a0 = $('[data-act="all-off"]');
  if (a1) a1.onclick = () => allAct(true); if (a0) a0.onclick = () => allAct(false);
  const af = $('#ask-first'); if (af) af.onchange = () => { S.approve = af.checked; };
  const ai = $('[data-act="ai"]'); if (ai) ai.onclick = () => { saveText(); runPreview(true); };
  $$('[data-th]').forEach(b => b.onclick = () => { const v = b.dataset.th; S.ai.sel = v === 'none' || v === 'own' ? v : Number(v); rerenderMain(); });
  const own = $('#own-th'); if (own) own.onchange = () => ownThumb(own.files[0]);
  const rm = $('[data-act="remake"]'); if (rm) rm.onclick = e => busy(e.currentTarget, async () => {
    const words = $('#th-words').value.trim();
    const r = await api('/work', { body: { kind: 'preview', pathnames: previewPaths(), ratio: previewRatio(), picks: S.ai.picks, thumb_text: words } });
    S.ai.thumbs = r.thumbs; S.ai.thumb_text = r.thumb_text; if (S.ai.sel === 'none') S.ai.sel = 0; rerenderMain();
  });
  maybePreview();
  $('[data-act="post"]').onclick = e => busy(e.currentTarget, doPost);
}

// Full-screen player for a video (a clip you picked, or a finished post).
function player(src, title) {
  const d = document.createElement('div');
  d.className = 'player';
  d.innerHTML = `<div class="player-box"><div class="player-head"><b>${esc(title || 'Preview')}</b><button class="btn icon quiet" aria-label="Close">${icon('x')}</button></div><video src="${esc(src)}" controls autoplay playsinline></video></div>`;
  const close = () => { d.querySelector('video').pause(); d.remove(); document.removeEventListener('keydown', esc1); };
  const esc1 = e => { if (e.key === 'Escape') close(); };
  d.onclick = e => { if (e.target === d || e.target.closest('.player-head button')) close(); };
  document.addEventListener('keydown', esc1);
  document.body.append(d);
}

function addFiles(list) {
  if (!list.length) return;
  for (const f of list) {
    if (f.size > 600 * 1024 * 1024) { toast(`${f.name} is larger than 600 MB. Make it smaller first.`, true); continue; }
    const c = { key: 'c' + (++seq), file: f, name: f.name, size: f.size, url: URL.createObjectURL(f), status: 'uploading', progress: 0, title: '' };
    S.clips.push(c);
    readMeta(c);
    upload(c);
  }
  rerenderMain();
}
function readMeta(c) {
  const v = document.createElement('video');
  v.preload = 'metadata'; v.muted = true; v.src = c.url;
  v.onloadedmetadata = () => { c.duration = v.duration; c.w = v.videoWidth; c.h = v.videoHeight; if (S.page === 'post') refreshClip(c); };
}
function refreshClip(c) {
  const el = $(`.clip[data-key="${c.key}"]`); if (!el) return;
  const i = S.clips.indexOf(c);
  const tmp = document.createElement('div'); tmp.innerHTML = clipRow(c, i, S.clips.length);
  const fresh = tmp.firstElementChild;
  if (c.status === 'uploading') { const bar = $('.bar i', el), meta = $('.meta', el); if (bar && meta) { bar.style.width = Math.round(c.progress) + '%'; meta.textContent = 'Uploading ' + Math.round(c.progress) + '%'; return; } }
  el.replaceWith(fresh);
  bindPost();
}
const safeName = n => (String(n).normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/\.{2,}/g, '.').replace(/_+/g, '_').replace(/^[._]+/, '').slice(-60) || 'video.mp4');
async function upload(c) {
  const pathname = 'up/' + Date.now().toString(36) + '-' + safeName(c.name);
  try {
    if (S.st.upload === 'direct') {
      await new Promise((res, rej) => {
        const x = new XMLHttpRequest(); x.open('PUT', '/__blob/' + pathname);
        x.upload.onprogress = e => { c.progress = e.loaded / e.total * 100; refreshClip(c); };
        x.onload = () => x.status < 300 ? res() : rej(new Error('Upload failed (' + x.status + ')'));
        x.onerror = () => rej(new Error('Upload failed. Check the internet connection.'));
        x.send(c.file);
      });
      c.pathname = pathname;
    } else {
      if (!window.KMRBlob) throw new Error('The uploader did not load. Reload the page.');
      c.abort = new AbortController();
      const r = await window.KMRBlob.uploadPresigned(pathname, c.file, {
        access: 'private', handleUploadUrl: '/api/upload', contentType: c.file.type || 'video/mp4', multipart: c.size > 150 * 1024 * 1024, abortSignal: c.abort.signal,
        onUploadProgress: e => { c.progress = e.percentage; refreshClip(c); }
      });
      c.pathname = r.pathname;
    }
    c.status = 'ready'; c.progress = 100;
  } catch (e) {
    if (!S.clips.includes(c)) return;
    c.status = 'failed'; c.error = /abort/i.test(e.message) ? 'Stopped' : 'Upload failed: ' + e.message;
  }
  if (S.page === 'post') rerenderMain();
}

// ---- AI preview (runs by itself once the videos are uploaded) ----
const previewPaths = () => readyClips().map(c => c.pathname);
const previewRatio = () => S.mode === 'join' && S.clips.length > 1 ? S.ratio : 'auto';
const previewKey = () => previewPaths().join('|') + '#' + previewRatio();
function maybePreview() {
  const n = S.clips.length, s = S.st.settings;
  if (!n || S.clips.some(c => c.status !== 'ready') || (S.mode === 'each' && n > 1)) return;
  if (S.ai.state === 'running' || S.ai.key === previewKey()) return;
  if (s.auto_text === false && s.auto_thumb === false) return;
  runPreview(false);
}
async function runPreview(force) {
  const key = previewKey();
  S.ai = { ...S.ai, state: 'running', key, warn: '', started: Date.now() };
  rerenderMain();
  clearInterval(S.aiTick);
  S.aiTick = setInterval(() => { const el = $('#ai-secs'); if (S.ai.state !== 'running') return clearInterval(S.aiTick); if (el) el.textContent = Math.round((Date.now() - S.ai.started) / 1000); }, 1000);
  try {
    const r = await api('/work', { body: { kind: 'preview', pathnames: previewPaths(), ratio: previewRatio(), hint: S.text.title || '' } });
    if (S.ai.key !== key) return; // the videos changed meanwhile
    saveText();
    const fill = (k, v) => { if (v && (force || !String(S.text[k] || '').trim())) S.text[k] = v; };
    if (force || S.st.settings.auto_text !== false) { fill('title', r.title); fill('description', r.description); fill('hashtags', (r.hashtags || []).join(' ')); }
    const busyNow = /high demand|busy|overloaded|limit|try again/i.test(r.warn || '');
    S.ai = { ...S.ai, state: 'done', thumbs: r.thumbs || [], picks: r.picks || [], thumb_text: r.thumb_text || '', warn: r.warn ? r.warn + (busyNow && !S.ai.retried ? ' KMR Studio tries again by itself in 30 seconds.' : '') : '', sel: S.ai.sel === 'own' ? 'own' : (S.st.settings.auto_thumb === false && !force ? 'none' : 0) };
    if (busyNow && !S.ai.retried) { S.ai.retried = true; setTimeout(() => { if (S.ai.key === key && S.page === 'post') runPreview(false); }, 30000); }
    else if (!r.warn) S.ai.retried = false;
  } catch (e) {
    if (S.ai.key !== key) return;
    S.ai = { ...S.ai, state: 'done', warn: 'The AI preview did not work: ' + e.message + ' You can still post; the AI tries again while posting.' };
  }
  if (S.page === 'post') rerenderMain();
}
function ownThumb(f) {
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    const c = S.clips[0] || {}, vertical = (c.h || 16) > (c.w || 9) && S.ratio !== '16:9' || S.ratio === '9:16';
    const W = vertical ? 1080 : 1280, H = vertical ? 1920 : 720;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'), sc = Math.max(W / img.width, H / img.height);
    g.drawImage(img, (W - img.width * sc) / 2, (H - img.height * sc) / 2, img.width * sc, img.height * sc);
    S.ai.own = cv.toDataURL('image/jpeg', 0.86); S.ai.sel = 'own'; URL.revokeObjectURL(img.src); rerenderMain();
  };
  img.onerror = () => toast('That picture could not be opened. Use a JPG or PNG.', true);
  img.src = URL.createObjectURL(f);
}
function chosenThumb() {
  const a = S.ai;
  if (a.sel === 'none') return 'none';
  if (a.sel === 'own') return a.own || undefined;
  return a.thumbs[a.sel] || undefined; // nothing chosen: the AI makes one while posting
}

async function doPost() {
  saveText();
  const clips = readyClips();
  if (S.clips.some(c => c.status === 'failed')) throw new Error('Remove the videos that failed to upload (marked red) first.');
  const targets = [...S.targets].filter(isConnected);
  const body = {
    mode: S.mode === 'join' && clips.length > 1 ? 'join' : 'each',
    items: clips.map(c => ({ pathname: c.pathname, name: c.name, size: c.size, title: c.title || '', description: S.text.description, hashtags: S.text.hashtags })),
    join: { title: S.text.title, description: S.text.description, hashtags: S.text.hashtags, ratio: S.ratio, fit: S.fit, thumb_data: chosenThumb(), hint: S.text.title },
    targets, approve: askFirst()
  };
  if (body.mode === 'each' && clips.length === 1) Object.assign(body.items[0], { title: S.text.title, thumb_data: chosenThumb() });
  const r = await api('/posts', { body });
  api('/settings', { body: { default_targets: targets } }).then(x => S.st.settings = x.settings).catch(() => {});
  S.clips.forEach(c => URL.revokeObjectURL(c.url));
  S.clips = []; S.text = { title: '', description: '', hashtags: '' }; S.ai = freshAi();
  toast(body.approve ? (S.st.settings.telegram_chat_id ? 'Getting it ready. It comes to Telegram for your OK in a minute.' : 'Getting it ready. Approve it in History.') : r.jobs.length > 1 ? `${r.jobs.length} posts started. Follow them in History.` : 'Posting started. Follow it in History.');
  S.jobs = [...r.jobs.map(j => ({ ...j, results: {} })), ...S.jobs.filter(j => !r.jobs.some(n => n.id === j.id))];
  location.hash = '#history';
}

// ---------- History ----------
let poll;
async function loadJobs() {
  clearTimeout(poll);
  try { S.jobs = (await api('/posts')).jobs; } catch (e) { toast(e.message, true); }
  if (S.page !== 'history') return;
  rerenderMain();
  if (activeCount()) poll = setTimeout(loadJobs, 4000);
}
const JOB_PILL = { preparing: ['run', 'Preparing'], review: ['run', 'Waiting for your OK'], rejected: ['', 'Rejected'], posting: ['run', 'Posting'], done: ['ok', 'Posted'], partial: ['bad', 'Some failed'], failed: ['bad', 'Failed'] };
function pageHistory() {
  const jobs = S.jobs;
  return `<div class="page-head"><div><p class="eyebrow">History</p><h1>Your posts</h1><p>Live status for every account. Failed ones can be retried.</p></div>
    <button class="btn sm" data-act="reload" onclick="this.disabled=true">${icon('refresh')}Refresh</button></div>
    ${jobs.length ? jobs.map(jobCard).join('') : `<div class="panel empty"><p>Nothing posted yet.</p><a class="btn primary" href="#post">${icon('upload')}Post a video</a></div>`}`;
}
function jobCard(j) {
  const [cls, label] = JOB_PILL[j.status] || ['', j.status];
  const v = j.video;
  const profs = S.st.profiles || [];
  const rows = (j.targets || []).map(t => {
    const [pid, pl] = t.split(':'); const p = profs.find(x => x.id === pid);
    const r = (j.results || {})[t] || {};
    const stale = r.status === 'running' && Date.now() - (r.updated || 0) > 6 * 60000;
    const st = j.status === 'rejected' || (j.status === 'failed' && !j.video) ? ['bad', 'Not posted'] : j.status === 'review' ? ['', 'Waiting for OK'] : j.status === 'preparing' ? ['', 'Waiting'] : r.status === 'done' ? ['ok', 'Posted'] : r.status === 'failed' ? ['bad', 'Failed'] : r.status === 'running' ? ['run', 'Posting'] : ['', 'Waiting'];
    const msg = r.status === 'done' ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${icon('link')} Open post</a>${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}`
      : r.status === 'failed' ? `<span class="err">${esc(r.error)}</span>` : stale ? '<span class="err">This seems stuck. Press Retry.</span>' : esc(r.msg || '');
    return `<div class="row">${plBadge(pl)}<div class="who"><b>${plName(pl)}</b> <span class="muted">· ${esc(p?.name || pid)}</span><div class="msg">${msg}</div></div>
      <div class="btn-row"><span class="pill ${st[0]}"><i class="dot"></i>${st[1]}</span>${(r.status === 'failed' || stale) && !j.files_removed ? `<button class="btn sm" data-retry="${j.id}" data-t="${t}">${icon('refresh')}Retry</button>` : ''}</div></div>`;
  }).join('');
  const wide = v && v.w > v.h;
  const last = (j.log || []).slice(-1)[0];
  return `<section class="panel"><div class="job">
    ${v && !j.files_removed ? `<video class="thumb ${wide ? 'wide' : ''}" src="/api/preview?p=${encodeURIComponent(v.pathname)}#t=0.5" ${j.thumb ? `poster="/api/preview?p=${encodeURIComponent(j.thumb)}"` : ''} controls preload="none" playsinline></video>` : j.thumb ? `<img class="thumb ${wide ? 'wide' : ''}" src="/api/preview?p=${encodeURIComponent(j.thumb)}" alt="">` : `<div class="thumb ${wide ? 'wide' : ''}">${icon('film')}</div>`}
    <div style="min-width:0">
      <div class="job-head"><div style="min-width:0"><h3>${esc(j.title)}</h3><div class="muted small">${ago(j.created)} · ${j.mode === 'join' ? `${j.sources.length} videos joined` : '1 video'}${v ? ` · ${fmtDur(v.duration)} · ${v.w}×${v.h}` : ''}</div></div>
        <div class="btn-row"><span class="pill ${cls}"><i class="dot"></i>${label}</span>
          ${j.status === 'failed' && !j.video && !j.files_removed ? `<button class="btn sm" data-retry="${j.id}">${icon('refresh')}Retry</button>` : ''}
          <button class="btn icon quiet" data-del="${j.id}" aria-label="Delete">${icon('trash')}</button></div></div>
      ${j.status === 'review' ? `<div class="banner" style="margin:10px 0 0"><span>Check the video, title and thumbnail, then approve.${S.st.settings.telegram_chat_id ? ' You can also approve in Telegram.' : ''}</span><div class="btn-row"><button class="btn primary sm" data-approve="${j.id}">${icon('check')}Approve and post</button><button class="btn sm quiet danger" data-reject="${j.id}">Reject</button></div></div>` : ''}
      ${j.error ? `<p class="err small">${esc(j.error)}</p>` : last && j.status === 'preparing' ? `<p class="small muted">${esc(last.msg)}</p>` : ''}
      <div class="rows">${rows}</div>
      ${j.files_removed && j.status !== 'done' ? '<p class="muted small">The video file was cleared from storage after 7 days. Upload it again to post it.</p>' : ''}
    </div></div></section>`;
}
document.addEventListener('click', e => {
  const r = e.target.closest('[data-retry]'), d = e.target.closest('[data-del]'), rl = e.target.closest('[data-act="reload"]');
  if (rl) loadJobs();
  const ap = e.target.closest('[data-approve]'), rj = e.target.closest('[data-reject]');
  if (ap) busy(ap, async () => { await api(`/posts/${ap.dataset.approve}/approve`, { body: {} }); toast('Approved. Posting now.'); await loadJobs(); });
  if (rj && confirm('Reject this video? Nothing will be posted and the video file is deleted.')) busy(rj, async () => { await api(`/posts/${rj.dataset.reject}/reject`, { body: {} }); await loadJobs(); });
  if (r) busy(r, async () => { await api(`/posts/${r.dataset.retry}/retry`, { body: { target: r.dataset.t || undefined } }); toast('Trying again.'); await loadJobs(); });
  if (d && confirm('Delete this post from the history? (Posts already online stay online.)')) busy(d, async () => { await api('/posts/' + d.dataset.del, { method: 'DELETE' }); await loadJobs(); });
});

// ---------- Profiles ----------
function pageProfiles() {
  const profs = S.st.profiles || [];
  return `<div class="page-head"><div><p class="eyebrow">Profiles</p><h1>People and brands</h1><p>A profile is one person or brand you post for. Each profile connects <b>its own</b> YouTube, Instagram, Facebook, LinkedIn and X here. The app keys in Settings are made once and serve every profile.</p></div>
    <button class="btn primary" data-act="add-prof">${icon('plus')}Add profile</button></div>
    ${profs.map(profileCard).join('')}`;
}
function profileCard(p) {
  const s = S.st.settings;
  const acc = (k, title, sub, body, buttons) => `<div class="acc">${plBadge(k)}<div class="who"><b>${title}</b><span>${sub}</span></div><div class="btn-row">${buttons}</div>${body ? `<div class="acc-body">${body}</div>` : ''}</div>`;
  const status = k => p[k].ok ? `<span class="ok">Connected${p[k].label ? ': ' + esc(p[k].label) : ''}</span>` : p[k].problem ? `<span class="err">${esc(p[k].problem)}</span>` : 'Not connected';
  const connected = k => `<button class="btn sm" data-check="${p.id}:${k}">Check</button><button class="btn sm quiet danger" data-disc="${p.id}:${k}">Disconnect</button>`;
  // YouTube
  const y = S.yt[p.id];
  const ytBody = y && y.state === 'waiting' ? `<div class="code-box"><span class="code-big">${esc(y.code)}</span><div><p style="margin:0">Open <a href="${esc(y.url)}" target="_blank" rel="noopener">${esc(y.url)}</a>, sign in with the Google account of the channel and type this code.</p><p class="muted small" style="margin:4px 0 0"><span class="spin"></span> Waiting for Google… <button class="btn sm quiet" data-ytcheck="${p.id}">Check now</button></p><p class="muted small" style="margin:4px 0 0">If Google says "Access blocked": ${p.youtube.own_keys ? 'this profile uses <b>its own Google app</b> (from the laptop). Either press <b>Use shared keys</b> (the Google app in Settings) and add this Gmail as a test user there, or add this Gmail as a test user in the own app\'s Google Cloud project' : 'in Google Cloud (Google Auth Platform, Audience) add this Gmail under Test users, or publish the app'}, then press Connect again.</p></div></div>` : '';
  const ytBtns = p.youtube.ok ? connected('youtube') : `<button class="btn sm primary" data-yt="${p.id}" ${s.yt_client_id ? '' : 'disabled title="Save the Google keys in Settings first"'}>Connect</button>`;
  // Meta
  const open = S.open[p.id + ':meta'];
  const pages = p.facebook.pages || [];
  const metaBody = open ? `<p class="small muted" style="margin-top:0">In <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener">Graph API Explorer</a>: choose your Meta app, add the permissions <code>pages_show_list</code> <code>pages_manage_posts</code> <code>pages_read_engagement</code> <code>instagram_basic</code> <code>instagram_content_publish</code>, press <b>Generate Access Token</b>, pick the Page, copy the token.</p>
    <label class="field"><span class="label">Access token</span><textarea id="tok-${p.id}" rows="3" placeholder="EAA…" spellcheck="false"></textarea></label>
    ${pages.length > 1 ? `<label class="field" style="margin-top:10px"><span class="label">Facebook Page</span><select id="page-${p.id}">${pages.map(x => `<option value="${esc(x.id)}" ${x.name === p.facebook.label ? 'selected' : ''}>${esc(x.name)}${x.ig ? ' (Instagram @' + esc(x.ig) + ')' : ''}</option>`).join('')}</select></label>` : ''}
    <details class="help" ${p.facebook.own_app ? 'open' : ''}><summary>This profile's own Meta app (only if this person made their own app)</summary>
      <p class="muted small">Leave empty to use the Meta app from Settings (${esc(s.meta_app_id || 'not saved yet')}). If the token was made with another app, KMR Studio tells you its name; then paste that app's ID and secret here.</p>
      <div class="form-grid"><label class="field"><span class="label">App ID</span><input id="mapp-id-${p.id}" value="${esc(p.facebook.own_app || '')}" autocomplete="off"></label><label class="field"><span class="label">App secret${p.facebook.own_app ? ' (saved)' : ''}</span><input id="mapp-sec-${p.id}" placeholder="${p.facebook.own_app ? 'Saved: leave empty to keep it' : ''}" autocomplete="off"></label></div></details>
    <div class="btn-row" style="margin-top:10px"><button class="btn primary sm" data-meta="${p.id}">Connect</button><button class="btn quiet sm" data-open="${p.id}:meta">Cancel</button></div>` : '';
  const metaBtns = (p.facebook.ok ? `<button class="btn sm" data-check="${p.id}:meta">Check</button>` : '') + `<button class="btn sm ${p.facebook.ok ? '' : 'primary'}" data-open="${p.id}:meta" ${s.meta_app_id ? '' : 'disabled title="Save the Meta app keys in Settings first"'}>${p.facebook.ok ? 'Change' : 'Connect'}</button>` + (p.facebook.ok ? `<button class="btn sm quiet danger" data-disc="${p.id}:meta">Disconnect</button>` : '');
  const liExp = p.linkedin.expires_at ? ` · login ends ${new Date(p.linkedin.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : '';
  return `<section class="panel"><div class="panel-head"><div><h2>${esc(p.name)}</h2></div>
    <div class="btn-row"><button class="btn sm quiet" data-rename="${p.id}">Rename</button>${(S.st.profiles.length > 1) ? `<button class="btn sm quiet danger" data-delprof="${p.id}">Delete</button>` : ''}</div></div>
    ${acc('youtube', 'YouTube', status('youtube') + (p.youtube.own_keys ? ' <span class="muted">· uses this profile\'s own Google app</span>' : ''), ytBody, ytBtns + (p.youtube.own_keys && !p.youtube.ok ? `<button class="btn sm quiet" data-own-clear="${p.id}" title="Use the Google app from Settings instead">Use shared keys</button>` : ''))}
    ${acc('instagram', 'Instagram and Facebook', p.facebook.ok ? `<span class="ok">Page: ${esc(p.facebook.label)}</span>${p.instagram.ok ? ` · <span class="ok">Instagram ${esc(p.instagram.label)}</span>` : ' · <span class="err">no Instagram linked to this Page</span>'}` : status('facebook'), metaBody, metaBtns)}
    ${acc('linkedin', 'LinkedIn', status('linkedin') + (p.linkedin.ok ? liExp : ''), '', (p.linkedin.ok ? `<button class="btn sm" data-check="${p.id}:linkedin">Check</button>` : '') + `<button class="btn sm ${p.linkedin.ok ? '' : 'primary'}" data-oauth="${p.id}:linkedin" ${s.li_client_id ? '' : 'disabled title="Save the LinkedIn keys in Settings first"'}>${p.linkedin.ok ? 'Reconnect' : 'Connect'}</button>` + (p.linkedin.ok ? `<button class="btn sm quiet danger" data-disc="${p.id}:linkedin">Disconnect</button>` : ''))}
    ${acc('x', 'X', status('x') + ' <span class="muted">· paid by X per post</span>', '', p.x.ok ? connected('x') : `<button class="btn sm primary" data-oauth="${p.id}:x" ${s.x_client_id ? '' : 'disabled title="Save the X keys in Settings first"'}>Connect</button>`)}
    <details class="help"><summary>Own Google keys for this profile (optional)</summary>
      <p class="muted small">YouTube allows about 6 uploads a day per Google project. Give a busy profile its own project's keys to get its own limit.${p.youtube.own_keys ? ' <b>Own keys saved.</b>' : ''}</p>
      <div class="form-grid"><label class="field"><span class="label">Client ID</span><input id="own-id-${p.id}"></label><label class="field"><span class="label">Client secret</span><input id="own-sec-${p.id}"></label></div>
      <div class="btn-row" style="margin-top:10px"><button class="btn sm" data-own="${p.id}">Save keys</button>${p.youtube.own_keys ? `<button class="btn sm quiet" data-own-clear="${p.id}">Use shared keys</button>` : ''}</div></details>
  </section>`;
}
async function refreshState() { const st = await api('/state'); S.st = st; }
document.addEventListener('click', e => {
  const t = e.target.closest('button,a'); if (!t || S.page !== 'profiles') return;
  const d = t.dataset;
  if (d.act === 'add-prof') { const name = prompt('Name of the person or brand (for example: KMR Group):'); if (name) busy(t, async () => { await api('/profiles', { body: { name } }); await refreshState(); rerenderMain(); toast('Profile added. Connect its accounts below.'); }); }
  if (d.rename) { const p = S.st.profiles.find(x => x.id === d.rename); const name = prompt('New name:', p.name); if (name) busy(t, async () => { await api('/profiles/' + d.rename, { body: { name } }); await refreshState(); rerenderMain(); }); }
  if (d.delprof) { const p = S.st.profiles.find(x => x.id === d.delprof); if (confirm(`Delete the profile "${p.name}" and disconnect its accounts?`)) busy(t, async () => { await api('/profiles/' + d.delprof, { method: 'DELETE' }); await refreshState(); rerenderMain(); }); }
  if (d.open) { S.open[d.open] = !S.open[d.open]; rerenderMain(); }
  if (d.check) { const [pid, k] = d.check.split(':'); busy(t, async () => { try { toast((await api(`/profiles/${pid}/${k}/check`, { body: {} })).message); } finally { await refreshState(); rerenderMain(); } }); }
  if (d.disc) { const [pid, k] = d.disc.split(':'); if (confirm('Disconnect this account? You can connect it again any time.')) busy(t, async () => { await api(`/profiles/${pid}/${k}/disconnect`, { body: {} }); S.targets.delete(`${pid}:${k}`); if (k === 'meta') { S.targets.delete(`${pid}:facebook`); S.targets.delete(`${pid}:instagram`); } await refreshState(); rerenderMain(); }); }
  if (d.meta) busy(t, async () => { const tok = $('#tok-' + d.meta).value.trim(); const pg = $('#page-' + d.meta); const oid = $('#mapp-id-' + d.meta), osec = $('#mapp-sec-' + d.meta); const r = await api(`/profiles/${d.meta}/meta/connect`, { body: { user_token: tok, page_id: pg ? pg.value : undefined, own_app_id: oid ? oid.value.trim() : undefined, own_app_secret: osec && osec.value.trim() ? osec.value.trim() : undefined } }); S.open[d.meta + ':meta'] = false; await refreshState(); rerenderMain(); toast(r.message); });
  if (d.oauth) { const [pid, k] = d.oauth.split(':'); busy(t, async () => { const r = await api(`/profiles/${pid}/${k}/start`); location.href = r.url; }); }
  if (d.yt) busy(t, async () => { const first = !S.yt[d.yt]; S.yt[d.yt] = { ...await api(`/profiles/${d.yt}/youtube/start`, { body: {} }), polling: true }; rerenderMain(); if (first) ytPoll(d.yt); });
  if (d.ytcheck) busy(t, async () => { await ytPoll(d.ytcheck, 0, true); if (S.yt[d.ytcheck]) toast('Google has not seen the code yet. Enter it at google.com/device and press Allow.'); });
  if (d.own) busy(t, async () => { await api(`/profiles/${d.own}/youtube/keys`, { body: { client_id: $('#own-id-' + d.own).value, client_secret: $('#own-sec-' + d.own).value } }); await refreshState(); rerenderMain(); toast('Saved. Press Connect for YouTube to sign in with the new keys.'); });
  if (d.ownClear) busy(t, async () => { await api(`/profiles/${d.ownClear}/youtube/keys`, { body: {} }); delete S.yt[d.ownClear]; await refreshState(); rerenderMain(); toast('This profile now uses the Google app from Settings. Press Connect for YouTube.'); });
});
async function ytPoll(pid, fails = 0, now) {
  if (!now) await new Promise(r => setTimeout(r, 5000));
  if (!S.yt[pid]) return; // connected meanwhile, or Connect pressed again
  let r;
  try { r = await api(`/profiles/${pid}/youtube/poll`); }
  catch (e) { // a network hiccup: keep checking a few times before giving up
    if (now) throw e;
    if (fails < 5) return ytPoll(pid, fails + 1);
    delete S.yt[pid]; if (S.page === 'profiles') rerenderMain(); toast('Stopped waiting for Google: ' + e.message + ' Press Connect again.', true); return;
  }
  if (r.state === 'waiting') { S.yt[pid] = { ...r, polling: true }; return now ? null : ytPoll(pid); }
  delete S.yt[pid];
  await refreshState();
  if (S.page === 'profiles') rerenderMain();
  r.state === 'connected' ? toast('YouTube connected: ' + (r.channel || 'your channel')) : toast(r.error || 'The code expired. Press Connect again.', true);
}

// ---------- Settings ----------
function pageSettings() {
  const s = S.st.settings;
  const f = (k, label, secret, ph) => `<label class="field"><span class="label">${label}${secret && s[k] ? ' (saved)' : ''}</span><input data-key="${k}" value="${secret ? '' : esc(s[k] || '')}" placeholder="${secret && s[k] ? 'Saved: leave empty to keep it' : esc(ph || '')}" autocomplete="off" spellcheck="false"></label>`;
  const box = (title, ok, intro, steps, fields) => `<details class="panel" ${ok ? '' : 'open'}><summary style="cursor:pointer;list-style:none"><div class="panel-head" style="margin:0"><h2>${title}</h2><span class="pill ${ok ? 'ok' : ''}"><i class="dot"></i>${ok ? 'Saved' : 'To do'}</span></div></summary>
    <p class="muted small">${intro}</p>${steps.length ? `<ol class="steps small">${steps.map(x => `<li>${x}</li>`).join('')}</ol>` : ''}<div class="form-grid">${fields}</div>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-save>Save</button></div></details>`;
  const cb = S.st.callback;
  return `<div class="page-head"><div><p class="eyebrow">Settings</p><h1>App keys and options</h1><p>Everything here is for the whole studio, not for one profile.</p></div></div>
  <div class="explain"><div><b>Settings (once, for everyone)</b><span>The keys that let KMR Studio talk to Google, Meta, LinkedIn and X; the AI; Telegram; your logo.</span></div><div><b>Profiles (per person or brand)</b><span>Which YouTube channel, Facebook Page, Instagram, LinkedIn and X each profile posts to. <a href="#profiles">Open Profiles</a></span></div></div>
  ${box('YouTube: Google keys', s.yt_client_id, 'Free. Lets every profile connect a YouTube channel with a short code.', ['<a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a>: make a project and enable <b>YouTube Data API v3</b>.', 'Credentials, <b>Create credentials</b>, OAuth client ID, type <b>TVs and Limited Input devices</b>.', 'Copy the Client ID and secret here.'], f('yt_client_id', 'Client ID') + f('yt_client_secret', 'Client secret', true))}
  ${box('Instagram and Facebook: Meta app', s.meta_app_id, 'Free. With the secret saved, Facebook and Instagram logins never expire.', ['<a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com</a>, your app (type Business).', 'App settings, Basic: copy the <b>App ID</b> and <b>App secret</b> here.'], f('meta_app_id', 'App ID') + f('meta_app_secret', 'App secret', true))}
  ${box('LinkedIn app', s.li_client_id, 'Free. Posts go to each person\'s own LinkedIn profile.', ['<a href="https://www.linkedin.com/developers/apps" target="_blank" rel="noopener">LinkedIn Developers</a>, your app, Products: add <b>Share on LinkedIn</b> and <b>Sign In with LinkedIn using OpenID Connect</b>.', `Auth tab, Authorized redirect URLs: add <code>${esc(cb)}</code>`, 'Copy the Client ID and secret here.'], f('li_client_id', 'Client ID') + f('li_client_secret', 'Client secret', true))}
  ${box('X app (optional, paid by X)', s.x_client_id, 'X charges about US$0.02 per video post from prepaid credits.', ['<a href="https://console.x.com" target="_blank" rel="noopener">console.x.com</a>, your app, User authentication: OAuth 2.0, <b>Web App</b>, <b>Read and write</b>.', `Callback URL: <code>${esc(cb)}</code>, Website: <code>https://www.kmr-groups.com</code>`, 'Copy the OAuth 2.0 Client ID and secret here.'], f('x_client_id', 'Client ID') + f('x_client_secret', 'Client secret', true))}
  ${box('AI writer: Gemini and Groq (free)', s.gemini_key, 'Gemini watches the video and writes the title, caption, hashtags and thumbnail headline. Groq is the backup when Gemini is busy: it listens to the video and writes from what is said.', ['Gemini: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>, <b>Create API key</b>, copy it here (use a personal Gmail).', 'Groq (backup): <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a>, <b>Create API Key</b>, copy it here.'], f('gemini_key', 'Gemini API key', true) + f('groq_key', 'Groq API key (backup)', true))}
  <section class="panel" id="tg"><div class="panel-head"><div><h2>Telegram: approve from your phone</h2><p>Each new video comes to your Telegram bot with Approve and Reject buttons, and you get the links once it is posted.</p></div>
      <span class="pill ${s.telegram_chat_id ? 'ok' : ''}"><i class="dot"></i>${s.telegram_chat_id ? 'Connected' + (s.telegram_bot ? ' to @' + esc(s.telegram_bot) : '') : 'Not connected'}</span></div>
    <ol class="steps small"><li>Already had a bot in the laptop version? <b>Bring keys from the laptop version</b> (below) brings it over. Otherwise: in Telegram open <b>@BotFather</b>, send <code>/newbot</code>, and copy the token it gives.</li><li>Paste the token and press <b>Connect</b>.</li><li>Press <b>Open Telegram</b> and tap <b>Start</b>. The bot says "KMR Studio is connected".</li></ol>
    <div class="form-grid"><label class="field"><span class="label">Bot token${s.telegram_token ? ' (saved)' : ''}</span><input id="tg-token" placeholder="${s.telegram_token ? 'Saved: leave empty to keep it' : '123456789:AA…'}" autocomplete="off" spellcheck="false"></label></div>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-tg="connect">${s.telegram_chat_id ? 'Connect again' : 'Connect'}</button>${S.tgLink ? `<a class="btn sm" href="${esc(S.tgLink)}" target="_blank" rel="noopener">Open Telegram and tap Start</a><button class="btn sm quiet" data-tg="check">I tapped Start</button>` : ''}${s.telegram_chat_id ? '<button class="btn sm" data-tg="test">Send a test</button><button class="btn sm quiet danger" data-tg="disconnect">Disconnect</button>' : ''}</div>
    <label class="check-row" style="margin-top:14px"><input type="checkbox" data-key="approve_default" ${s.approve_default !== false ? 'checked' : ''}> Ask me before posting (on Telegram, or in History)</label>
    <div class="btn-row" style="margin-top:10px"><button class="btn sm" data-save>Save</button></div></section>
  <section class="panel"><div class="panel-head"><div><h2>AI writing and thumbnails</h2><p>Needs the free Gemini key above.</p></div></div>
    <div class="form-grid">
      <label class="check-row"><input type="checkbox" data-key="auto_text" ${s.auto_text !== false ? 'checked' : ''}> AI writes the title, caption and hashtags by watching the video</label>
      <label class="check-row"><input type="checkbox" data-key="auto_thumb" ${s.auto_thumb !== false ? 'checked' : ''}> Make a thumbnail with a headline from the best moment</label>
      <label class="field"><span class="label">Language for titles, captions and thumbnails</span><select data-key="text_language">${['English', 'Tamil', 'Tamil and English mixed', 'Hindi'].map(l => `<option ${s.text_language === l ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-save>Save</button></div></section>
  <section class="panel"><div class="panel-head"><h2>Posting</h2></div>
    <div class="form-grid"><label class="field"><span class="label">YouTube visibility</span><select data-key="yt_privacy">${[['public', 'Public'], ['unlisted', 'Unlisted (only with the link)'], ['private', 'Private']].map(([k, l]) => `<option value="${k}" ${s.yt_privacy === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-save>Save</button></div></section>
  <section class="panel"><div class="panel-head"><div><h2>Bring keys from the laptop version</h2><p>Copies your app keys and every profile's connected accounts, so you do not have to find the keys or connect again.</p></div></div>
    <ol class="steps small"><li>On the laptop, open the KMR Studio folder (for example <code>C:\\kmr-studio</code>), then the <b>data</b> folder.</li><li>Find the file <b>db.json</b>. Copy it to your phone if you are on the phone (WhatsApp to yourself, Google Drive or a cable).</li><li>Press <b>Choose db.json</b> below and pick it. Only the keys and account logins are sent; videos and history stay on the laptop.</li><li>Afterwards, close the laptop version. X logins work in one place only.</li></ol>
    <div class="btn-row"><label class="btn primary sm">${icon('upload')}Choose db.json<input type="file" id="import-file" accept=".json,application/json" hidden></label>
      <a class="btn sm" href="/api/export" download>${icon('copy')}Download backup</a></div>
    <p class="muted small">The backup file holds your keys and logins for this cloud studio. Keep it private; you can bring it back here the same way.</p></section>
  <section class="panel"><div class="panel-head"><div><h2>Logo</h2><p>Shows in the menu. A square PNG works best.</p></div></div>
    <div class="btn-row">${brandMark()}<label class="btn sm">${icon('upload')}Choose logo<input type="file" id="logo" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>${s.logo ? '<button class="btn sm quiet" data-logo-clear>Remove</button>' : ''}</div></section>
  <section class="panel"><div class="panel-head"><h2>Sign-in return address</h2></div>
    <p class="muted small">LinkedIn and X send you back here after you sign in. It must be in both apps exactly like this:</p>
    <div class="copyline"><code>${esc(cb)}</code><button class="btn sm" data-copy="${esc(cb)}">${icon('copy')}Copy</button></div></section>
  <p class="muted small">KMR Studio ${esc(S.st.version)} · runs on Vercel (free) · videos are deleted from storage once they are posted.</p>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t || S.page !== 'settings') return;
  if (t.hasAttribute('data-save')) busy(t, async () => {
    const patch = {};
    $$('[data-key]', t.closest('.panel')).forEach(i => { if (i.type === 'checkbox') { patch[i.dataset.key] = i.checked; return; } if (i.value !== '' || !/secret|key$/.test(i.dataset.key) || i.dataset.key === 'yt_privacy') patch[i.dataset.key] = i.value; });
    for (const k of Object.keys(patch)) if (/(_secret|_key)$/.test(k) && patch[k] === '') delete patch[k];
    S.st.settings = (await api('/settings', { body: patch })).settings; rerenderMain(); toast('Saved.');
  });
  if (t.dataset.tg) busy(t, async () => {
    const k = t.dataset.tg;
    if (k === 'connect') { const r = await api('/telegram/connect', { body: { token: ($('#tg-token').value || '').trim() || undefined } }); S.tgLink = r.link; S.st = await api('/state'); rerenderMain(); toast(`Bot @${r.bot} is ready. Now press Open Telegram and tap Start.`); }
    if (k === 'check') { S.st = await api('/state'); if (S.st.settings.telegram_chat_id) { S.tgLink = null; toast('Telegram is connected.'); } else toast('Not yet. In Telegram, tap Start in the chat with your bot, then press this again.', true); rerenderMain(); }
    if (k === 'test') toast((await api('/telegram/test', { body: {} })).message);
    if (k === 'disconnect' && confirm('Disconnect Telegram?')) { await api('/telegram/disconnect', { body: {} }); S.st = await api('/state'); rerenderMain(); }
  });
  if (t.dataset.copy) navigator.clipboard.writeText(t.dataset.copy).then(() => toast('Copied.'), () => toast('Select the text and copy it.', true));
  if (t.hasAttribute('data-logo-clear')) busy(t, async () => { S.st.settings = (await api('/settings', { body: { logo: '' } })).settings; render(); });
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'import-file' || !e.target.files[0]) return;
  const f = e.target.files[0]; e.target.value = '';
  try {
    let db;
    try { db = JSON.parse(await f.text()); } catch { throw new Error('This file could not be read. Choose db.json from the data folder of KMR Studio on the laptop.'); }
    const s = db.settings || {};
    const keep = ['yt_client_id', 'yt_client_secret', 'meta_app_id', 'meta_app_secret', 'li_client_id', 'li_client_secret', 'x_client_id', 'x_client_secret', 'gemini_key', 'groq_key', 'telegram_token', 'telegram_chat_id', 'yt_privacy', 'x_post_limit', 'meta_graph_version', 'text_language', 'auto_text', 'auto_thumb', 'default_targets',
      'yt_refresh_token', 'yt_channel', 'meta_user_token', 'meta_page_id', 'meta_page_name', 'meta_page_token', 'meta_ig_id', 'meta_ig_username', 'meta_pages'];
    const data = { settings: Object.fromEntries(keep.filter(k => s[k] !== undefined).map(k => [k, s[k]])), profiles: Array.isArray(db.profiles) ? db.profiles.map(p => ({ id: p.id, name: p.name, yt: p.yt, meta: p.meta, li: p.li, x: p.x })) : null };
    if (!confirm('Copy the keys and connected accounts from this file into the cloud studio? Accounts with the same profile are replaced.')) return;
    const r = await api('/import', { body: { data } });
    S.st = await api('/state'); S.targets = new Set((S.st.settings.default_targets || []).filter(isConnected));
    render();
    toast(`Done: ${r.keys} keys and ${r.accounts} accounts copied (${r.profiles.join(', ')}).${r.telegram === 'connected' ? ' Telegram is connected.' : r.telegram === 'needs start' ? ' For Telegram, press Connect in Settings, Telegram.' : ''} Press Check on an account in Profiles to test it.`);
  } catch (err) { toast(err.message, true); }
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'logo' || !e.target.files[0]) return;
  const f = e.target.files[0];
  if (f.size > 2 * 1024 * 1024) return toast('Use a logo smaller than 2 MB.', true);
  try {
    const pathname = 'up/logo-' + Date.now().toString(36) + '-' + safeName(f.name);
    let p = pathname;
    if (S.st.upload === 'direct') { const r = await fetch('/__blob/' + pathname, { method: 'PUT', body: f }); if (!r.ok) throw new Error('Upload failed'); }
    else p = (await window.KMRBlob.uploadPresigned(pathname, f, { access: 'private', handleUploadUrl: '/api/upload', contentType: f.type })).pathname;
    S.st.settings = (await api('/settings', { body: { logo: p } })).settings; render(); toast('Logo saved.');
  } catch (err) { toast(err.message, true); }
});

const PAGES = { post: pagePost, history: pageHistory, profiles: pageProfiles, settings: pageSettings };
boot();
})();
