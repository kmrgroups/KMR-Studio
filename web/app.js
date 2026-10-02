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
const PL = [['youtube', 'YouTube', '▶'], ['instagram', 'Instagram', 'IG'], ['facebook', 'Facebook', 'f'], ['linkedin', 'LinkedIn', 'in'], ['x', 'X', '𝕏'], ['whatsapp', 'WhatsApp Status', 'WA']];
const plName = k => (PL.find(p => p[0] === k) || [k, k])[1];
const plBadge = k => `<span class="pl ${k}" aria-hidden="true">${(PL.find(p => p[0] === k) || ['', '', '?'])[2]}</span>`;
const fmtDur = s => { s = Math.round(s || 0); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : s + 's'; };
const fmtSize = b => b > 1048576 ? (b / 1048576).toFixed(b > 104857600 ? 0 : 1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
const ago = t => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; const h = Math.round(m / 60); if (h < 24) return h + ' h ago'; return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };

const S = { st: null, page: 'post', clips: [], mode: 'join', ratio: 'auto', fit: 'blur', text: { title: '', description: '', hashtags: '', link: '' }, waFiles: {}, targets: null, jobs: [], open: {}, yt: {}, busy: false, ai: freshAi() };
function freshAi() { return { state: 'idle', key: '', warn: '', thumbs: [], picks: [], thumb_text: '', sel: 0, own: null }; }
let seq = 0;

async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: {}, credentials: 'same-origin' };
  if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
  const r = await fetch('/api' + path, init);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { await boot(); throw new Error(j.error || 'Please sign in again.'); }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong (' + r.status + ')'), { data: j });
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
  S.page = ['setup', 'post', 'autopilot', 'history', 'profiles', 'settings'].includes(page) ? page : 'post';
  render();
  if (S.page === 'history') loadJobs();
  if (S.page === 'autopilot') loadAuto();
  if (S.page === 'setup') loadSetup();
}
window.addEventListener('hashchange', () => S.st?.authed && route());

function activeCount() { return S.jobs.filter(j => j.status === 'making' || j.status === 'preparing' || j.status === 'posting' || j.status === 'review').length; }
function render() {
  const nav = [['setup', 'Setup', 'check'], ['post', 'Post', 'upload'], ['autopilot', 'Autopilot', 'spark'], ['history', 'History', 'clock'], ['profiles', 'Profiles', 'users'], ['settings', 'Settings', 'gear']];
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
  ${(() => { const [d, t] = setupScore(); return d < t ? `<div class="banner"><span>Setup: <b>${d} of ${t}</b> steps done. The Setup page walks you through the rest.</span><a class="btn primary sm" href="#setup">Open Setup</a></div>` : ''; })()}
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
      ${waTicked() ? `<label class="field wide"><span class="label">Link for WhatsApp Status (tappable in the caption)</span><input id="t-link" inputmode="url" value="${esc(S.text.link)}" placeholder="${esc(waDefaultLink() || 'https://kmr-groups.com')}"><span class="muted small">Leave empty to use the profile's own link.</span></label>` : ''}
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
const waTicked = () => [...S.targets].some(t => /:whatsapp$/.test(t) && isConnected(t));
const waProfile = id => (S.st.profiles || []).find(p => p.id === id);
const waDefaultLink = () => { const t = [...S.targets].find(x => /:whatsapp$/.test(x) && isConnected(x)); return t ? (waProfile(t.split(':')[0])?.whatsapp.link || '') : ''; };
function saveText() {
  const t = $('#t-title'), d = $('#t-desc'), h = $('#t-tags'), l = $('#t-link');
  if (t) S.text.title = t.value; if (d) S.text.description = d.value; if (h) S.text.hashtags = h.value; if (l) S.text.link = l.value;
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
    enqueue(c);
  }
  rerenderMain();
}
// Many clips: three uploads at a time, so the phone and the connection are not swamped.
const UPQ = []; let upRun = 0;
function enqueue(c) { UPQ.push(c); pumpUploads(); }
function pumpUploads() {
  while (upRun < 3 && UPQ.length) {
    const c = UPQ.shift(); if (!S.clips.includes(c)) continue;
    upRun++; upload(c).finally(() => { upRun--; pumpUploads(); });
  }
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
    const r = await api('/work', { body: { kind: 'preview', pathnames: previewPaths(), ratio: previewRatio(), hint: S.text.title || '', total: Math.round(readyClips().reduce((a, c) => a + (c.duration || 0), 0)) } });
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
    items: clips.map(c => ({ pathname: c.pathname, name: c.name, size: c.size, title: c.title || '', description: S.text.description, hashtags: S.text.hashtags, link: S.text.link })),
    join: { title: S.text.title, description: S.text.description, hashtags: S.text.hashtags, link: S.text.link, ratio: S.ratio, fit: S.fit, thumb_data: chosenThumb(), hint: S.text.title },
    targets, approve: askFirst()
  };
  if (body.mode === 'each' && clips.length === 1) Object.assign(body.items[0], { title: S.text.title, thumb_data: chosenThumb() });
  const r = await api('/posts', { body });
  api('/settings', { body: { default_targets: targets } }).then(x => S.st.settings = x.settings).catch(() => {});
  S.clips.forEach(c => URL.revokeObjectURL(c.url));
  S.clips = []; S.text = { title: '', description: '', hashtags: '', link: '' }; S.ai = freshAi();
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
const JOB_PILL = { making: ['run', 'Making the video'], preparing: ['run', 'Preparing'], review: ['run', 'Waiting for your OK'], rejected: ['', 'Rejected'], posting: ['run', 'Posting'], done: ['ok', 'Posted'], partial: ['bad', 'Some failed'], failed: ['bad', 'Failed'] };
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
    const st = j.status === 'rejected' || (j.status === 'failed' && !j.video) ? ['bad', 'Not posted'] : j.status === 'review' ? ['', 'Waiting for OK'] : j.status === 'preparing' || j.status === 'making' ? ['', 'Waiting'] : r.status === 'done' ? ['ok', 'Posted'] : r.status === 'failed' ? ['bad', 'Failed'] : r.status === 'running' ? ['run', 'Posting'] : ['', 'Waiting'];
    const msg = r.status === 'done' ? `${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${icon('link')} Open post</a>` : ''}${r.note ? `<div class="muted">${esc(r.note)}</div>` : ''}`
      : r.status === 'failed' ? `<span class="err">${esc(r.error)}</span>` : stale ? '<span class="err">This seems stuck. Press Retry.</span>' : esc(r.msg || '');
    return `<div class="row">${plBadge(pl)}<div class="who"><b>${plName(pl)}</b> <span class="muted">· ${esc(p?.name || pid)}</span><div class="msg">${msg}</div></div>
      <div class="btn-row"><span class="pill ${st[0]}"><i class="dot"></i>${st[1]}</span>${(r.status === 'failed' || stale) && !j.files_removed ? `<button class="btn sm" data-retry="${j.id}" data-t="${t}">${icon('refresh')}Retry</button>` : ''}</div></div>`;
  }).join('');
  const wide = v && v.w > v.h;
  const last = (j.log || []).slice(-1)[0];
  return `<section class="panel"><div class="job">
    ${v && !j.files_removed ? `<video class="thumb ${wide ? 'wide' : ''}" src="/api/preview?p=${encodeURIComponent(v.pathname)}#t=0.5" ${j.thumb ? `poster="/api/preview?p=${encodeURIComponent(j.thumb)}"` : ''} controls preload="none" playsinline></video>` : j.thumb ? `<img class="thumb ${wide ? 'wide' : ''}" src="/api/preview?p=${encodeURIComponent(j.thumb)}" alt="">` : `<div class="thumb ${wide ? 'wide' : ''}">${icon('film')}</div>`}
    <div style="min-width:0">
      <div class="job-head"><div style="min-width:0"><h3>${esc(j.title)}</h3><div class="muted small">${ago(j.created)} · ${j.autopilot ? 'Autopilot' : j.mode === 'join' ? `${j.sources.length} videos joined` : '1 video'}${v ? ` · ${fmtDur(v.duration)} · ${v.w}×${v.h}` : ''}</div></div>
        <div class="btn-row"><span class="pill ${cls}"><i class="dot"></i>${label}</span>
          ${j.status === 'failed' && !j.video && !j.files_removed ? `<button class="btn sm" data-retry="${j.id}">${icon('refresh')}Retry</button>` : ''}
          <button class="btn icon quiet" data-del="${j.id}" aria-label="Delete">${icon('trash')}</button></div></div>
      ${j.status === 'review' ? `<div class="banner" style="margin:10px 0 0"><span>Check the video, title and thumbnail, then approve.${S.st.settings.telegram_chat_id ? ' You can also approve in Telegram.' : ''}</span><div class="btn-row"><button class="btn primary sm" data-approve="${j.id}">${icon('check')}Approve and post</button><button class="btn sm quiet danger" data-reject="${j.id}">Reject</button></div></div>` : ''}
      ${j.error ? `<p class="err small">${esc(j.error)}</p>` : last && (j.status === 'preparing' || j.status === 'making') ? `<p class="small muted">${esc(last.msg)}</p>` : ''}
      <div class="rows">${rows}</div>
      ${v && !j.files_removed && (j.targets || []).some(t => /:whatsapp$/.test(t)) ? `<div class="btn-row" style="margin-top:10px"><button class="btn sm" data-wa-share="${j.id}">${S.waFiles[j.id] ? 'Ready: tap to share to WhatsApp Status' : 'Share to WhatsApp Status'}</button><span class="muted small">Opens your phone's share sheet. Choose WhatsApp, then My status.</span></div>` : ''}
      ${j.files_removed && j.status !== 'done' ? '<p class="muted small">The video file was cleared from storage after 7 days. Upload it again to post it.</p>' : ''}
    </div></div></section>`;
}
function waCaption(j) {
  const p = (j.targets || []).map(t => waProfile(t.split(':')[0])).find(Boolean);
  let link = String(j.link || p?.whatsapp.link || '').trim();
  const tags = (j.hashtags || []).slice(0, 6).join(' ');
  const tail = [tags, link ? '🔗 ' + link : ''].filter(Boolean).join('\n');
  const head = [j.title, j.description].map(x => String(x || '').trim()).filter(Boolean).join('\n\n');
  const room = Math.max(0, 700 - tail.length - (tail ? 2 : 0));
  return [head.length > room ? head.slice(0, Math.max(0, room - 1)).trimEnd() + '…' : head, tail].filter(Boolean).join('\n\n');
}
document.addEventListener('click', e => {
  const ws = e.target.closest('[data-wa-share]');
  if (ws) busy(ws, async () => {
    const j = S.jobs.find(x => x.id === ws.dataset.waShare); if (!j || !j.video) throw new Error('This video is no longer here.');
    const cap = waCaption(j);
    let file = S.waFiles[j.id];
    if (!file) { // first tap: load the video (a share needs a fresh tap, so it opens on the second)
      const r = await fetch('/api/preview?p=' + encodeURIComponent(j.video.pathname));
      if (!r.ok) throw new Error('Could not load the video here. Use the copy that was sent to Telegram.');
      S.waFiles[j.id] = new File([await r.blob()], 'whatsapp-status.mp4', { type: 'video/mp4' });
      toast('Video ready. Tap the button again to share it.'); rerenderMain(); return;
    }
    if (!(navigator.canShare && navigator.canShare({ files: [file] }))) { try { await navigator.clipboard.writeText(cap); } catch {} throw new Error('Sharing a video is not available in this browser. Open KMR Studio on your phone, or use the copy in Telegram. The caption was copied.'); }
    try { await navigator.clipboard.writeText(cap); } catch {}
    try { await navigator.share({ files: [file], text: cap }); toast('In WhatsApp choose My status. The caption is copied: paste it if it is missing.'); }
    catch (err) { if (err.name !== 'AbortError') throw err; }
  });
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
  const metaBody = open ? `<p class="small muted" style="margin-top:0">In <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener">Graph API Explorer</a>: choose your Meta app, add the permissions <code>pages_show_list</code> <code>pages_manage_posts</code> <code>pages_read_engagement</code> <code>instagram_basic</code> <code>instagram_content_publish</code>, press <b>Generate Access Token</b>. In the Facebook window press <b>Edit settings</b> (not Continue), choose <b>Opt in to current Pages only</b> and <b>tick this profile's Page</b> and its Instagram. Copy the token.</p>
    <label class="field"><span class="label">Access token</span><textarea id="tok-${p.id}" rows="3" placeholder="EAA…" spellcheck="false"></textarea></label>
    ${pages.length > 1 ? `<label class="field" style="margin-top:10px"><span class="label">Facebook Page</span><select id="page-${p.id}">${pages.map(x => `<option value="${esc(x.id)}" ${x.name === p.facebook.label ? 'selected' : ''}>${esc(x.name)}${x.ig ? ' (Instagram @' + esc(x.ig) + ')' : ''}</option>`).join('')}</select></label>` : ''}
    <details class="help" ${p.facebook.own_app ? 'open' : ''}><summary>This profile's own Meta app (only if this person made their own app)</summary>
      <p class="muted small">Leave empty to use the Meta app from Settings (${esc(s.meta_app_id || 'not saved yet')}). If the token was made with another app, KMR Studio fills in its ID; you paste its secret: <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a>, open that app, <b>App settings, Basic</b>, <b>App secret: Show</b>, copy.</p>
      <div class="form-grid"><label class="field"><span class="label">App ID</span><input id="mapp-id-${p.id}" value="${esc(p.facebook.own_app || '')}" autocomplete="off"></label><label class="field"><span class="label">App secret${p.facebook.own_app ? ' (saved)' : ''}</span><input id="mapp-sec-${p.id}" placeholder="${p.facebook.own_app ? 'Saved: leave empty to keep it' : ''}" autocomplete="off"></label></div></details>
    <div class="btn-row" style="margin-top:10px"><button class="btn primary sm" data-meta="${p.id}">Connect</button><button class="btn quiet sm" data-open="${p.id}:meta">Cancel</button></div>` : '';
  const metaBtns = (p.facebook.ok ? `<button class="btn sm" data-check="${p.id}:meta">Check</button>` : '') + `<button class="btn sm ${p.facebook.ok ? '' : 'primary'}" data-open="${p.id}:meta" ${s.meta_app_id ? '' : 'disabled title="Save the Meta app keys in Settings first"'}>${p.facebook.ok ? 'Change' : 'Connect'}</button>` + (p.facebook.ok ? `<button class="btn sm quiet danger" data-disc="${p.id}:meta">Disconnect</button>` : '');
  const liExp = p.linkedin.expires_at ? ` · login ends ${new Date(p.linkedin.expires_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : '';
  return `<section class="panel"><div class="panel-head"><div><h2>${esc(p.name)}</h2></div>
    <div class="btn-row"><button class="btn sm quiet" data-rename="${p.id}">Rename</button>${(S.st.profiles.length > 1) ? `<button class="btn sm quiet danger" data-delprof="${p.id}">Delete</button>` : ''}</div></div>
    ${acc('youtube', 'YouTube', status('youtube') + (p.youtube.own_keys ? ' <span class="muted">· uses this profile\'s own Google app</span>' : ''), ytBody, ytBtns + (p.youtube.own_keys && !p.youtube.ok ? `<button class="btn sm quiet" data-own-clear="${p.id}" title="Use the Google app from Settings instead">Use shared keys</button>` : ''))}
    ${acc('instagram', 'Instagram and Facebook', p.facebook.ok ? `<span class="ok">Page: ${esc(p.facebook.label)}</span>${p.instagram.ok ? ` · <span class="ok">Instagram ${esc(p.instagram.label)}</span>` : ' · <span class="err">no Instagram linked to this Page</span>'}` : status('facebook'), metaBody, metaBtns)}
    ${acc('linkedin', 'LinkedIn', status('linkedin') + (p.linkedin.ok ? liExp : ''), '', (p.linkedin.ok ? `<button class="btn sm" data-check="${p.id}:linkedin">Check</button>` : '') + `<button class="btn sm ${p.linkedin.ok ? '' : 'primary'}" data-oauth="${p.id}:linkedin" ${s.li_client_id ? '' : 'disabled title="Save the LinkedIn keys in Settings first"'}>${p.linkedin.ok ? 'Reconnect' : 'Connect'}</button>` + (p.linkedin.ok ? `<button class="btn sm quiet danger" data-disc="${p.id}:linkedin">Disconnect</button>` : ''))}
    ${acc('whatsapp', 'WhatsApp Status', p.whatsapp.ok ? '<span class="ok">On: the video and caption arrive in your Telegram</span>' : status('whatsapp'), `<label class="field"><span class="label">Link to add under every Status (optional)</span><input id="wa-link-${p.id}" inputmode="url" value="${esc(p.whatsapp.link || '')}" placeholder="https://kmr-groups.com" autocomplete="off"></label><p class="muted small" style="margin:6px 0 0">WhatsApp has no official way to post a Status automatically. KMR Studio sends the finished video and a ready caption to your Telegram, and you share it to My status in two taps.</p>`, p.whatsapp.ok ? `<button class="btn sm primary" data-wa="${p.id}">Save link</button><button class="btn sm" data-check="${p.id}:whatsapp">Check</button><button class="btn sm quiet danger" data-disc="${p.id}:whatsapp">Turn off</button>` : `<button class="btn sm primary" data-wa="${p.id}">Turn on</button>`)}
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
  if (d.meta) busy(t, async () => { const tok = $('#tok-' + d.meta).value.trim(); const pg = $('#page-' + d.meta); const oid = $('#mapp-id-' + d.meta), osec = $('#mapp-sec-' + d.meta); let r;
    try { r = await api(`/profiles/${d.meta}/meta/connect`, { body: { user_token: tok, page_id: pg ? pg.value : undefined, own_app_id: oid ? oid.value.trim() : undefined, own_app_secret: osec && osec.value.trim() ? osec.value.trim() : undefined } }); }
    catch (err) {
      const need = err.data && err.data.need_app;
      if (need && oid) { // the token came from another Meta app: open its box with the ID filled in, ask only for the secret
        oid.value = need.id; oid.closest('details').open = true;
        if (osec) { osec.value = ''; osec.placeholder = `App secret of ${need.name}`; osec.focus(); }
        S.metaNeed = { pid: d.meta, id: need.id, name: need.name };
      }
      throw err;
    } S.open[d.meta + ':meta'] = false; await refreshState(); rerenderMain(); toast(r.message); });
  if (d.wa) busy(t, async () => { const r = await api(`/profiles/${d.wa}/whatsapp/save`, { body: { link: $('#wa-link-' + d.wa).value } }); await refreshState(); rerenderMain(); toast(r.message); });
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
  <details class="panel" id="upd" ${S.upd ? 'open' : ''}><summary style="cursor:pointer;list-style:none"><div class="panel-head" style="margin:0"><div><h2>Update KMR Studio</h2><p>Upload a new version as a zip file. It is sent to GitHub and goes live by itself.</p></div><span class="pill ${s.github_key ? 'ok' : ''}"><i class="dot"></i>${s.github_key ? 'GitHub saved' : 'Set up once'}</span></div></summary>
    <p class="muted small">This studio runs on Vercel, which cannot change its own files. So the zip is saved into your GitHub repository, and Vercel publishes it in about one to two minutes. Only the studio's own files (api, cloud, web, package.json…) are accepted, and every file is checked for errors first; if one is broken, nothing is changed.</p>
    <ol class="steps small"><li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com/settings/personal-access-tokens/new</a>. Name it <b>KMR Studio update</b>, choose an expiry, <b>Only select repositories</b>, pick your KMR-Studio repository.</li><li>Under <b>Repository permissions</b> set <b>Contents</b> to <b>Read and write</b>. Press <b>Generate token</b> and copy it.</li><li>Paste it below, press <b>Save</b>, then <b>Check GitHub</b>.</li></ol>
    <div class="form-grid">${f('github_key', 'GitHub token', true, 'github_pat_…')}${f('github_repo', 'Repository', false, 'kmrgroups/KMR-Studio')}${f('github_branch', 'Branch', false, 'main')}</div>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-save>Save</button><button class="btn sm" data-up="check">Check GitHub</button></div>
    <div class="btn-row" style="margin-top:16px"><label class="btn primary ${s.github_key ? '' : 'quiet'}">${icon('upload')}Choose the update zip<input type="file" id="update-file" accept=".zip,application/zip" hidden ${s.github_key ? '' : 'disabled'}></label><span class="muted small">Now on version <b>${esc(S.st.version)}</b>.${s.github_key ? '' : ' Save the GitHub token first.'}</span></div>
    ${S.upd ? `<div class="ai-note ${S.upd.err ? 'warn' : ''}">${S.upd.wait ? '<span class="spin"></span> ' : ''}${esc(S.upd.msg)}</div>` : ''}
    <p class="muted small">Anyone who can sign in to this studio can send an update, so keep the password private. Files that are not in the zip stay as they are, and files cannot be deleted this way.</p></details>
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
  const t = e.target.closest('button'); if (!t || !['settings', 'setup'].includes(S.page)) return;
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
  if (t.dataset.up === 'check') busy(t, async () => { S.upd = null; toast((await api('/update/check', { body: {} })).message); });
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
    const keep = ['yt_client_id', 'yt_client_secret', 'meta_app_id', 'meta_app_secret', 'li_client_id', 'li_client_secret', 'x_client_id', 'x_client_secret', 'gemini_key', 'groq_key', 'telegram_token', 'telegram_chat_id', 'yt_privacy', 'x_post_limit', 'meta_graph_version', 'text_language', 'auto_text', 'auto_thumb', 'default_targets', 'veo_key_1', 'veo_key_2', 'veo_limit',
      'yt_refresh_token', 'yt_channel', 'meta_user_token', 'meta_page_id', 'meta_page_name', 'meta_page_token', 'meta_ig_id', 'meta_ig_username', 'meta_pages'];
    const data = { settings: Object.fromEntries(keep.filter(k => s[k] !== undefined).map(k => [k, s[k]])), profiles: Array.isArray(db.profiles) ? db.profiles.map(p => ({ id: p.id, name: p.name, yt: p.yt, meta: p.meta, li: p.li, x: p.x, mapp: p.mapp })) : null, schedules: Array.isArray(db.schedules) ? db.schedules : null };
    if (!confirm('Copy the keys and connected accounts from this file into the cloud studio? Accounts with the same profile are replaced.')) return;
    const r = await api('/import', { body: { data } });
    S.st = await api('/state'); S.targets = new Set((S.st.settings.default_targets || []).filter(isConnected));
    render();
    toast(`Done: ${r.keys} keys and ${r.accounts} accounts copied (${r.profiles.join(', ')}).${r.telegram === 'connected' ? ' Telegram is connected.' : r.telegram === 'needs start' ? ' For Telegram, press Connect in Settings, Telegram.' : ''} Press Check on an account in Profiles to test it.`);
  } catch (err) { toast(err.message, true); }
});
document.addEventListener('change', async e => {
  if (e.target.id !== 'update-file' || !e.target.files[0]) return;
  const f = e.target.files[0]; e.target.value = '';
  if (!/\.zip$/i.test(f.name)) return toast('Choose a .zip file.', true);
  if (f.size > 15 * 1024 * 1024) return toast('This zip is larger than 15 MB. Send only the changed files.', true);
  if (!confirm(`Send "${f.name}" to GitHub as an update? The studio restarts on the new version in a minute or two.`)) return;
  const from = S.st.version;
  const show = (msg, o = {}) => { S.upd = { msg, ...o }; if (S.page === 'settings') rerenderMain(); };
  try {
    show('Uploading the zip…', { wait: true });
    const pathname = 'up/update-' + Date.now().toString(36) + '.zip';
    if (S.st.upload === 'direct') { const r = await fetch('/__blob/' + pathname, { method: 'PUT', body: f }); if (!r.ok) throw new Error('Upload failed'); }
    else await window.KMRBlob.uploadPresigned(pathname, f, { access: 'private', handleUploadUrl: '/api/upload', contentType: 'application/zip' });
    show('Checking the files and sending them to GitHub…', { wait: true });
    const r = await api('/update', { body: { pathname } });
    if (!r.changed) return show('Already up to date: every file in this zip is the same as in GitHub. Nothing was changed.');
    const names = r.files.slice(0, 6).join(', ') + (r.files.length > 6 ? ` and ${r.files.length - 6} more` : '');
    if (!(r.version && r.version !== from)) return show(`Sent ${r.changed} file${r.changed > 1 ? 's' : ''} to GitHub (${names}). Vercel is publishing it now. Reload this page in a minute or two.`);
    show(`Sent ${r.changed} file${r.changed > 1 ? 's' : ''} to GitHub (${names}). Vercel is publishing version ${r.version}. This page reloads by itself when it is live.`, { wait: true });
    const started = Date.now();
    const tick = async () => {
      if (Date.now() - started > 8 * 60000) return show('Still publishing. Reload this page in a minute. If the version does not change, open your project in Vercel, Deployments, and look for an error.', { err: true });
      try { const s = await fetch('/api/state', { cache: 'no-store' }).then(x => x.json()); if (s.version && s.version !== from) { toast('Updated to version ' + s.version + '.'); return setTimeout(() => location.reload(), 800); } } catch {}
      setTimeout(tick, 8000);
    };
    setTimeout(tick, 15000);
  } catch (err) { show(err.message, { err: true }); toast(err.message, true); }
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

// ---------- Autopilot ----------
const DAYN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
async function loadAuto() {
  try { S.auto = await api('/autopilot'); } catch (e) { toast(e.message, true); S.auto = S.auto || { schedules: [], credit: [] }; }
  if (S.page === 'autopilot') rerenderMain();
}
function pageAutopilot() {
  const a = S.auto, s = S.st.settings;
  if (!a) return '<div class="panel empty"><span class="spin"></span></div>';
  const credit = a.credit || [];
  const keyf = (k, label) => `<label class="field"><span class="label">${label}${s[k] ? ' (saved)' : ''}</span><input data-apkey="${k}" placeholder="${s[k] ? 'Saved: leave empty to keep it' : 'AIza…'}" autocomplete="off" spellcheck="false"></label>`;
  const days = d => d.length === 7 ? 'Every day' : d.map(x => DAYN[x]).join(', ');
  const card = x => {
    const n = x.targets.filter(isConnected).length;
    return `<section class="panel"><div class="job-head"><div style="min-width:0"><h3>${esc(x.name)}</h3>
      <div class="muted small">${days(x.days)} at ${x.times.join(', ')} · ${x.seconds}s · ${esc(x.language)} · ${x.voice === 'male' ? 'male' : 'female'} voice · ${n} account${n === 1 ? '' : 's'}${x.approve ? ' · asks you first' : ''}${x.engine === 'free' ? ' · free pictures' : ''}</div></div>
      <span class="pill ${x.enabled ? 'ok' : ''}"><i class="dot"></i>${x.enabled ? 'On' : 'Off'}</span></div>
      ${n ? '' : '<p class="err small">No connected account is ticked. Press Edit and tick where to post.</p>'}
      <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-ap-run="${x.id}">${icon('spark')}Make one now</button><button class="btn sm" data-ap-edit="${x.id}">Edit</button>
        <button class="btn sm quiet" data-ap-toggle="${x.id}">${x.enabled ? 'Turn off' : 'Turn on'}</button><button class="btn icon quiet" data-ap-del="${x.id}" aria-label="Delete">${icon('trash')}</button></div></section>`;
  };
  return `<div class="page-head"><div><p class="eyebrow">Autopilot</p><h1>Videos made for you</h1><p>At the time you choose, KMR Studio writes the script, makes the video with voice and subtitles, and sends it to your Telegram. You press Approve, and it posts.</p></div>
    ${S.apEdit ? '' : `<button class="btn primary" data-ap-new>${icon('plus')}New autopilot</button>`}</div>
    ${S.apEdit ? apForm(S.apEdit) : ''}
    ${S.apEdit ? '' : a.schedules.length ? a.schedules.map(card).join('') : `<div class="panel empty"><p>No autopilot yet.</p><button class="btn primary" data-ap-new>${icon('plus')}New autopilot</button></div>`}
    <details class="panel" ${credit.length ? '' : 'open'}><summary style="cursor:pointer;list-style:none"><div class="panel-head" style="margin:0"><h2>Video credit (Google AI Pro)</h2><span class="pill ${credit.length ? 'ok' : ''}"><i class="dot"></i>${credit.length ? credit.map(c => `Key ${c.n}: $${c.spent.toFixed(2)} of $${c.limit}`).join(' · ') : 'Not added'}</span></div></summary>
      <p class="muted small">With a key, videos are made with Google Veo (real video clips), paid by the US$10 monthly credit of Google AI Pro. Without a key, or when the credit is used up, Autopilot makes the video free with AI pictures. One 30-second video uses about US$1.60.</p>
      <ol class="steps small"><li>On each Pro account, open <a href="https://developers.google.com/profile/benefits" target="_blank" rel="noopener">developers.google.com/profile/benefits</a> and press <b>Activate</b> on the Google Cloud credit.</li><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> with the same account, <b>Create API key</b>, and choose the project that has the credit (billing on).</li><li>Paste the key here and press <b>Save</b>, then <b>Test</b>.</li></ol>
      <div class="form-grid">${keyf('veo_key_1', 'Pro account 1 key')}${keyf('veo_key_2', 'Pro account 2 key')}
        <label class="field"><span class="label">Stop at (US$ per key per month)</span><input data-apkey="veo_limit" type="number" min="1" max="100" step="1" value="${esc(s.veo_limit || 9)}"></label></div>
      <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-ap-savekeys>Save</button>${credit.length ? '<button class="btn sm" data-ap-test>Test</button>' : ''}</div></details>`;
}
function apForm(x) {
  const profs = S.st.profiles || [];
  const sel = (k, opts) => `<select data-apf="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(x[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const chips = profs.map(p => `<div class="tprof"><div class="tprof-head"><b>${esc(p.name)}</b></div><div class="tchips">${PL.map(([k, l]) => {
    const t = `${p.id}:${k}`;
    return p[k].ok ? `<label class="tchip ${x.targets.includes(t) ? 'on' : ''}"><input type="checkbox" data-aptarget="${t}" ${x.targets.includes(t) ? 'checked' : ''}><span class="box"></span>${plBadge(k)}${l}</label>` : '';
  }).join('') || '<a class="tchip off" href="#profiles">Nothing connected <small>connect</small></a>'}</div></div>`).join('');
  return `<section class="panel"><div class="panel-head"><h2>${x.id ? 'Edit autopilot' : 'New autopilot'}</h2></div>
    <div class="form-grid">
      <label class="field wide"><span class="label">Name</span><input data-apf="name" maxlength="60" value="${esc(x.name)}" placeholder="Daily Tamil facts"></label>
      <label class="field wide"><span class="label">What are the videos about?</span><textarea data-apf="about" maxlength="600" placeholder="Amazing science facts for Tamil families, simple and fun">${esc(x.about)}</textarea></label>
      <label class="field wide"><span class="label">Topics, one per line (optional: used in order; empty = AI picks a new topic each time)</span><textarea data-apf="topics" placeholder="Why the sky is blue&#10;How bees make honey">${esc(x.topics)}</textarea></label>
      <label class="field"><span class="label">Language</span>${sel('language', ['English', 'Tamil', 'Tamil and English mixed', 'Hindi'].map(l => [l, l]))}</label>
      <label class="field"><span class="label">Voice</span>${sel('voice', [['female', 'Female'], ['male', 'Male']])}</label>
      <label class="field"><span class="label">Length</span>${sel('seconds', [[15, '15 seconds'], [30, '30 seconds'], [45, '45 seconds'], [60, '1 minute']])}</label>
      <label class="field"><span class="label">Shape</span>${sel('ratio', [['9:16', 'Tall (Reels, Shorts)'], ['16:9', 'Wide (YouTube)']])}</label>
      <label class="field"><span class="label">Time (India time; more than one: 09:00, 19:00)</span><input data-apf="times" value="${esc(x.times.join(', '))}" placeholder="19:00"></label>
      <label class="field"><span class="label">Video</span>${sel('engine', [['auto', 'Veo clips while credit lasts, then free pictures'], ['free', 'Always free AI pictures']])}</label>
      <div class="field wide"><span class="label">Days</span><div class="tchips">${DAYN.map((d, i) => `<label class="tchip ${x.days.includes(i) ? 'on' : ''}"><input type="checkbox" data-apday="${i}" ${x.days.includes(i) ? 'checked' : ''}><span class="box"></span>${d}</label>`).join('')}</div></div>
      <div class="field wide"><span class="label">Post to</span>${chips}</div>
      <label class="check-row wide"><input type="checkbox" data-apf="approve" ${x.approve ? 'checked' : ''}> Ask me before posting (Telegram Approve button)</label>
    </div>
    <div class="btn-row" style="margin-top:14px"><button class="btn primary" data-ap-save>Save</button><button class="btn quiet" data-ap-cancel>Cancel</button></div></section>`;
}
function readApForm() {
  const x = { ...S.apEdit };
  $$('[data-apf]').forEach(i => { x[i.dataset.apf] = i.type === 'checkbox' ? i.checked : i.value; });
  x.days = $$('[data-apday]').filter(i => i.checked).map(i => Number(i.dataset.apday));
  x.targets = $$('[data-aptarget]').filter(i => i.checked).map(i => i.dataset.aptarget);
  x.times = String(x.times || '').split(/[\s,]+/).filter(Boolean);
  return x;
}
document.addEventListener('change', e => {
  if (S.page !== 'autopilot') return;
  const c = e.target.closest('[data-apday], [data-aptarget]');
  if (c) c.closest('.tchip').classList.toggle('on', c.checked);
});
document.addEventListener('click', e => {
  if (S.page !== 'autopilot') return;
  const t = e.target.closest('button'); if (!t) return;
  const list = S.auto?.schedules || [];
  if (t.hasAttribute('data-ap-new')) { S.apEdit = { name: '', about: '', topics: '', language: S.st.settings.text_language || 'English', voice: 'female', seconds: 30, ratio: '9:16', times: ['19:00'], days: [0, 1, 2, 3, 4, 5, 6], targets: (S.st.settings.default_targets || []).filter(isConnected), approve: true, engine: 'auto' }; rerenderMain(); scrollTo(0, 0); }
  if (t.dataset.apEdit) { S.apEdit = JSON.parse(JSON.stringify(list.find(x => x.id === t.dataset.apEdit))); rerenderMain(); scrollTo(0, 0); }
  if (t.hasAttribute('data-ap-cancel')) { S.apEdit = null; rerenderMain(); }
  if (t.hasAttribute('data-ap-save')) busy(t, async () => { await api('/autopilot', { body: readApForm() }); S.apEdit = null; toast('Saved.'); await loadAuto(); });
  if (t.dataset.apToggle) busy(t, async () => { const x = list.find(y => y.id === t.dataset.apToggle); await api('/autopilot', { body: { ...x, enabled: !x.enabled } }); await loadAuto(); });
  if (t.dataset.apDel && confirm('Delete this autopilot?')) busy(t, async () => { await api('/autopilot/' + t.dataset.apDel, { method: 'DELETE' }); await loadAuto(); });
  if (t.dataset.apRun) busy(t, async () => { await api(`/autopilot/${t.dataset.apRun}/run`, { body: {} }); toast('Started. It takes a few minutes; you will get it on Telegram. Progress is in History.'); });
  if (t.hasAttribute('data-ap-savekeys')) busy(t, async () => {
    const patch = {};
    $$('[data-apkey]').forEach(i => { if (i.value.trim()) patch[i.dataset.apkey] = i.dataset.apkey === 'veo_limit' ? Number(i.value) : i.value.trim(); });
    S.st.settings = (await api('/settings', { body: patch })).settings; toast('Saved.'); await loadAuto();
  });
  if (t.hasAttribute('data-ap-test')) busy(t, async () => toast((await api('/veo/test', { body: {} })).message));
});

// ---------- Setup: every setting in one guided list ----------
function setupScore() {
  const s = S.st.settings, profs = S.st.profiles || [];
  const checks = [!!s.telegram_chat_id, !!s.gemini_key, !!s.yt_client_id, !!s.meta_app_id, profs.some(p => PL.some(([k]) => p[k].ok))];
  return [checks.filter(Boolean).length, checks.length];
}
async function loadSetup() {
  try { S.setup = await api('/setup'); } catch (e) { S.setup = { telegram: { state: 'error', error: e.message } }; }
  if (S.page === 'setup') rerenderMain();
}
function pageSetup() {
  const s = S.st.settings, profs = S.st.profiles || [], h = S.setup || {}, tg = h.telegram || {};
  const cb = S.st.callback;
  const f = (k, label, secret, ph) => `<label class="field"><span class="label">${label}${secret && s[k] ? ' (saved)' : ''}</span><input data-key="${k}" value="${secret ? '' : esc(s[k] || '')}" placeholder="${secret && s[k] ? 'Saved: leave empty to keep it' : esc(ph || '')}" autocomplete="off" spellcheck="false"></label>`;
  const save = '<div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-save>Save</button></div>';
  const pill = st => st === 'ok' ? '<span class="pill ok"><i class="dot"></i>Done</span>' : st === 'bad' ? '<span class="pill bad"><i class="dot"></i>Needs fixing</span>' : st === 'opt' ? '<span class="pill"><i class="dot"></i>Optional</span>' : '<span class="pill run"><i class="dot"></i>To do</span>';
  let n = 0;
  const step = (st, title, why, body) => `<details class="panel setup-step" ${st === 'ok' || st === 'opt' ? '' : 'open'}><summary><span class="step-no">${++n}</span><span class="setup-title"><b>${title}</b><span class="muted small">${why}</span></span>${pill(st)}</summary><div class="setup-body">${body}</div></details>`;
  const link = (u, t) => `<a href="${u}" target="_blank" rel="noopener">${t || u.replace(/^https:\/\//, '')}</a>`;

  const laptop = tg.state === 'laptop' || tg.state === 'laptop-recent';
  const tgState = !S.setup ? 'todo' : tg.state === 'ok' ? 'ok' : laptop || tg.state === 'error' ? 'bad' : 'todo';
  const accCount = profs.reduce((a, p) => a + PL.filter(([k]) => p[k].ok).length, 0);
  const credit = h.credit || [];

  return `<div class="page-head"><div><p class="eyebrow">Setup</p><h1>Set up KMR Studio</h1><p>Go from top to bottom. Each step says <b>what it is for</b> and <b>exactly what to click</b>. Green "Done" means you never need to touch it again.</p></div>
    <button class="btn sm" data-setup-reload>${icon('refresh')}Check again</button></div>

  ${step(laptop ? 'bad' : 'ok', 'Close the old laptop program', laptop ? 'It is still running and steals your Telegram buttons ("Video not found").' : 'KMR Studio now runs online. The old laptop program must stay closed.', `
    <p>KMR Studio works fully online now, even when the laptop is off. The old program on the laptop uses the same Telegram bot, so when it runs, your Approve button goes to the laptop and says <b>"Video not found"</b>.</p>
    <ol class="steps"><li>On the laptop, close the black <b>KMR Studio</b> (or <b>Lumen Studio</b>) window.</li>
      <li>Press <b>Ctrl + Shift + Esc</b> (Task Manager). If you see <b>Node.js JavaScript Runtime</b>, click it and press <b>End task</b>.</li>
      <li>Stop it starting again: press <b>Windows + R</b>, type <code>shell:startup</code>, press Enter, and delete any <b>KMR Studio</b> or <b>Lumen Studio</b> shortcut in that folder.</li>
      <li>Come back here and press <b>Check again</b> (top right). This step turns green.</li></ol>`)}

  ${step(tgState, 'Telegram: approve from your phone', 'Every new video comes to your phone with Approve and Reject buttons.', `
    ${tg.state === 'error' ? `<p class="err small">${esc(tg.error)}</p>` : ''}
    <ol class="steps"><li>In Telegram, open <b>@BotFather</b>, send <code>/newbot</code>, give it any name, and copy the <b>token</b> it sends (looks like <code>123456:AA…</code>). Already have a bot? Skip this.</li>
      <li>Paste the token below and press <b>Connect</b>.</li>
      <li>Press <b>Open Telegram and tap Start</b>. In the chat that opens, tap <b>Start</b>. Then press <b>I tapped Start</b>.</li>
      <li>Press <b>Send a test</b> and tap the button in Telegram. It must answer <b>"Buttons work"</b>.</li></ol>
    <div class="form-grid"><label class="field"><span class="label">Bot token${s.telegram_token ? ' (saved' + (tg.bot ? ': @' + esc(tg.bot) : '') + ')' : ''}</span><input id="tg-token" placeholder="${s.telegram_token ? 'Saved: leave empty to keep it' : '123456789:AA…'}" autocomplete="off" spellcheck="false"></label></div>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-tg="connect">${s.telegram_chat_id ? 'Connect again' : 'Connect'}</button>${S.tgLink ? `<a class="btn sm" href="${esc(S.tgLink)}" target="_blank" rel="noopener">Open Telegram and tap Start</a><button class="btn sm quiet" data-tg="check">I tapped Start</button>` : ''}${s.telegram_chat_id ? '<button class="btn sm" data-tg="test">Send a test</button>' : ''}</div>
    <label class="check-row" style="margin-top:14px"><input type="checkbox" data-key="approve_default" ${s.approve_default !== false ? 'checked' : ''}> Ask me before posting (recommended)</label>
    <div class="btn-row" style="margin-top:10px"><button class="btn sm" data-save>Save</button></div>`)}

  ${step(s.gemini_key ? 'ok' : 'todo', 'AI writer (free)', 'Writes titles, captions, hashtags, thumbnails and Autopilot scripts.', `
    <ol class="steps"><li>Open ${link('https://aistudio.google.com/apikey')} with your Gmail.</li><li>Press <b>Create API key</b>, then <b>Copy</b>.</li><li>Paste it below as <b>Gemini key</b> and press <b>Save</b>.</li>
      <li>Backup (optional, free): ${link('https://console.groq.com/keys')}, <b>Create API Key</b>, paste as <b>Groq key</b>. It takes over when Gemini is busy.</li></ol>
    <div class="form-grid">${f('gemini_key', 'Gemini key', true, 'AIza…')}${f('groq_key', 'Groq key (backup)', true, 'gsk_…')}</div>${save}`)}

  ${step(s.yt_client_id && s.yt_client_secret ? 'ok' : 'todo', 'YouTube: Google app (once)', 'One Google app lets every profile connect its own channel.', `
    <ol class="steps"><li>Open ${link('https://console.cloud.google.com/')} with <b>your</b> Gmail. Make a project (top left, <b>New project</b>).</li>
      <li>Search <b>YouTube Data API v3</b>, open it, press <b>Enable</b>.</li>
      <li>Open ${link('https://console.cloud.google.com/auth/overview', 'Google Auth Platform')}: press <b>Get started</b>, app name <b>KMR Studio</b>, your email, <b>External</b>, finish.</li>
      <li><b>Clients</b>, <b>Create client</b>, type <b>TVs and Limited Input devices</b>, <b>Create</b>. Copy the <b>Client ID</b> and <b>Client secret</b> below and press <b>Save</b>.</li>
      <li><b>Important:</b> ${link('https://console.cloud.google.com/auth/audience', 'Audience')}, <b>Test users</b>, <b>Add users</b>: add <b>every Gmail whose YouTube channel you will connect</b> (yours, Rithanya's…). Otherwise Google says "Access blocked".</li></ol>
    <div class="form-grid">${f('yt_client_id', 'Client ID', false, '…apps.googleusercontent.com')}${f('yt_client_secret', 'Client secret', true, 'GOCSPX-…')}</div>${save}`)}

  ${step(s.meta_app_id && s.meta_app_secret ? 'ok' : 'todo', 'Facebook and Instagram: Meta app (once)', 'Lets KMR Studio post Reels to Facebook Pages and Instagram.', `
    <ol class="steps"><li>Open ${link('https://developers.facebook.com/apps')}, <b>Create app</b>, choose <b>Other</b>, then <b>Business</b>, name it <b>KMR Studio</b>.</li>
      <li>In the app: <b>App settings</b>, <b>Basic</b>. Copy the <b>App ID</b>, press <b>Show</b> next to App secret and copy it. Paste both below and press <b>Save</b>.</li>
      <li>Each Instagram must be a <b>Professional</b> account linked to a <b>Facebook Page</b> (Page settings, Linked accounts, Instagram).</li></ol>
    <div class="form-grid">${f('meta_app_id', 'App ID', false, '1234567890')}${f('meta_app_secret', 'App secret', true)}</div>${save}`)}

  ${step(accCount ? 'ok' : 'todo', 'Profiles: connect each channel and page', `${profs.length} profile${profs.length === 1 ? '' : 's'}, ${accCount} account${accCount === 1 ? '' : 's'} connected.`, `
    <p>A <b>profile</b> is one person or brand (for example <b>Me</b> and <b>Rithanya Mithra</b>). Each profile connects <b>its own</b> YouTube, Facebook and Instagram.</p>
    <div class="setup-profs">${profs.map(p => `<div class="setup-prof"><b>${esc(p.name)}</b><div class="tchips">${PL.map(([k, l]) => `<span class="tchip ${p[k].ok ? 'on' : 'off'}">${plBadge(k)}${l}${p[k].ok && p[k].label ? ` <small>${esc(p[k].label)}</small>` : ''}</span>`).join('')}</div></div>`).join('')}</div>
    <p style="margin-top:14px"><b>YouTube</b> (in Profiles, press Connect):</p>
    <ol class="steps"><li>A code appears. Press <b>Ctrl + Shift + N</b> (a private window, so the wrong Gmail is not used).</li>
      <li>Open <b>google.com/device</b>, sign in with <b>that channel's Gmail</b>, type the code.</li>
      <li>"Google hasn't verified this app": press <b>Continue</b>. Choose <b>the right channel</b>, press <b>Allow</b>. Back here press <b>Check now</b>.</li></ol>
    <p><b>Facebook and Instagram</b> (in Profiles, press Connect):</p>
    <ol class="steps"><li>Log in to Facebook with the account that <b>manages that Page</b>. Open ${link('https://developers.facebook.com/tools/explorer/', 'Graph API Explorer')}.</li>
      <li>Right side: <b>Meta App</b> = your app. <b>Add a Permission</b>: <code>pages_show_list</code> <code>pages_manage_posts</code> <code>pages_read_engagement</code> <code>instagram_basic</code> <code>instagram_content_publish</code>.</li>
      <li>Press <b>Generate Access Token</b>. In the window press <b>Edit settings</b> (not Continue), choose <b>Opt in to current Pages only</b>, <b>tick the Page</b>, tick its Instagram, then <b>Continue</b> and <b>Save</b>.</li>
      <li>Copy the token, paste it in Profiles, press <b>Connect</b>. It must show the <b>right Page name</b>.</li></ol>
    <div class="btn-row"><a class="btn primary sm" href="#profiles">${icon('users')}Open Profiles</a></div>`)}

  ${step(credit.length ? 'ok' : 'opt', 'Real video clips for Autopilot (Google AI Pro)', credit.length ? credit.map(c => `Key ${c.n}: $${c.spent.toFixed(2)} of $${c.limit} this month`).join(' · ') : 'Optional. Without it Autopilot uses free AI pictures.', `
    <ol class="steps"><li>With each Pro Gmail open ${link('https://developers.google.com/profile/benefits')} and press <b>Activate</b> on the Google Cloud credit.</li>
      <li>Same Gmail: ${link('https://aistudio.google.com/apikey')}, <b>Create API key</b>, pick the project that has the credit.</li>
      <li>Paste it in <b>Autopilot</b>, <b>Video credit</b>, press <b>Save</b> and <b>Test</b>.</li></ol>
    <div class="btn-row"><a class="btn sm" href="#autopilot">${icon('spark')}Open Autopilot</a></div>`)}

  ${step(h.schedules ? 'ok' : 'opt', 'Autopilot: videos made for you', h.schedules ? h.schedules + ' autopilot' + (h.schedules > 1 ? 's' : '') + ' set.' : 'Optional. Makes and posts videos at the times you choose.', `
    <ol class="steps"><li>Open <b>Autopilot</b>, press <b>New autopilot</b>.</li><li>Write what the videos are about, pick language, time and the accounts under <b>Post to</b>, press <b>Save</b>.</li><li>Press <b>Make one now</b> to test. It arrives in Telegram for your OK.</li></ol>
    <div class="btn-row"><a class="btn sm" href="#autopilot">${icon('spark')}Open Autopilot</a></div>`)}

  <p class="muted small">LinkedIn and X are optional and are set in <a href="#settings">Settings</a> (return address: <code>${esc(cb)}</code>).</p>`;
}
document.addEventListener('click', e => {
  if (S.page !== 'setup') return;
  const t = e.target.closest('[data-setup-reload]');
  if (t) busy(t, async () => { S.st = await api('/state'); await loadSetup(); toast('Checked.'); });
});

const PAGES = { setup: pageSetup, post: pagePost, autopilot: pageAutopilot, history: pageHistory, profiles: pageProfiles, settings: pageSettings };
boot();
})();
