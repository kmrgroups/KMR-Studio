/* KMR Studio dashboard */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const RATIOS = [['9:16', 'Reel, Short'], ['16:9', 'YouTube'], ['1:1', 'Square'], ['4:5', 'Feed post']];
const LENGTHS = [[15, '15 sec'], [30, '30 sec'], [45, '45 sec'], [60, '1 min'], [90, '1.5 min'], [180, '3 min'], [300, '5 min'], [480, '8 min'], [600, '10 min']];
const STAGES = [['script', 'Script'], ['voice', 'Voice'], ['visuals', 'Visuals'], ['sound', 'Sound'], ['render', 'Render'], ['review', 'Review'], ['publish', 'Publish']];
const STATUS = { flow: 'Needs Flow clips', queued: 'Waiting', working: 'Making', review: 'Needs your OK', approved: 'Approved', uploading: 'Posting', published: 'Published', rejected: 'Rejected', failed: 'Failed', failed_upload: 'Post failed' };
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TOP_LANGS = ['English', 'Hindi', 'Tamil', 'Kannada', 'Telugu', 'Malayalam', 'Marathi', 'Bangla', 'Gujarati', 'Urdu', 'Spanish', 'Arabic', 'French', 'Portuguese', 'German', 'Japanese', 'Korean', 'Chinese'];

const S = { st: null, voices: [], jobs: [], schedules: [], draft: null, ideas: [], filter: 'all', job: null, yt: null, editing: null, count: 1 };

// ---------- plumbing ----------
async function api(path, opts = {}) {
  const init = { method: opts.method || (opts.body !== undefined ? 'POST' : 'GET'), headers: {} };
  if (opts.raw) { init.body = opts.raw; init.headers['Content-Type'] = 'application/octet-stream'; }
  else if (opts.body !== undefined) { init.body = JSON.stringify(opts.body); init.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(path, init);
  if (r.status === 401 && !path.includes('login')) { boot(); throw new Error('Please sign in.'); }
  if (opts.blob) { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed'); return r.blob(); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}
function toast(msg, bad = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : ''); t.innerHTML = icon(bad ? 'x' : 'check') + '<span></span>'; t.lastChild.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), bad ? 7000 : 3800);
}
async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { toast(e.message, true); } finally { if (btn) btn.disabled = false; }
}
const view = () => (location.hash.slice(1).split('/')[0] || 'studio');
const when = t => { const d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };

// ---------- boot & auth ----------
async function boot() {
  const b = await api('/api/boot');
  S.brand = b.brand; applyFavicon(b.brand);
  if (!b.authed) return gate(b.needsPassword);
  await loadState();
  api('/api/voices').then(r => { S.voices = r.voices || []; if (['studio', 'autopilot'].includes(view())) render(); }).catch(() => {});
  await loadJobs();
  render();
  const m = location.hash.match(/^#library\/(\w+)/);
  if (m) openJob(m[1]);
}
function gate(first) {
  $('#app').innerHTML = `<div class="gate"><form class="gate-card" id="gate">
    <div class="brand">${brandMark(S.brand)}<span>KMR<em>Studio</em></span></div>
    <h1>${first ? 'Set your password' : 'Welcome back'}</h1>
    <p>${first ? 'This protects your studio. Your server is on the internet, so pick something strong.' : 'Sign in to your studio.'}</p>
    <input type="password" id="pw" placeholder="Password" autocomplete="${first ? 'new-password' : 'current-password'}" required minlength="6">
    ${first ? '<input type="password" id="pw2" placeholder="Type it again" autocomplete="new-password" required>' : ''}
    <button class="btn primary big">${first ? 'Create password and open studio' : 'Sign in'}</button></form></div>`;
  $('#pw').focus();
  $('#gate').onsubmit = e => {
    e.preventDefault();
    const pw = $('#pw').value;
    if (first && pw !== $('#pw2').value) return toast('The two passwords are different.', true);
    busy(e.submitter, async () => { await api(first ? '/api/setup-password' : '/api/login', { body: { password: pw } }); boot(); });
  };
}
async function loadState() {
  S.st = await api('/api/state');
  const s = S.st.settings;
  if (!S.draft) S.draft = { topic: '', niche: s.default_niche || '', ratio: s.default_ratio, style: s.default_style, language: s.default_language, voice: s.default_voice, duration: Number(s.default_duration), auto: !!s.auto_approve, motion: !!s.motion_default, engine: s.default_engine || 'lumen', targets: null };
  if (S.draft.targets === null || S.draft.targets === undefined) S.draft.targets = defTargets();
}
async function loadJobs() { S.jobs = (await api('/api/jobs')).jobs; }

// ---------- icons (simple line icons, drawn for KMR Studio) ----------
const IC = {
  studio: '<path d="M4 7h16v12H4z"/><path d="M4 7l3-4M10 7l3-4M16 7l3-4"/><path d="M10 11v5l4-2.5z" fill="currentColor" stroke="none"/>',
  library: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  trends: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  tools: '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>',
  autopilot: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  connections: '<path d="M9 7H7a5 5 0 000 10h2"/><path d="M15 7h2a5 5 0 010 10h-2"/><path d="M8 12h8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  spark: '<path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
  play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
  logout: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 17l5-5-5-5"/><path d="M15 12H4"/>'
};
const icon = (k, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k] || ''}</svg>`;

// ---------- brand ----------
const brandMark = b => b && b.logo ? `<span class="brand-logo ${b.bg}"><img src="/brand/logo?v=${b.v}" alt=""></span>` : '<span class="brand-mark"></span>';
function applyFavicon(b) {
  if (!b) return;
  const href = b.logo ? `/brand/icon-192.png?v=${b.v}` : null;
  for (const rel of ['icon', 'apple-touch-icon']) {
    let l = document.querySelector(`link[rel="${rel}"]`);
    if (!l) { l = document.createElement('link'); l.rel = rel; document.head.append(l); }
    if (href) l.href = href;
  }
}

// ---------- layout ----------
function shell(inner) {
  const v = view(), st = S.st, c = st.connections;
  const nav = [['studio', 'Studio'], ['upload', 'Upload'], ['library', 'Library', st.stats.review + (st.stats.flow || 0)], ['trends', 'Trends'], ['tools', 'Tools'], ['autopilot', 'Autopilot'], ['connections', 'Connections', 0, 'Connect'], ['settings', 'Settings']];
  const cnt = k => st.profiles.filter(p => p[k].ok).length, np = st.profiles.length;
  const health = [['Script writer', c.writer, 'warn'], ['Telegram', c.telegram], ...PL.map(([k, l]) => [`${l}${np > 1 && cnt(k) ? ` (${cnt(k)} of ${np})` : ''}`, cnt(k) > 0]), ['Free GPU (Kaggle)', c.kaggle]];
  const on = health.filter(h => h[1]).length;
  return `<header class="topbar"><a class="brand" href="#studio">${brandMark(st.brand)}<span>KMR<em>Studio</em></span></a><button class="btn quiet sm" data-act="logout" aria-label="Sign out">${icon('logout')}Sign out</button></header>
  <div class="shell"><aside class="side">
    <a class="brand" href="#studio">${brandMark(st.brand)}<span>KMR<em>Studio</em></span></a>
    <nav class="nav">${nav.map(([k, l, n, sh]) => `<a href="#${k}" class="${v === k ? 'on' : ''}" ${v === k ? 'aria-current="page"' : ''} aria-label="${l}">${icon(k)}<span class="nav-l" data-short="${sh || l}">${l}</span>${n ? `<span class="count">${n}</span>` : ''}</a>`).join('')}</nav>
    <a class="side-foot" href="#connections" title="Open connections">
      <div class="health-head"><span>Connected</span><b>${on} of ${health.length}</b></div>
      <div class="health-bar"><i style="width:${Math.round(100 * on / health.length)}%"></i></div>
      ${health.map(([l, ok, w]) => `<span class="h-row"><i class="dot ${ok ? 'ok' : (w || '')}"></i>${esc(l)}</span>`).join('')}
      <span class="ver">Version ${esc(st.version)}</span>
    </a>
    <button class="btn quiet signout" data-act="logout">${icon('logout')}Sign out</button></aside><main class="page-${v}">${inner}</main></div>`;
}
function render() {
  if (!S.st) return;
  const v = view();
  const pages = { studio, upload, library, trends, tools, autopilot, connections, settings };
  const scrollY = window.scrollY;
  const ae = document.activeElement, focused = ae && ae.id;
  const sel = ae && 'selectionStart' in ae ? [ae.selectionStart, ae.selectionEnd] : null;
  $('#app').innerHTML = shell((pages[v] || studio)());
  if (focused && $('#' + focused)) { const n = $('#' + focused); n.focus(); if (sel) try { n.setSelectionRange(sel[0], sel[1]); } catch {} }
  window.scrollTo(0, scrollY);
  afterRender(v);
}

// ---------- studio ----------
function languages() {
  const all = [...new Set(S.voices.map(v => v.language))];
  if (!all.length) return [S.draft.language || 'English'];
  return [...TOP_LANGS.filter(l => all.includes(l)), ...all.filter(l => !TOP_LANGS.includes(l)).sort()];
}
function langOptions(sel) {
  const ls = languages(); const top = ls.filter(l => TOP_LANGS.includes(l)); const rest = ls.filter(l => !TOP_LANGS.includes(l));
  const o = l => `<option ${l === sel ? 'selected' : ''}>${esc(l)}</option>`;
  return rest.length ? `<optgroup label="Popular">${top.map(o).join('')}</optgroup><optgroup label="All languages">${rest.map(o).join('')}</optgroup>` : ls.map(o).join('');
}
function voiceOptions(lang, sel) {
  const vs = S.voices.filter(v => v.language === lang);
  if (!vs.length) return `<option value="${esc(sel)}">${S.voices.length ? 'Automatic' : 'Loading voices…'}</option>`;
  return vs.map(v => `<option value="${esc(v.id)}" ${v.id === sel ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
}
function setupBanner() {
  const items = checklist(), done = items.filter(i => i[2]).length;
  if (done < items.length - 1) { const next = items.find(i => !i[2]); return `<div class="banner setup-banner"><span><b>Setup ${done} of ${items.length} done.</b> Next: ${esc(next[0])}.</span><div class="btn-row"><a class="btn" href="#settings/setup">See all steps</a><a class="btn primary" href="${next[3]}">Do this step</a></div></div>`; }
  const c = S.st.connections;
  if (!c.writer) return `<div class="banner"><span><strong>One step before your first video:</strong> connect a free script writer (Gemini or Groq).</span><a class="btn primary" href="#connections">Connect a script writer</a></div>`;
  const anyAcc = S.st.profiles.some(p => PL.some(([k]) => p[k].ok));
  if (!c.telegram || !anyAcc) return `<div class="banner"><span>${!c.telegram ? 'Connect Telegram to approve videos from your phone.' : 'Connect a YouTube, Instagram, Facebook, LinkedIn or X account so approved videos post automatically.'}</span><a class="btn" href="#connections">Open connections</a></div>`;
  return '';
}
function studio() {
  const d = S.draft;
  const active = S.jobs.filter(j => ['flow', 'queued', 'working', 'approved', 'uploading'].includes(j.status));
  const review = S.jobs.filter(j => j.status === 'review');
  const t = S.st.stats;
  const tiles = [['making', 'In production', t.making + (t.flow || 0), 'making'], ['review', 'Needs your OK', t.review, 'review'], ['published', 'Posted this week', t.week, 'published'], ['failed', 'Need attention', t.failed, 'failed']];
  return `${setupBanner()}
  <div class="stats">${tiles.map(([k, l, n, f]) => `<button class="stat st-${k} ${n ? 'has' : ''}" data-act="goto-lib" data-v="${f}"><span class="stat-n">${n}</span><span class="stat-l">${l}</span></button>`).join('')}</div>
  <section class="compose">
    <p class="eyebrow">New video</p><h1 class="display">What's the next video about?</h1>
    <div class="topic-box">
      <textarea id="topic" rows="2" placeholder="Why octopuses have three hearts">${esc(d.topic)}</textarea>
      <div class="topic-foot">
        <input id="niche" value="${esc(d.niche)}" placeholder="Channel niche for ideas, like space facts or kids' moral stories">
        <button class="btn quiet" data-act="ideas">Suggest topics</button>
      </div>
    </div>
    ${S.ideas.length ? `<div class="ideas">${S.ideas.map(i => `<button class="idea" data-act="use-idea" data-v="${esc(i)}">${esc(i)}</button>`).join('')}</div>` : ''}
    <div class="controls">
      <div class="control"><span class="label">Video engine</span><div class="engines">${engineCards(d)}</div></div>
      <div class="control"><span class="label">Format</span><div class="frames">${RATIOS.map(([r, l]) => `<button class="frame-opt ${d.ratio === r ? 'on' : ''}" data-act="ratio" data-v="${r}" aria-pressed="${d.ratio === r}"><i class="frame r${r.replace(':', 'x')}"></i><span>${r}</span><small>${l}</small></button>`).join('')}</div></div>
      <div class="control"><span class="label">Look</span><div class="looks">${Object.entries(S.st.styles).map(([k, l]) => `<button class="look ${d.style === k ? 'on' : ''}" data-act="style" data-v="${k}" aria-pressed="${d.style === k}"><i class="sw sw-${k}"></i>${esc(l)}</button>`).join('')}</div></div>
      <div class="control"><span class="label">Post to <span class="muted">(${esc(targetSummary(d.targets))})</span></span>${targetPicker('draft')}</div>
      <div class="control split">
        <label class="field"><span class="label">Language</span><select id="lang">${langOptions(d.language)}</select></label>
        <label class="field"><span class="label">Voice</span><span class="voice-row"><select id="voice">${voiceOptions(d.language, d.voice)}</select><button class="icon-btn" data-act="preview" title="Hear this voice" aria-label="Hear this voice">▶</button></span></label>
        <label class="field"><span class="label">Length</span><select id="dur">${LENGTHS.map(([s, l]) => `<option value="${s}" ${Number(d.duration) === s ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="go-row">
      <div class="toggles">
        <label class="switch"><input type="checkbox" id="auto" ${d.auto ? 'checked' : ''}><span></span>Post without asking me</label>
        ${d.engine !== 'lumen' ? '' : `<label class="switch" title="${S.st.connections.kaggle ? 'Characters really move, made on the free Kaggle GPU' : 'Connect Kaggle in Connections to use this'}"><input type="checkbox" id="motion" ${d.motion && S.st.connections.kaggle ? 'checked' : ''} ${S.st.connections.kaggle ? '' : 'disabled'}><span></span>AI motion ${S.st.connections.kaggle ? '<small class="muted">(slower, uses free GPU)</small>' : '<a href="#connections" class="small">connect Kaggle</a>'}</label>`}
      </div>
      <div class="go-btns">
        <label class="batch">Make <select id="count">${[1, 2, 3, 5].map(n => `<option ${S.count === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <button class="btn" data-act="surprise">Surprise me</button>
        <button class="btn primary big glow" data-act="make">${icon('play')}Make video</button>
      </div>
    </div>
  </section>
  <section class="block"><div class="block-head"><h2>In production</h2><span class="muted small">${active.length ? active.length + ' in progress' : ''}</span></div>
    ${active.length ? active.map(filmstrip).join('') : '<p class="empty">Nothing in production. Describe a video above and it will show its progress here.</p>'}</section>
  ${review.length ? `<section class="block"><div class="block-head"><h2>Waiting for your OK</h2><a href="#library" class="small">See all videos</a></div><div class="grid">${review.map(card).join('')}</div></section>` : ''}`;
}
function engineCards(d) {
  const c = S.st.connections, shots = Math.max(1, Math.min(12, Math.round(Number(d.duration) / 8)));
  const cost = (shots * 8 * (c.veo_rate || 0.05)).toFixed(2);
  const list = [
    ['lumen', 'Standard', 'Free and automatic. Animated pictures with a narrator voice.'],
    ['veo', 'Veo', `Real cinematic shots, characters speak. Automatic. Google charges about $${cost} for this length.`],
    ['flow', 'Flow', `Same Veo quality, free with your Pro plan. You make ${shots} clip${shots > 1 ? 's' : ''} in Flow from KMR Studio's prompts.`]
  ];
  return list.map(([k, t, p]) => `<button class="engine ${d.engine === k ? 'on' : ''}" data-act="engine" data-v="${k}" aria-pressed="${d.engine === k}"><b>${t}</b><small>${p}</small></button>`).join('');
}
function filmstrip(j) {
  const idx = STAGES.findIndex(s => s[0] === j.stage);
  const posting = ['approved', 'uploading'].includes(j.status);
  const at = posting ? 6 : idx;
  const lit = i => i < at ? 'done' : (i === at && (j.status === 'working' || j.status === 'uploading')) ? 'now' : (i === at && j.status === 'flow') ? 'wait' : '';
  const fc = j.status === 'flow' ? `${(j.clips || []).filter(Boolean).length} of ${j.shots || (j.script?.shots || []).length || '?'} clips` : '';
  const right = j.status === 'flow' ? `Waiting for Flow clips, ${fc}` : j.status === 'queued' ? 'Waiting in line' : posting ? (j.waiting_for ? 'Connect an account to post' : 'Posting') : j.progress + '%';
  return `<article class="strip" data-act="open" data-id="${j.id}" tabindex="0">
    <div class="strip-top"><strong>${esc(j.title || j.topic || 'Choosing a topic')}</strong><span class="muted small">${right}</span></div>
    <ol class="reel">${STAGES.map(([, l], i) => `<li class="${lit(i)}"><span>${j.status === 'flow' && i === at ? 'Flow clips' : l}</span></li>`).join('')}</ol>
    <p class="strip-note">${esc(j.log?.[j.log.length - 1]?.msg || '')}</p></article>`;
}
function card(j) {
  const r = (j.options?.ratio || '9:16').replace(':', ' / ');
  const lenTxt = j.duration ? Math.round(j.duration) + ' sec' : '';
  return `<article class="vcard" data-act="open" data-id="${j.id}" tabindex="0">
    <div class="thumb" style="aspect-ratio:${r}">${j.thumb ? `<img src="/media/${j.id}/${j.thumb}?v=${j.updated}" alt="">` : j.character ? `<img src="/media/${j.id}/${j.character}" alt="" class="dim">` : `<div class="thumb-empty">${esc(STATUS[j.status] || '')}</div>`}<span class="badge b-${j.status}">${STATUS[j.status] || j.status}</span></div>
    <h3>${esc(j.title || j.topic || 'Automatic topic')}</h3>
    <p class="muted small">${[j.options?.language, lenTxt, when(j.created)].filter(Boolean).map(esc).join(', ')}</p></article>`;
}

// ---------- upload and post ----------
const fmtDur = t => { t = Math.round(t || 0); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
const fmtSize = b => b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(1, Math.round(b / 1e6)) + ' MB';
function upState() {
  if (!S.up) {
    const c = S.st.connections;
    S.up = { files: [], mode: 'each', approve: false, language: S.st.settings.default_language,
      join: { title: '', description: '', hashtags: '', ratio: 'auto', fit: 'blur' },
      targets: defTargets() };
  }
  return S.up;
}
function upload() {
  const u = upState(), c = S.st.connections;
  const ready = u.files.filter(f => f.status === 'ready'), busyN = u.files.filter(f => f.status === 'uploading').length;
  const joining = u.mode === 'join' && ready.length > 1;
  const posts = joining ? 1 : ready.length;
  const plats = u.targets.filter(readyT);
  const total = ready.reduce((a, f) => a + f.duration, 0);
  const recent = S.jobs.filter(j => j.source === 'upload').slice(0, 12);
  const where = plats.length ? `${plats.length} account${plats.length > 1 ? 's' : ''}` : '';
  const fileRow = (f, i) => `<div class="up-file ${f.status}" id="upf-${f.key}">
    <div class="up-thumb">${f.thumb ? `<img src="/staged/${f.thumb}" alt="">` : icon('film')}${f.status === 'ready' ? `<span>${fmtDur(f.duration)}</span>` : ''}</div>
    <div class="up-info"><b title="${esc(f.name)}">${esc(f.name)}</b>
      ${f.status === 'uploading' ? `<div class="progress"><i id="upp-${f.key}" style="width:${f.pct || 0}%"></i></div><span class="muted small" id="upt-${f.key}">Uploading ${f.pct || 0}%</span>`
      : f.status === 'error' ? `<span class="err-text small">${esc(f.error)}</span>`
      : `<span class="muted small">${f.w}×${f.h}, ${esc(f.ratio)}, ${fmtSize(f.size)}${f.audio ? '' : ', no sound'}</span>`}</div>
    <div class="up-acts">${u.files.length > 1 ? `<button class="icon-btn sm" data-act="up-move" data-v="${i}:-1" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="icon-btn sm" data-act="up-move" data-v="${i}:1" ${i < u.files.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button>` : ''}
      <button class="icon-btn sm" data-act="up-remove" data-v="${f.key}" aria-label="Remove">${icon('x')}</button></div></div>`;
  const metaFields = (pre, m, name, open) => `
      <div class="form-grid one"><label class="field"><span class="label">Title</span><input id="${pre}-title" data-um="${pre}:title" value="${esc(m.title)}" maxlength="100" placeholder="${esc(name ? name.replace(/\.[^.]+$/, '') : 'Title')}"></label></div>
      <label class="field"><span class="label">Description</span><textarea id="${pre}-description" data-um="${pre}:description" rows="3" placeholder="What viewers should know. Add a call to follow.">${esc(m.description)}</textarea></label>
      <label class="field"><span class="label">Hashtags</span><input id="${pre}-hashtags" data-um="${pre}:hashtags" value="${esc(m.hashtags)}" placeholder="#tamil #shorts #story"></label>
      <div><button class="btn quiet sm" data-act="up-ai" data-v="${pre}">${icon('tools')}Write title, caption and hashtags with AI</button></div>`;
  return `<div class="page-head"><div><p class="eyebrow">Upload and post</p><h1>Post your own videos</h1><p>Add one or more videos. KMR Studio posts each one, or joins them into a single video, to every account you choose below.</p></div></div>
  <div class="up-layout"><div class="up-main">
  <section class="panel up-step"><div class="step-h"><span class="step-n">1</span><h2>Add videos</h2>${u.files.length ? `<span class="muted small">${u.files.length} video${u.files.length > 1 ? 's' : ''}${ready.length ? ', ' + fmtDur(total) + ' in total' : ''}</span>` : ''}</div>
    <label class="dropzone big" id="up-drop">${icon('upload')}<span><b>Drop videos here</b> or tap to choose. MP4, MOV, MKV, WEBM or AVI, one or many.</span><input type="file" id="up-files" accept="video/*" multiple hidden></label>
    ${u.files.length ? `<div class="up-files">${u.files.map(fileRow).join('')}</div>` : ''}</section>

  ${ready.length > 1 ? `<section class="panel up-step"><div class="step-h"><span class="step-n">2</span><h2>How to post</h2></div>
    <div class="engines two">
      <button class="engine ${u.mode === 'each' ? 'on' : ''}" data-act="up-mode" data-v="each"><b>Each video separately</b><small>${ready.length} posts, one per video, each with its own title and caption.</small></button>
      <button class="engine ${u.mode === 'join' ? 'on' : ''}" data-act="up-mode" data-v="join"><b>Join into one video</b><small>The ${ready.length} videos play one after another, in the order above, as one post of ${fmtDur(total)}.</small></button>
    </div></section>` : ''}

  ${ready.length ? `<section class="panel up-step"><div class="step-h"><span class="step-n">${ready.length > 1 ? 3 : 2}</span><h2>Title and caption</h2>
      <label class="lang-mini"><span class="muted small">AI writes in</span><select id="up-lang">${langOptions(u.language)}</select></label></div>
    ${joining ? `<div class="up-meta">${metaFields('join', u.join, ready[0].name)}
      <div class="form-grid"><label class="field"><span class="label">Shape of the joined video</span><select id="up-ratio">${[['auto', `Same as the first video (${ready[0].ratio})`], ...RATIOS.map(([r, l]) => [r, `${r} ${l}`])].map(([v2, l]) => `<option value="${v2}" ${u.join.ratio === v2 ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Videos of a different shape</span><select id="up-fit"><option value="blur" ${u.join.fit !== 'crop' ? 'selected' : ''}>Show whole video on a blurred background</option><option value="crop" ${u.join.fit === 'crop' ? 'selected' : ''}>Zoom in to fill the screen</option></select></label></div></div>`
    : ready.map((f, i) => `<details class="up-meta" ${i === 0 || ready.length < 4 ? 'open' : ''}><summary><span class="up-mini">${f.thumb ? `<img src="/staged/${f.thumb}" alt="">` : ''}</span>${esc(f.title || f.name)}</summary>${metaFields('f' + f.key, f, f.name)}</details>`).join('')}
    <p class="muted small">Leave the title empty to use the file name.</p></section>` : ''}

  <section class="panel up-step"><div class="step-h"><span class="step-n">${ready.length > 1 ? 4 : ready.length ? 3 : 2}</span><h2>Where to post</h2></div>
    ${targetPicker('up', 'Tick the profiles and platforms that should get the video. Each profile posts from its own accounts.')}
    ${plats.some(t => t.endsWith(':youtube')) ? `<p class="muted small">YouTube visibility: <b>${esc(S.st.settings.yt_privacy)}</b> (change in Settings). Vertical videos up to 3 minutes post as Shorts.</p>` : ''}
    ${plats.some(t => t.endsWith(':instagram')) && ready.some(f => f.duration > 900) && !joining ? '<p class="note small">Instagram Reels can be at most 15 minutes. Longer videos will be refused by Instagram.</p>' : ''}
    <label class="switch" style="margin-top:6px"><input type="checkbox" id="up-approve" ${u.approve ? 'checked' : ''}><span></span>Send to me for approval first${c.telegram ? ' (Telegram)' : ''}</label></section>
  </div>

  <aside class="up-side"><div class="panel up-sum">
    <p class="eyebrow">Summary</p>
    <div class="sum-big">${posts || 0}<small>post${posts === 1 ? '' : 's'}</small></div>
    <ul class="sum-list"><li>${ready.length} video${ready.length === 1 ? '' : 's'} ready${busyN ? `, ${busyN} uploading` : ''}</li>
      <li>${joining ? 'Joined into one video' : ready.length > 1 ? 'Each posted separately' : 'Posted as it is'}</li>
      <li>${where ? `To ${where}: ${esc(targetSummary(plats))}` : 'No account chosen'}</li><li>${u.approve ? 'Waits for your approval' : 'Posts right away'}</li></ul>
    <button class="btn primary big glow full" data-act="up-go" ${ready.length && plats.length && !busyN ? '' : 'disabled'}>${icon('send')}${u.approve ? 'Prepare for approval' : where ? `Post now` : 'Post now'}</button>
    ${busyN ? '<p class="muted small" style="margin:10px 0 0">Wait for uploads to finish.</p>' : !plats.length ? '<p class="muted small" style="margin:10px 0 0">Choose where to post.</p>' : ''}
  </div></aside></div>

  ${recent.length ? `<section class="block" style="margin-top:34px"><div class="block-head"><h2>Recent uploads</h2><a href="#library" class="small">Open Library</a></div><div class="grid">${recent.map(card).join('')}</div></section>` : ''}`;
}
function readUpload() {
  const u = S.up; if (!u || !$('#up-drop')) return;
  $$('[data-um]').forEach(el => {
    const [who, field] = el.dataset.um.split(':');
    if (who === 'join') u.join[field] = el.value;
    else { const f = u.files.find(x => 'f' + x.key === who); if (f) f[field] = el.value; }
  });
  if ($('#up-ratio')) u.join.ratio = $('#up-ratio').value;
  if ($('#up-fit')) u.join.fit = $('#up-fit').value;
  if ($('#up-lang')) u.language = $('#up-lang').value;
  if ($('#up-approve')) u.approve = $('#up-approve').checked;
}
let upBusy = false;
async function addUploads(list) {
  const u = upState();
  const vids = list.filter(f => /^video\//.test(f.type) || /\.(mp4|mov|m4v|mkv|webm|avi|3gp)$/i.test(f.name));
  if (!vids.length) return toast('Those files are not videos.', true);
  for (const f of vids) u.files.push({ key: Math.random().toString(36).slice(2, 9), name: f.name, status: 'uploading', pct: 0, blob: f, title: '', description: '', hashtags: '' });
  readUpload(); render();
  if (upBusy) return;
  upBusy = true;
  try {
    let f;
    while ((f = u.files.find(x => x.status === 'uploading' && x.blob))) {
      const blob = f.blob; f.blob = null;
      try {
        const r = await xhrUpload('/api/uploads/file?name=' + encodeURIComponent(f.name), blob, 'PUT', null, pct => {
          f.pct = Math.round(pct);
          const bar = document.getElementById('upp-' + f.key), t = document.getElementById('upt-' + f.key);
          if (bar) bar.style.width = f.pct + '%'; if (t) t.textContent = f.pct < 100 ? `Uploading ${f.pct}%` : 'Checking the video…';
        });
        Object.assign(f, r.upload, { status: 'ready' });
      } catch (e) { f.status = 'error'; f.error = e.message; }
      if (view() === 'upload') { readUpload(); render(); }
    }
  } finally { upBusy = false; }
}
async function aiText(who, btn) {
  const u = S.up;
  const target = who === 'join' ? u.join : u.files.find(x => 'f' + x.key === who);
  const name = who === 'join' ? u.files.filter(f => f.status === 'ready').map(f => f.name).join(', ') : target.name;
  await busy(btn, async () => {
    btn.lastChild.textContent = 'Writing…';
    const r = await api('/api/uploads/ai-text', { body: { about: [target.title, target.description].filter(Boolean).join('. '), name, language: u.language } });
    target.title = r.title; target.description = r.description; target.hashtags = r.hashtags.join(' ');
    render(); toast('Title, caption and hashtags written. Edit them if you like.');
  });
}

// ---------- library ----------
function library() {
  const f = S.filter;
  const groups = { all: () => true, review: j => j.status === 'review', making: j => ['flow', 'queued', 'working', 'approved', 'uploading'].includes(j.status), published: j => j.status === 'published', failed: j => ['failed', 'failed_upload', 'rejected'].includes(j.status) };
  const list = S.jobs.filter(groups[f]);
  const tabs = [['all', 'All'], ['review', 'Needs your OK'], ['making', 'In progress'], ['published', 'Published'], ['failed', 'Failed or rejected']];
  return `<div class="page-head"><div><h1>Library</h1><p>Every video you've made. Open one to watch, edit its title, approve or remake it.</p></div>
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${f === k ? 'on' : ''}" data-act="filter" data-v="${k}">${l}</button>`).join('')}</div></div>
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>` : `<p class="empty">No videos here yet. <a href="#studio">Make one in the Studio.</a></p>`}`;
}

async function openJob(id) {
  try { S.job = (await api('/api/jobs/' + id)).job; S.jobTargets = Array.isArray(S.job.targets) ? [...S.job.targets] : (S.job.post_to || S.st.settings.post_to || []).map(pl => (S.st.profiles[0] || {}).id + ':' + pl); renderModal(); history.replaceState(null, '', '#library/' + id); }
  catch (e) { toast(e.message, true); }
}
function flowBox(j) {
  const shots = j.script?.shots || [], clips = j.clips || [], done = shots.filter((_, i) => clips[i]).length;
  const orient = j.options.ratio === '16:9' ? 'Landscape 16:9' : 'Portrait 9:16';
  const pct = shots.length ? Math.round(100 * done / shots.length) : 0;
  const tg = S.st.connections.telegram;
  return `<div class="flow-box" id="flow-drop">
    <div class="flow-head">
      <div><p class="eyebrow">Flow engine</p><h3>Make ${shots.length} clip${shots.length > 1 ? 's' : ''} in Google Flow</h3></div>
      <div class="flow-meter" style="--p:${pct}"><b>${done}/${shots.length}</b><small>clips</small></div>
    </div>
    <ol class="steps small">
      <li>Open <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noopener">Google Flow</a>, start a <b>New project</b>, set the aspect ratio to <b>${orient}</b>, and choose <b>Veo 3.1 Fast</b> (or <b>Lite</b> to save credits).</li>
      ${j.character ? '<li>Download the character picture and add it in Flow as an <b>Ingredient</b>, so the same person appears in every shot.</li>' : ''}
      <li>For each shot: copy the prompt, paste it in Flow, generate, and download the best result.</li>
      <li>Drop the clips here, or ${tg ? 'reply to each shot message in <b>Telegram</b> with its clip' : 'upload them one by one'}. Then press <b>Finish video</b>.</li>
    </ol>
    <div class="btn-row">
      <button class="btn quiet" data-act="copy-all">${icon('copy')}Copy all prompts</button>
      ${j.character ? `<a class="btn quiet" href="/media/${j.id}/${j.character}" download="character.jpg">${icon('upload', 'flip')}Character picture</a>` : ''}
      ${tg ? `<button class="btn quiet" data-act="resend-flow">${icon('send')}Send prompts to Telegram</button>` : ''}
    </div>
    <label class="dropzone">${icon('upload')}<span><b>Drop all clips here</b> or tap to choose. They are matched to shots by file name order.</span><input type="file" id="flow-multi" accept="video/*" multiple hidden></label>
    <div class="progress" id="flow-prog" hidden><i></i></div>
    <div class="shots">${shots.map((sh, i) => `<div class="shot ${clips[i] ? 'done' : ''}" data-shot="${i}">
      <div class="shot-head"><span class="shot-no">${clips[i] ? icon('check') : i + 1}</span><b>Shot ${i + 1}</b><span class="small ${clips[i] ? 'ok-text' : 'muted'}">${clips[i] ? 'Clip ready' : '8 seconds'}</span></div>
      ${sh.dialogue ? `<p class="says">“${esc(sh.dialogue)}”</p>` : ''}
      ${clips[i] ? `<video class="shot-vid" src="/media/${j.id}/${clips[i]}?v=${j.updated}#t=0.8" muted playsinline preload="metadata" controls></video>` : ''}
      <details class="shot-prompt" ${clips[i] ? '' : 'open'}><summary>Prompt</summary><textarea readonly rows="4" id="shot-p-${i}">${esc(sh.prompt)}</textarea></details>
      <div class="btn-row"><button class="btn quiet sm" data-act="copy-shot" data-v="${i}">${icon('copy')}Copy prompt</button><label class="btn sm ${clips[i] ? 'quiet' : ''}">${icon('upload')}${clips[i] ? 'Replace' : 'Upload clip'}<input type="file" class="flow-up" data-shot="${i}" accept="video/*" hidden></label>${clips[i] ? `<button class="btn quiet sm danger" data-act="del-clip" data-v="${i}">${icon('x')}Remove</button>` : ''}</div></div>`).join('')}</div>
    <button class="btn primary big glow" data-act="flow-finish" ${done ? '' : 'disabled'}>${icon('film')}${done === shots.length ? 'Finish video' : done ? `Finish with ${done} of ${shots.length} clips` : 'Finish video'}</button></div>`;
}
function closeModal() { S.job = null; $('#modal').innerHTML = ''; if (location.hash.startsWith('#library/')) history.replaceState(null, '', '#library'); }
function renderModal() {
  const j = S.job; if (!j) return;
  const r = (j.options?.ratio || '9:16').replace(':', ' / ');
  const st = j.status;
  const acts = [];
  const own = j.source === 'repurpose' || j.source === 'upload';
  if (st === 'review') acts.push(`<button class="btn primary" data-act="job" data-v="approve">Approve and post</button>`, ...(own ? [] : [`<button class="btn" data-act="job" data-v="remake">Remake with new script</button>`]), `<button class="btn danger" data-act="job" data-v="reject">Reject</button>`);
  if (st === 'failed') acts.push(`<button class="btn primary" data-act="job" data-v="remake">Try again</button>`, `<button class="btn" data-act="job" data-v="rerender">Retry with same script</button>`);
  if (st === 'failed_upload') acts.push(`<button class="btn primary" data-act="job" data-v="publish">Try posting again</button>`, ...(/Facebook login/.test(j.error || '') ? [`<a class="btn" href="#connections" data-act="close-modal">Reconnect Facebook</a>`] : []));
  const pub = { ...(j.published || {}) }; if (j.youtube && !Object.keys(pub).some(k => k.endsWith('youtube'))) pub.youtube = j.youtube;
  const first = (S.st.profiles[0] || {}).id;
  const links = Object.entries(pub).map(([t, r]) => `<a class="pub-link" href="${esc(r.url)}" target="_blank" rel="noopener"><span class="pl-${splitT(t.includes(':') ? t : first + ':' + t)[1]} mini"></span>${esc(r.label || labelT(t.includes(':') ? t : first + ':' + t))}</a>`);
  if (st === 'rejected') acts.push(...(own ? [] : [`<button class="btn" data-act="job" data-v="remake">Remake with new script</button>`]), `<button class="btn" data-act="job" data-v="approve">Approve anyway</button>`);
  if (st === 'published' && !own) acts.push(`<button class="btn" data-act="job" data-v="remake">Make another version</button>`);
  if (j.video) acts.push(`<a class="btn" href="/media/${j.id}/${j.video}" download="${esc((j.title || 'video').replace(/[^\w\- ]+/g, ''))}.mp4">Download</a>`);
  acts.push(`<button class="btn danger quiet" data-act="del-job">Delete</button>`);
  const editable = ['review', 'approved', 'rejected', 'failed_upload'].includes(st);
  $('#modal').innerHTML = `<div class="scrim" data-act="close-modal"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Video details">
    <button class="close" data-act="close-modal" aria-label="Close">×</button>
    <div class="sheet-grid">
      <div class="player">${!j.video && j.character ? `<figure class="char"><img src="/media/${j.id}/${j.character}?v=${j.updated}" alt="Character reference"><figcaption>Character reference for Flow</figcaption></figure>` : ''}${j.video ? `<video src="/media/${j.id}/${j.video}?v=${j.updated}" ${j.thumb ? `poster="/media/${j.id}/${j.thumb}?v=${j.updated}"` : ''} style="aspect-ratio:${r}" controls playsinline preload="metadata"></video>` : j.character ? '' : `<div class="ph" style="--ar:${r}"><div class="thumb-empty">${st === 'failed' ? 'This video failed. See the reason on the right.' : 'The video appears here when it is ready.'}</div></div>`}</div>
      <div class="detail">
        <div><span class="badge inline b-${st}">${STATUS[st] || st}</span> <span class="muted small">${esc(j.options.ratio)}, ${esc(j.options.language)}, ${esc(S.st.styles[j.options.style] || j.options.style)}, made ${when(j.created)}</span></div>
        <h2>${esc(j.title || j.topic || 'Automatic topic')}</h2>
        ${st === 'flow' ? flowBox(j) : ''}
        ${j.error ? `<p class="err" style="white-space:pre-line">${esc(j.error)}</p>` : ''}
        ${j.waiting_for ? `<p class="note">Approved. It will post as soon as you <a href="#connections" data-act="close-modal">connect YouTube, Instagram or Facebook</a>.</p>` : ''}
        ${j.youtube?.note ? `<p class="note">${esc(j.youtube.note)}</p>` : ''}
        ${j.script ? `
        <label class="field"><span class="label">Title</span><input id="m-title" value="${esc(j.title)}" maxlength="100" ${editable ? '' : 'disabled'}></label>
        <label class="field"><span class="label">Description</span><textarea id="m-desc" rows="4" ${editable ? '' : 'disabled'}>${esc(j.description)}</textarea></label>
        <label class="field"><span class="label">Hashtags</span><input id="m-hash" value="${esc((j.hashtags || []).join(' '))}" ${editable ? '' : 'disabled'}></label>
        ${editable ? '<div><button class="btn quiet" data-act="save-meta">Save changes</button></div>' : ''}` : ''}
        <div class="btn-row">${acts.join('')}</div>
        ${links.length ? `<div><span class="label">Posted on</span><div class="pub-links">${links.join('')}</div></div>` : ''}
        ${['review', 'approved', 'rejected', 'failed_upload', 'flow', 'queued', 'working'].includes(st) && S.jobTargets ? `<div class="field"><span class="label">Post to</span>${targetPicker('job')}${['review', 'rejected', 'failed_upload', 'approved'].includes(st) ? '<div><button class="btn quiet sm" data-act="save-meta" style="margin-top:8px">Save</button></div>' : '<p class="muted small" style="margin:6px 0 0">Changes are saved when you press Save below the title, or when you approve.</p>'}</div>` : ''}
        ${j.script ? `<details><summary>Script, ${j.script.scenes.length} scenes</summary><ol class="scenes">${j.script.scenes.map(s => `<li>${esc(s.narration)}<small>${esc(s.visual || s.stock_query || '')}${s.sfx ? ' (sound: ' + esc(s.sfx) + ')' : ''}</small></li>`).join('')}</ol></details>` : ''}
        <details ${st === 'failed' ? 'open' : ''}><summary>Activity</summary><ul class="log">${(j.log || []).slice().reverse().map(l => `<li><time>${new Date(l.t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</time>${esc(l.msg)}</li>`).join('')}</ul></details>
      </div>
    </div></div>`;
}

// ---------- autopilot ----------
function blankSchedule() {
  const s = S.st.settings;
  return { name: '', niche: s.default_niche || '', topics: [], days: [...DAYS], times: ['09:00', '18:00'], ratio: s.default_ratio, style: s.default_style, language: s.default_language, voice: s.default_voice, duration: s.default_duration, auto_approve: false, enabled: true, targets: defTargets() };
}
function autopilot() {
  const e = S.editing;
  return `<div class="page-head"><div><h1>Autopilot</h1><p>KMR Studio makes videos on the days and times you choose, picks trending-style topics in your niche, and sends each one for approval (or posts it directly if you allow).</p></div>
    ${e ? '' : '<button class="btn primary" data-act="new-sched">New autopilot</button>'}</div>
    ${e ? scheduleForm(e) : ''}
    <div class="panels">${S.schedules.length ? S.schedules.map(s => `<div class="panel sched">
      <label class="switch" title="On or off"><input type="checkbox" data-act="toggle-sched" data-id="${s.id}" ${s.enabled ? 'checked' : ''}><span></span></label>
      <div><h3>${esc(s.name)}</h3><p class="muted small" style="margin:4px 0 0">${esc(s.niche || 'Topics from your list')}, ${s.times.join(' and ')} on ${s.days.length === 7 ? 'every day' : s.days.join(', ')}. ${esc(s.ratio)} ${esc(s.language)}. ${s.engine && s.engine !== 'lumen' ? (s.engine === 'veo' ? 'Veo engine. ' : 'Flow shot lists. ') : ''}${s.topic_source === 'trends' ? 'Uses viral ideas. ' : ''}${s.motion ? 'AI motion. ' : ''}${s.auto_approve ? 'Posts without asking' : 'Asks you first'} to ${esc(targetSummary(Array.isArray(s.targets) ? s.targets : defTargets()))}.${s.topics?.length ? ` ${s.topics.length} topics waiting in the list.` : ''}</p></div>
      <div class="btn-row"><button class="btn quiet" data-act="edit-sched" data-id="${s.id}">Edit</button><button class="btn quiet danger" data-act="del-sched" data-id="${s.id}">Delete</button></div></div>`).join('')
      : (e ? '' : '<p class="empty">No autopilots yet. Create one and KMR Studio will keep your channels posting on schedule.</p>')}</div>
    ${S.clock ? `<p class="muted small" style="margin-top:18px">Server clock in your timezone: ${esc(S.clock.hm)}, ${esc(S.clock.day)}.</p>` : ''}`;
}
function scheduleForm(e) {
  return `<form class="panel" id="sched-form" style="margin-bottom:22px">
    <div class="form-grid">
      <label class="field"><span class="label">Name</span><input id="sf-name" value="${esc(e.name)}" placeholder="Daily space shorts" required></label>
      <label class="field"><span class="label">Niche (used when the topic list is empty)</span><input id="sf-niche" value="${esc(e.niche)}" placeholder="Space facts"></label>
      <label class="field"><span class="label">Times, comma separated</span><input id="sf-times" value="${esc((e.times || []).join(', '))}" placeholder="09:00, 18:00"></label>
    </div>
    <div class="field" style="margin-top:14px"><span class="label">Days</span><div class="chips">${DAYS.map(d => `<button type="button" class="chip ${e.days.includes(d) ? 'on' : ''}" data-act="sf-day" data-v="${d}">${d}</button>`).join('')}</div></div>
    <label class="field" style="margin-top:14px"><span class="label">When the topic list is empty, pick topics from</span><select id="sf-source"><option value="niche" ${e.topic_source !== 'trends' ? 'selected' : ''}>Fresh ideas for the niche</option><option value="trends" ${e.topic_source === 'trends' ? 'selected' : ''}>Viral analysis of the niche (uses YouTube search)</option></select></label>
    <label class="field" style="margin-top:14px"><span class="label">Topic list (optional, one per line; used first, then the niche takes over)</span><textarea id="sf-topics" rows="3">${esc((e.topics || []).join('\n'))}</textarea></label>
    <div class="form-grid" style="margin-top:14px">
      <label class="field"><span class="label">Format</span><select id="sf-ratio">${RATIOS.map(([r, l]) => `<option value="${r}" ${e.ratio === r ? 'selected' : ''}>${r} ${l}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Look</span><select id="sf-style">${Object.entries(S.st.styles).map(([k, l]) => `<option value="${k}" ${e.style === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Language</span><select id="sf-lang">${langOptions(e.language)}</select></label>
      <label class="field"><span class="label">Voice</span><select id="sf-voice">${voiceOptions(e.language, e.voice)}</select></label>
      <label class="field"><span class="label">Engine</span><select id="sf-engine">${[['lumen', 'Standard (free, automatic)'], ['veo', 'Veo (automatic, paid)'], ['flow', 'Flow (shot list, you make clips)']].map(([k, l]) => `<option value="${k}" ${(e.engine || 'lumen') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Length</span><select id="sf-dur">${LENGTHS.map(([s, l]) => `<option value="${s}" ${Number(e.duration) === s ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="field" style="margin-top:14px"><span class="label">Post to</span>${targetPicker('sf')}</div>
    <div class="go-row"><div class="toggles"><label class="switch"><input type="checkbox" id="sf-auto" ${e.auto_approve ? 'checked' : ''}><span></span>Post without asking me</label>
      <label class="switch"><input type="checkbox" id="sf-motion" ${e.motion ? 'checked' : ''} ${S.st.connections.kaggle ? '' : 'disabled'}><span></span>AI motion</label></div>
      <div class="go-btns"><button type="button" class="btn quiet" data-act="cancel-sched">Cancel</button><button class="btn primary">Save autopilot</button></div></div>
  </form>`;
}

// ---------- connections ----------
const SIMPLE = [
  { id: 'gemini', key: 'gemini_key', name: 'Gemini script writer', need: 'Required', role: 'Writes the scripts, titles, descriptions and topic ideas. Free.',
    steps: ['Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in with your Google account.', 'Press <b>Create API key</b> and copy it.', 'Paste it below and press <b>Save and test</b>.'] },
  { id: 'groq', key: 'groq_key', name: 'Groq script writer', need: 'Backup', role: 'A second free script writer. If Gemini is blocked or busy, Groq takes over automatically. No card needed.',
    steps: ['Sign in at <a href="https://console.groq.com/keys" target="_blank" rel="noopener">console.groq.com/keys</a> with Google or email.', 'Press <b>Create API Key</b> and copy it.', 'Paste it below and press <b>Save and test</b>.'] },
  { id: 'pexels', key: 'pexels_key', name: 'Pexels stock footage', need: 'Recommended', role: 'Real HD footage for the Real footage look, and backup pictures if AI images fail. Free.',
    steps: ['Create a free account at <a href="https://www.pexels.com/api/" target="_blank" rel="noopener">pexels.com/api</a>.', 'Copy your API key from that page.', 'Paste it below.'] },
  { id: 'freesound', key: 'freesound_key', name: 'Freesound sound effects', need: 'Recommended', role: 'Realistic sound effects like whooshes, rain, crowds and footsteps, placed on the right scenes. Free.',
    steps: ['Sign up at <a href="https://freesound.org" target="_blank" rel="noopener">freesound.org</a>.', 'Open <a href="https://freesound.org/apiv2/apply/" target="_blank" rel="noopener">freesound.org/apiv2/apply</a>, create a credential, and copy the <b>API key</b> (client secret).', 'Paste it below.'] },
  { id: 'pollinations', key: 'pollinations_token', name: 'Pollinations AI images', need: 'Optional', role: 'Makes the AI pictures for cartoon, 3D, anime and cinematic looks. Works without a token; a free token makes it faster and steadier.',
    steps: ['Get a free token at <a href="https://pollinations.ai" target="_blank" rel="noopener">pollinations.ai</a>.', 'Paste it below.'] }
];
function simplePanel(sv) {
  const c = S.st.connections[sv.id], val = S.st.settings[sv.key];
  return `<div class="panel"><div class="panel-head"><div><h2>${sv.name}</h2><p>${sv.role}</p></div><span class="need ${c ? 'ok' : ''}">${c ? 'Connected' : sv.need}</span></div>
    ${c ? '' : `<ol class="steps">${sv.steps.map(s => `<li>${s}</li>`).join('')}</ol>`}
    <div class="form-row"><label class="field"><span class="label">${c ? 'Saved key ' + esc(val) + '. Paste a new one to replace it.' : 'Key'}</span><input type="text" class="secret" id="k-${sv.id}" autocomplete="off" spellcheck="false" data-lpignore="true" placeholder="Paste here"></label>
      <button class="btn ${c ? '' : 'primary'}" data-act="save-key" data-id="${sv.id}" data-key="${sv.key}">${c ? 'Replace and test' : 'Save and test'}</button></div>
    ${c ? `<div class="btn-row" style="margin-top:10px"><button class="btn quiet" data-act="test" data-id="${sv.id}">Test again</button></div>` : ''}</div>`;
}
function telegramPanel() {
  const c = S.st.connections;
  return `<div class="panel"><div class="panel-head"><div><h2>Telegram approvals</h2><p>Every finished video arrives on your phone with Approve, Reject and Remake buttons. You can also text the bot a topic to order a video. Free.</p></div><span class="need ${c.telegram ? 'ok' : ''}">${c.telegram ? 'Connected' : 'Recommended'}</span></div>
    ${c.telegram ? `<p class="note">Connected to @${esc(c.telegram_bot || 'your bot')}. Send it any topic to make a video, or /status to see progress. For Flow videos, reply to each shot message with its clip.</p>`
    : c.telegram_token ? `<p class="note">Last step: open <a href="https://t.me/${esc(c.telegram_bot)}" target="_blank" rel="noopener">t.me/${esc(c.telegram_bot || 'your bot')}</a> in Telegram and press <b>Start</b>. This page updates by itself.</p>`
    : `<ol class="steps"><li>In Telegram, open <a href="https://t.me/BotFather" target="_blank" rel="noopener">@BotFather</a> and send <b>/newbot</b>.</li><li>Pick a name and a username ending in "bot". BotFather replies with a token.</li><li>Paste the token below and press Save.</li></ol>`}
    <div class="form-row"><label class="field"><span class="label">${c.telegram_token ? 'Bot token saved. Paste a new one to switch bots.' : 'Bot token'}</span><input type="text" class="secret" id="k-telegram" autocomplete="off" spellcheck="false" data-lpignore="true" placeholder="123456:ABC..."></label>
      <button class="btn ${c.telegram_token ? '' : 'primary'}" data-act="save-key" data-id="telegram" data-key="telegram_token">Save</button></div></div>`;
}
// ---------- profiles and the "Post to" picker ----------
const PL = [['youtube', 'YouTube'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'], ['x', 'X']];
const hue = p => [...String(p.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 17);
const avatar = p => `<span class="avatar" style="--h:${hue(p)}">${esc((p.name || '?').trim().charAt(0).toUpperCase())}</span>`;
const readyT = t => { const [pid, pl] = splitT(t); const p = S.st.profiles.find(x => x.id === pid); return !!(p && p[pl] && p[pl].ok); };
const splitT = t => { const i = String(t).lastIndexOf(':'); return [String(t).slice(0, i), String(t).slice(i + 1)]; };
const labelT = t => { const [pid, pl] = splitT(t); const p = S.st.profiles.find(x => x.id === pid); return `${p ? p.name : '?'} · ${(PL.find(x => x[0] === pl) || [0, pl])[1]}`; };
const defTargets = () => (S.st.settings.default_targets || []).filter(readyT);

function tpGet(scope) {
  if (scope === 'up') return S.up.targets;
  if (scope === 'draft') return S.draft.targets;
  if (scope === 'sf') return S.editing.targets;
  if (scope === 'job') return S.jobTargets;
  return S.st.settings.default_targets || [];
}
function tpSet(scope, list) {
  if (scope === 'up') S.up.targets = list;
  else if (scope === 'draft') S.draft.targets = list;
  else if (scope === 'sf') S.editing.targets = list;
  else if (scope === 'job') S.jobTargets = list;
  else { S.st.settings.default_targets = list; busy(null, async () => { await api('/api/settings', { body: { default_targets: list } }); toast('Saved.'); }); }
}
function targetPicker(scope, note = '') {
  const sel = tpGet(scope) || [];
  const profs = S.st.profiles;
  if (!profs.some(p => PL.some(([k]) => p[k].ok))) return `<div class="banner"><span>No accounts are connected yet. Connect YouTube, Instagram, Facebook, LinkedIn or X for a profile first.</span><a class="btn primary" href="#connections">Open connections</a></div>`;
  return `<div class="tpicker">${profs.map(p => {
    const avail = PL.filter(([k]) => p[k].ok || sel.includes(p.id + ':' + k));
    const on = avail.filter(([k]) => sel.includes(p.id + ':' + k));
    return `<div class="tp-row ${on.length ? 'on' : ''}">
      <div class="tp-who">${avatar(p)}<b>${esc(p.name)}</b>${avail.length > 1 ? `<button class="linkish" data-act="tp-all" data-v="${scope}|${p.id}">${on.length === avail.length ? 'Clear' : 'All'}</button>` : ''}</div>
      <div class="tp-chips">${avail.length ? avail.map(([k, l]) => { const t = p.id + ':' + k, o = sel.includes(t), bad = !p[k].ok;
        return `<button class="tchip ${o ? 'on' : ''} ${bad ? 'bad' : ''}" data-act="tp" data-v="${scope}|${t}" aria-pressed="${o}" title="${esc(bad ? 'Not connected any more' : p[k].label)}"><span class="pl-${k} mini"></span>${l}${o ? icon('check') : ''}</button>`; }).join('')
        : `<a class="muted small" href="#connections">No accounts yet. Connect</a>`}</div></div>`; }).join('')}${note ? `<p class="muted small" style="margin:4px 0 0">${note}</p>` : ''}</div>`;
}
function targetSummary(list) {
  const ok = (list || []).filter(readyT);
  if (!ok.length) return 'Nowhere yet';
  const by = {};
  for (const t of ok) { const [pid, pl] = splitT(t); (by[pid] = by[pid] || []).push((PL.find(x => x[0] === pl) || [0, pl])[1]); }
  return Object.entries(by).map(([pid, ls]) => `${(S.st.profiles.find(p => p.id === pid) || {}).name}: ${ls.join(', ')}`).join(' · ');
}

// ---------- connections ----------
function accRow(p, k, label, sub) {
  const a = p[k === 'meta' ? 'facebook' : k] || {};
  const open = S.accOpen === p.id + ':' + k;
  const ok = k === 'meta' ? p.facebook.ok : a.ok;
  const problem = k === 'meta' ? p.facebook.problem : a.problem;
  let status;
  if (problem) status = `<span class="err-text">Needs reconnect</span>`;
  else if (k === 'meta') status = ok ? `${esc(p.facebook.label)}${p.instagram.ok ? ' · ' + esc(p.instagram.label) : ' · <span class="muted">no Instagram linked</span>'}` : '<span class="muted">Not connected</span>';
  else if (k === 'linkedin' && ok) { const d = Math.ceil((a.expires_at - Date.now()) / 864e5); status = `${esc(a.label)} <span class="${d <= 7 ? 'err-text' : 'muted'}">· ${d} days left</span>`; }
  else if (k === 'linkedin' && a.was) status = '<span class="err-text">60-day login ended</span>';
  else status = ok ? esc(a.label || 'Connected') : '<span class="muted">Not connected</span>';
  return `<div class="acc ${ok && !problem ? 'ok' : ''} ${open ? 'open' : ''}">
    <button class="acc-head" data-act="acc-open" data-v="${p.id}:${k}" aria-expanded="${open}">
      <span class="acc-icons">${k === 'meta' ? '<span class="pl-instagram mini"></span><span class="pl-facebook mini"></span>' : `<span class="pl-${k} mini"></span>`}</span>
      <span class="acc-name"><b>${label}</b><small>${status}</small></span>
      ${sub ? `<span class="paid">${sub}</span>` : ''}<i class="dot ${ok && !problem ? 'ok' : problem ? 'bad' : ''}"></i></button>
    ${open ? `<div class="acc-body">${accBody(p, k)}</div>` : ''}</div>`;
}
function accBody(p, k) {
  const c = S.st.connections, pid = p.id;
  const acts = (pl, ok) => ok ? `<div class="btn-row"><button class="btn sm" data-act="acc-check" data-v="${pid}:${pl}">Check</button><button class="btn quiet sm danger" data-act="acc-disc" data-v="${pid}:${pl}">Disconnect</button></div>` : '';
  if (k === 'youtube') {
    const y = (S.yt || {})[pid] || {}, a = p.youtube;
    const ready = c.youtube_client || a.own_client;
    let main = '';
    if (!ready) main = `<p class="note">First save your Google keys once in <a href="#connections/keys">App keys, YouTube</a>.</p>`;
    else if (y.state === 'waiting') main = `<div class="code-box"><div><span class="label">On any phone or computer, open <a href="${esc(y.url)}" target="_blank" rel="noopener">${esc(y.url)}</a> and enter</span><br><strong>${esc(y.code)}</strong></div><span class="muted small">Sign in with ${esc(p.name)}'s Google account, choose the channel and press Allow. This updates by itself.</span></div>`;
    else main = `${y.state === 'error' || y.state === 'expired' ? `<p class="err">${esc(y.error || 'The code expired.')} Try again.</p>` : ''}${a.problem ? `<p class="err">${esc(a.problem)}</p>` : ''}<div class="btn-row"><button class="btn ${a.ok ? '' : 'primary'}" data-act="yt-start" data-v="${pid}">${a.ok ? 'Reconnect' : 'Connect YouTube channel'}</button></div>`;
    return `${main}${acts('youtube', a.ok)}
      <details><summary>Own Google keys for this profile (optional)</summary><p class="muted small">Every Google project allows about 6 uploads a day. Profiles that use the shared keys share that limit. Give a busy profile its own project (same steps as App keys) to get its own 6 a day. Changing keys needs a new sign-in.</p>
      <div class="form-grid"><label class="field"><span class="label">Client ID</span><input id="yc-id-${pid}" autocomplete="off" spellcheck="false" placeholder="${a.own_client ? 'Own keys saved' : 'Leave empty to use the shared keys'}"></label>
      <label class="field"><span class="label">Client secret</span><input type="text" class="secret" id="yc-sec-${pid}" autocomplete="off" spellcheck="false" data-lpignore="true"></label></div>
      <div class="btn-row" style="margin-top:10px"><button class="btn sm" data-act="yt-own" data-v="${pid}">${a.own_client ? 'Replace own keys' : 'Save own keys'}</button>${a.own_client ? `<button class="btn quiet sm" data-act="yt-own-clear" data-v="${pid}">Use shared keys</button>` : ''}</div></details>`;
  }
  if (k === 'meta') {
    const f = p.facebook, day = t => new Date(t * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    if (!c.meta_app) return `<p class="note">First save the Meta App ID and secret once in <a href="#connections/keys">App keys, Instagram and Facebook</a>.</p>`;
    const health = !f.ok ? '' : f.problem ? `<p class="err">${esc(f.problem)}</p>`
      : f.expires > 0 ? `<p class="err">This login expires on <b>${day(f.expires)}</b>. Reconnect below and it will never expire.</p>`
      : f.expires === 0 ? `<p class="ok-note">${icon('check')}Login does not expire.${f.data_expires ? ` Facebook asks for a reconnect every 90 days (next by ${day(f.data_expires)}).` : ''}</p>` : '';
    return `${health}${f.missing?.length ? `<p class="err">Missing permissions: ${esc(f.missing.join(', '))}.</p>` : ''}
      ${f.ok && f.pages.length > 1 ? `<label class="field"><span class="label">Post to this Page</span><select class="meta-page" data-pid="${pid}">${f.pages.map(pg => `<option value="${esc(pg.id)}" ${pg.id === f.page_id ? 'selected' : ''}>${esc(pg.name)}${pg.ig ? ' (Instagram @' + esc(pg.ig) + ')' : ''}</option>`).join('')}</select></label>` : ''}
      ${acts('meta', f.ok)}
      <details ${f.ok && !f.problem && !(f.expires > 0) ? '' : 'open'}><summary>${f.ok ? 'Reconnect with a new token' : 'Connect'}</summary><ol class="steps small">
        <li>${esc(p.name)}'s Instagram must be a <b>Professional account</b> linked to their <b>Facebook Page</b>.</li>
        <li>Open <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener">Graph API Explorer</a> while logged in to the Facebook account that manages that Page. Pick your KMR Studio app and add: <code>pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish, business_management</code>.</li>
        <li>Press <b>Generate Access Token</b>, choose the Page and its Instagram, copy the token and paste it here.</li></ol>
        <p class="muted small">Someone else's Page: they either make your Facebook account an admin of their Page, or you add them as a <b>Tester</b> in your Meta app (App roles) and they generate the token themselves.</p>
        <div class="form-row"><label class="field"><span class="label">Access token</span><input type="text" class="secret" id="mt-${pid}" autocomplete="off" spellcheck="false" data-lpignore="true" placeholder="Paste here"></label>
        <button class="btn primary" data-act="meta-connect" data-v="${pid}">${f.ok ? 'Reconnect' : 'Connect'}</button></div></details>`;
  }
  // linkedin, x
  const a = p[k], name = k === 'x' ? 'X' : 'LinkedIn';
  const keysOk = k === 'x' ? c.x_app : c.linkedin_app;
  if (!S.st.callback_url) return `<p class="note">First put the studio online: <a href="#settings/online">Settings, Online access</a>. LinkedIn and X can only connect to a studio that is online.</p>`;
  if (!keysOk) return `<p class="note">First save the <b>${name}</b> app keys in <a href="#connections/keys">Connections, App keys</a>.</p>`;
  return `${a.problem ? `<p class="err">${esc(a.problem)}</p>` : ''}
    ${k === 'linkedin' ? `<p class="muted small">Posts go to ${esc(p.name)}'s personal LinkedIn profile. LinkedIn logins last 60 days; KMR Studio reminds you on Telegram a week before, and reconnecting is one click.</p>` : `<p class="muted small">X charges about US$0.02 (₹2) per video post from credits you buy in the X Developer Console. There is no free X option any more.</p>`}
    <div class="btn-row"><button class="btn ${a.ok ? '' : 'primary'}" data-act="oauth-go" data-v="${pid}:${k}">${a.ok || a.was ? 'Reconnect' : 'Connect ' + name}</button>
      <button class="btn quiet" data-act="oauth-link" data-v="${pid}:${k}">${icon('copy')}Copy sign-in link for ${esc(p.name)}</button></div>
    <p class="muted small">If ${esc(p.name)} is not with you, send them the copied link (WhatsApp is fine). They sign in on their own phone and it connects here by itself.</p>
    ${acts(k, a.ok)}`;
}
function profileCard(p) {
  const n = PL.filter(([k]) => p[k].ok).length;
  return `<section class="panel profile" id="prof-${p.id}">
    <div class="prof-head">${avatar(p)}<div class="prof-t"><h2>${esc(p.name)}</h2><span class="muted small">${n ? n + ' of 5 connected' : 'No accounts connected yet'}</span></div>
      <div class="btn-row"><button class="btn quiet sm" data-act="prof-rename" data-v="${p.id}">Rename</button>${S.st.profiles.length > 1 ? `<button class="btn quiet sm danger" data-act="prof-del" data-v="${p.id}">Remove</button>` : ''}</div></div>
    <div class="accs">${accRow(p, 'youtube', 'YouTube')}${accRow(p, 'meta', 'Instagram and Facebook')}${accRow(p, 'linkedin', 'LinkedIn')}${accRow(p, 'x', 'X (Twitter)', 'paid')}</div></section>`;
}
function appKeys() {
  const s = S.st.settings, c = S.st.connections;
  const f = (id, label, val, secret) => `<label class="field"><span class="label">${label}${secret && val ? ' (saved)' : ''}</span><input ${secret ? 'type="text" class="secret"' : ''} id="ak-${id}" value="${secret ? '' : esc(val || '')}" autocomplete="off" spellcheck="false" data-lpignore="true" ${secret && val ? 'placeholder="Leave empty to keep the saved one"' : ''}></label>`;
  const box = (key, title, ok, intro, steps, fields, ids) => `<details class="panel keybox" id="keys-${key}" ${S.keysOpen === key ? 'open' : ''}><summary><span class="need ${ok ? 'ok' : ''}">${ok ? 'Done' : 'To do'}</span><b>${title}</b></summary>
    <p class="muted small">${intro}</p><ol class="steps small">${steps.map(x => `<li>${x}</li>`).join('')}</ol><div class="form-grid">${fields}</div>
    <div class="btn-row" style="margin-top:12px"><button class="btn primary sm" data-act="save-keys" data-v="${ids}">Save</button></div></details>`;
  const ret = S.st.callback_url || 'https://studio.kmr-groups.com/oauth/callback';
  return `<p class="muted con-intro" id="app-keys">One-time setup, shared by all profiles. Open each box and follow the steps.</p>
  ${S.st.callback_url ? '' : '<div class="banner"><span>LinkedIn and X need the studio online first.</span><a class="btn primary" href="#settings/online">Open online access</a></div>'}
  <div class="panels">
  ${box('google', 'YouTube: Google keys', c.youtube_client, 'Lets every profile connect a YouTube channel with a short code. Free.', [
    'Open <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud console</a> and create a project named KMR Studio.',
    'Enable <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener">YouTube Data API v3</a>.',
    'In <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noopener">Google Auth Platform</a> choose <b>External</b>, fill in the app name and email. In <b>Audience</b> press <b>Publish app</b> (otherwise sign-ins end every 7 days).',
    'In <b>Clients</b>, create one of type <b>TVs and Limited Input devices</b> and copy the ID and secret here.'],
    f('yt_client_id', 'Client ID', s.yt_client_id) + f('yt_client_secret', 'Client secret', s.yt_client_secret, true), 'yt_client_id,yt_client_secret')}
  ${box('meta', 'Instagram and Facebook: Meta app', c.meta_app, 'One Meta app serves every profile. Free.', [
    'Open <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com/apps</a>, <b>Create app</b>, <b>Other</b>, <b>Business</b>, name it KMR Studio.',
    'In <b>App settings, Basic</b>, add a Privacy Policy URL (any page of your website), save, and switch the app to <b>Live</b>.',
    'Copy the <b>App ID</b> and <b>App secret</b> here.'],
    f('meta_app_id', 'App ID', s.meta_app_id) + f('meta_app_secret', 'App secret', s.meta_app_secret, true), 'meta_app_id,meta_app_secret')}
  ${box('linkedin', 'LinkedIn app', c.linkedin_app, 'Posts to personal LinkedIn profiles. Free. (Posting to company pages needs special approval from LinkedIn.)', [
    'Open <a href="https://www.linkedin.com/developers/apps/new" target="_blank" rel="noopener">LinkedIn Developers, Create app</a>. It asks for a LinkedIn company Page (your KMR Group page works) and a logo.',
    'In <b>Products</b>, add <b>Share on LinkedIn</b> and <b>Sign In with LinkedIn using OpenID Connect</b>.',
    `In <b>Auth</b>, under Authorized redirect URLs, add <code>${esc(ret)}</code> exactly.`,
    'Copy the <b>Client ID</b> and <b>Primary Client Secret</b> here.'],
    f('li_client_id', 'Client ID', s.li_client_id) + f('li_client_secret', 'Client secret', s.li_client_secret, true), 'li_client_id,li_client_secret')}
  ${box('x', 'X (Twitter) app, paid by X', c.x_app, 'X has no free option since February 2026: about US$0.02 per video post from prepaid credits. Skip this if you do not want to pay.', [
    'Open the <a href="https://console.x.com" target="_blank" rel="noopener">X Developer Console</a>, create an app and buy a small amount of credits.',
    `In <b>User authentication settings</b>: OAuth 2.0 on, type <b>Web App</b>, permissions <b>Read and write</b>, Callback URL <code>${esc(ret)}</code>, Website any of your sites.`,
    'Copy the <b>OAuth 2.0 Client ID</b> and <b>Client Secret</b> here.'],
    f('x_client_id', 'Client ID', s.x_client_id) + f('x_client_secret', 'Client secret', s.x_client_secret, true), 'x_client_id,x_client_secret')}
  </div>`;
}
const CON_TABS = [['profiles', 'Profiles and accounts', 'studio'], ['keys', 'App keys', 'settings'], ['services', 'Services', 'tools']];
function connections() {
  const t = CON_TABS.some(x => x[0] === sub()) ? sub() : 'profiles';
  const body = t === 'profiles' ? `<div class="con-intro"><p class="muted">One profile for every person or brand you post for. Open an account to connect it. When you post, you tick which profiles and platforms get the video.</p><button class="btn primary" data-act="prof-add">${icon('spark')}Add profile</button></div>
      <div class="profiles">${S.st.profiles.map(profileCard).join('')}</div>`
    : t === 'keys' ? appKeys()
    : `<p class="muted con-intro">Script writing, approvals and video tools. Each is free unless it says otherwise.</p><div class="panels">${simplePanel(SIMPLE[0])}${simplePanel(SIMPLE[1])}${telegramPanel()}${kagglePanel()}${SIMPLE.slice(2).map(simplePanel).join('')}${veoPanel()}</div>`;
  return `<div class="page-head"><div><h1>Connections</h1><p>Profiles, their social accounts, and the services KMR Studio uses.</p></div></div>
  ${subtabs('connections', CON_TABS, t)}<div class="con-body">${body}</div>`;
}
function veoPanel() {
  const c = S.st.connections, s = S.st.settings;
  const ready = !!c.veo_model;
  return `<div class="panel"><div class="panel-head"><div><h2>Veo cinematic video (automatic, paid)</h2><p>Google's Veo films real cinematic 8-second shots where characters speak, fully automatically. Google charges per second of video. KMR Studio stops when your monthly limit is reached. Your Flow Pro plan cannot be used here; for free Veo use the Flow engine in the Studio.</p></div><span class="need ${ready ? 'ok' : ''}">${ready ? 'Ready' : 'Optional'}</span></div>
    ${ready ? `<p class="note">Using <b>${esc(c.veo_model)}</b>. This month: about <b>$${c.veo_spent}</b> of your $${esc(s.veo_monthly_cap)} limit.</p>` : `<ol class="steps">
      <li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> with a <b>personal Gmail</b> account.</li>
      <li>Turn on <b>billing</b> for the key's project and add a payment card (Veo has no free tier).</li>
      <li>Paste that key below, or leave it empty to try your current Gemini key. Then press <b>Save and test</b>. Testing costs nothing.</li></ol>`}
    <div class="form-row"><label class="field"><span class="label">${c.veo_key ? 'Veo key saved ' + esc(s.veo_key) + '. Paste a new one to replace it.' : 'Veo API key (optional)'}</span><input type="text" class="secret" id="k-veo" autocomplete="off" spellcheck="false" data-lpignore="true" placeholder="Leave empty to use the Gemini key"></label>
      <button class="btn ${ready ? '' : 'primary'}" data-act="veo-save">Save and test</button></div>
    <div class="form-grid" style="margin-top:14px">
      <label class="field"><span class="label">Quality</span><select data-set="veo_tier">${[['lite', 'Lite, cheapest (about $0.05 a second)'], ['fast', 'Fast, better (about $0.10 a second)'], ['standard', 'Standard, best (about $0.40 a second)']].map(([v, l]) => `<option value="${v}" ${s.veo_tier === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Resolution</span><select data-set="veo_resolution">${['720p', '1080p'].map(v => `<option ${s.veo_resolution === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Monthly limit (US dollars)</span><input type="text" inputmode="decimal" data-set="veo_monthly_cap" value="${esc(s.veo_monthly_cap)}"></label>
    </div><p class="muted small">Prices are estimates from Google's public list; your Google bill is the final word.</p></div>`;
}
function kagglePanel() {
  const c = S.st.connections, s = S.st.settings;
  return `<div class="panel"><div class="panel-head"><div><h2>Kaggle free GPU</h2><p>Powers AI motion (characters really move) and the Text to Video and Image to Video tools. About 30 free GPU hours every week. No card.</p></div><span class="need ${c.kaggle ? 'ok' : ''}">${c.kaggle ? 'Connected' : 'For AI motion'}</span></div>
    ${c.kaggle ? `<p class="note">Connected as <b>${esc(s.kaggle_username)}</b>. Turn on AI motion in the Studio. A video with motion takes about 15 to 60 minutes longer.</p>` : `<ol class="steps">
      <li>Create a free account at <a href="https://www.kaggle.com" target="_blank" rel="noopener">kaggle.com</a> (a personal Gmail works best).</li>
      <li>Open <a href="https://www.kaggle.com/settings" target="_blank" rel="noopener">Kaggle Settings</a> and complete <b>Phone verification</b>. Kaggle only gives GPUs to verified accounts.</li>
      <li>On the same page, under <b>API</b>, press <b>Create New Token</b> (choose the legacy <i>kaggle.json</i> key if asked). Open the downloaded file with Notepad.</li>
      <li>Copy the <b>username</b> and <b>key</b> into the boxes below.</li></ol>`}
    <div class="two-col" style="margin-top:10px">
      <label class="field"><span class="label">Kaggle username</span><input id="kg-user" value="${esc(s.kaggle_username)}" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span class="label">${s.kaggle_key ? 'Key saved ' + esc(s.kaggle_key) + '. Paste a new one to replace it.' : 'Key'}</span><input type="text" class="secret" id="kg-key" autocomplete="off" spellcheck="false" data-lpignore="true"></label>
    </div><div class="btn-row" style="margin-top:12px"><button class="btn ${c.kaggle ? '' : 'primary'}" data-act="kg-save">Save and test</button></div></div>`;
}

// ---------- trends ----------
const fmtNum = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n);
function trends() {
  const d = S.trdraft || (S.trdraft = { niche: S.st.settings.default_niche || '', language: S.st.settings.default_language, days: 30, shorts: true, region: 'IN' });
  const list = S.trendList || [];
  const cur = list.find(t => t.id === S.trendSel) || list[0];
  return `<div class="page-head"><div><h1>Trends</h1><p>See what is taking off in your niche right now, why it works, and get original ideas built on the same patterns.</p></div></div>
  ${S.st.connections.youtube ? '' : '<div class="banner"><span>Trends uses your YouTube connection to search YouTube.</span><a class="btn primary" href="#connections">Connect YouTube</a></div>'}
  <div class="panel"><div class="form-grid">
    <label class="field"><span class="label">Niche or topic</span><input id="tr-niche" value="${esc(d.niche)}" placeholder="Tamil kids moral stories"></label>
    <label class="field"><span class="label">Language</span><select id="tr-lang">${langOptions(d.language)}</select></label>
    <label class="field"><span class="label">Period</span><select id="tr-days">${[[7, 'Last 7 days'], [30, 'Last 30 days'], [90, 'Last 90 days']].map(([v, l]) => `<option value="${v}" ${d.days === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span class="label">Type</span><select id="tr-type"><option value="shorts" ${d.shorts ? 'selected' : ''}>Shorts</option><option value="long" ${d.shorts ? '' : 'selected'}>Long videos</option></select></label>
    <label class="field"><span class="label">Country</span><select id="tr-region">${[['IN', 'India'], ['US', 'United States'], ['GB', 'United Kingdom'], ['AE', 'UAE'], ['SG', 'Singapore'], ['MY', 'Malaysia'], ['LK', 'Sri Lanka']].map(([v, l]) => `<option value="${v}" ${d.region === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  </div><div class="btn-row" style="margin-top:14px"><button class="btn primary" data-act="tr-run">Analyse what's working</button><span class="muted small" style="align-self:center">Takes about 30 seconds.</span></div></div>
  ${list.length ? `<div class="chips" style="margin:22px 0 6px">${list.map(t => `<button class="chip ${cur && t.id === cur.id ? 'on' : ''}" data-act="tr-sel" data-id="${t.id}">${esc(t.niche)} <span class="muted">${new Date(t.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span></button>`).join('')}</div>` : ''}
  ${cur ? trendReport(cur) : '<p class="empty" style="margin-top:22px">Run your first analysis above. Autopilot can also use these ideas automatically.</p>'}`;
}
function trendReport(t) {
  const i = t.insights || {};
  return `<section class="block" style="margin-top:16px">
    <div class="panel"><div class="panel-head"><div><h2>${esc(t.niche)}</h2><p>${t.shorts ? 'Shorts' : 'Long videos'}, ${esc(t.language)}, last ${t.days} days, ${t.videos.length} fastest-growing videos</p></div><button class="btn quiet danger" data-act="tr-del" data-id="${t.id}">Delete</button></div>
      <p style="margin:10px 0 0">${esc(i.summary || '')}</p>
      <div class="two-col" style="margin-top:16px">
        <div><span class="label">What's working</span><ul class="plist">${(i.patterns || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>
        <div><span class="label">Title formulas</span><ul class="plist">${(i.title_formulas || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul>
          ${i.best_length_seconds ? `<p class="muted small">Best length right now: about ${esc(i.best_length_seconds)} seconds.</p>` : ''}</div>
      </div></div>
  </section>
  <section class="block"><div class="block-head"><h2>Ideas for you</h2><span class="muted small">Original ideas based on these patterns</span></div>
    <div class="idea-grid">${(i.ideas || []).map((x, n) => `<article class="panel idea-card ${(t.used || []).includes(n) ? 'used' : ''}">
      <h3>${esc(x.title)}</h3><p class="muted small" style="margin:6px 0">Hook: ${esc(x.hook)}</p><p class="small" style="margin:0 0 10px">${esc(x.why)}</p>
      <div class="chips" style="margin-bottom:12px"><span class="chip">${esc(x.format || '9:16')}</span><span class="chip">${esc(x.length_seconds || 45)} sec</span><span class="chip">${esc(S.st.styles[x.style] || 'Cartoon')}</span></div>
      <button class="btn ${(t.used || []).includes(n) ? '' : 'primary'}" data-act="tr-make" data-id="${t.id}" data-v="${n}">${(t.used || []).includes(n) ? 'Make again' : 'Make this video'}</button></article>`).join('')}</div></section>
  <section class="block"><div class="block-head"><h2>Fastest-growing videos</h2></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Video</th><th>Views</th><th>Per day</th><th>Length</th></tr></thead><tbody>
    ${t.videos.map(v => `<tr><td><a href="${esc(v.url)}" target="_blank" rel="noopener"><img src="${esc(v.thumb)}" alt="" loading="lazy"></a></td>
      <td><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)}</a><br><span class="muted small">${esc(v.channel)}</span></td>
      <td>${fmtNum(v.views)}</td><td>${fmtNum(v.perDay)}</td><td>${v.seconds}s</td></tr>`).join('')}</tbody></table></div></section>`;
}
async function loadTrends() { S.trendList = (await api('/api/trends')).trends; }

// ---------- tools ----------
function tools() {
  const c = S.st.connections, d = S.tdraft || (S.tdraft = { prompt: '', ratio: '9:16', style: 'cartoon', count: 2, vprompt: '', vratio: '9:16', seconds: 4, image: null, imageName: '' });
  const list = S.tools || [];
  return `<div class="page-head"><div><h1>Tools</h1><p>Make single pictures and short AI clips. Pictures are instant; clips run on your free Kaggle GPU and take a few minutes.</p></div></div>
  <div class="two-col">
    <div class="panel"><h2>Text to image</h2>
      <label class="field" style="margin-top:14px"><span class="label">Describe the picture</span><textarea id="t-prompt" rows="3" placeholder="A brave little elephant exploring a glowing jungle at night">${esc(d.prompt)}</textarea></label>
      <div class="form-grid" style="margin-top:12px">
        <label class="field"><span class="label">Format</span><select id="t-ratio">${RATIOS.map(([r, l]) => `<option value="${r}" ${d.ratio === r ? 'selected' : ''}>${r} ${l}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Look</span><select id="t-style">${Object.entries(S.st.styles).filter(([k]) => k !== 'stock').map(([k, l]) => `<option value="${k}" ${d.style === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
        <label class="field"><span class="label">How many</span><select id="t-count">${[1, 2, 3, 4].map(n => `<option ${d.count === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      </div>
      <div class="btn-row" style="margin-top:14px"><button class="btn primary" data-act="t-image">Make pictures</button></div></div>
    <div class="panel"><h2>Text or image to video</h2>
      ${c.kaggle ? '' : '<p class="note" style="margin-top:10px">Needs the free Kaggle GPU. <a href="#connections">Connect Kaggle</a> first.</p>'}
      <label class="field" style="margin-top:14px"><span class="label">Describe the motion</span><textarea id="v-prompt" rows="3" placeholder="The elephant lifts its trunk and walks forward as fireflies swirl around">${esc(d.vprompt)}</textarea></label>
      <div class="form-grid" style="margin-top:12px">
        <label class="field"><span class="label">Start from a picture (optional)</span><label class="btn quiet" style="justify-content:center">${d.imageName ? esc(d.imageName.slice(0, 22)) : 'Choose picture'}<input type="file" id="v-image" accept="image/*" hidden></label></label>
        <label class="field"><span class="label">Format</span><select id="v-ratio">${RATIOS.map(([r, l]) => `<option value="${r}" ${d.vratio === r ? 'selected' : ''}>${r} ${l}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Length</span><select id="v-sec">${[2, 3, 4].map(n => `<option value="${n}" ${d.seconds === n ? 'selected' : ''}>${n} sec</option>`).join('')}</select></label>
      </div>
      <div class="btn-row" style="margin-top:14px"><button class="btn primary" data-act="t-video" ${c.kaggle ? '' : 'disabled'}>Make clip</button>${d.image ? '<button class="btn quiet" data-act="t-clear-img">Remove picture</button>' : ''}</div></div>
  </div>
  <div class="panel" style="margin-top:16px"><div class="panel-head"><div><h2>Long video to Shorts</h2><p>Upload a long video (a podcast, class, vlog or speech). KMR Studio transcribes it, picks the best moments, and turns each into a vertical Short with subtitles. The Shorts land in your Library for approval, then post like any other video.</p></div></div>
    <div class="form-grid" style="margin-top:12px">
      <label class="field"><span class="label">Video file</span><label class="btn quiet" style="justify-content:center">${d.repName ? esc(d.repName.slice(0, 26)) : 'Choose video'}<input type="file" id="rep-file" accept="video/*" hidden></label></label>
      <label class="field"><span class="label">How many Shorts</span><select id="rep-count">${[1, 2, 3, 5, 8].map(n => `<option ${(d.repCount || 3) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Length of each</span><select id="rep-len">${[['15-30', '15 to 30 sec'], ['25-60', '25 to 60 sec'], ['45-90', '45 to 90 sec']].map(([v, l]) => `<option value="${v}" ${(d.repLen || '25-60') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Framing</span><select id="rep-frame"><option value="fit" ${(d.repFrame || 'fit') === 'fit' ? 'selected' : ''}>Whole picture on blurred background</option><option value="crop" ${d.repFrame === 'crop' ? 'selected' : ''}>Zoom to fill (crop sides)</option></select></label>
    </div>
    <div class="progress" id="rep-prog" hidden><i></i></div>
    <div class="btn-row" style="margin-top:14px"><button class="btn primary" data-act="rep-go" ${d.repSource ? '' : 'disabled'}>Make Shorts</button><label class="switch"><input type="checkbox" id="rep-subs" ${d.repSubs === false ? '' : 'checked'}><span></span>Subtitles</label></div></div>

  <section class="block" style="margin-top:34px"><div class="block-head"><h2>Your creations</h2></div>
  ${list.length ? `<div class="grid">${list.map(toolCard).join('')}</div>` : '<p class="empty">Pictures and clips you make here will appear here.</p>'}</section>`;
}
function toolCard(t) {
  const r = (t.ratio || '1:1').replace(':', ' / ');
  const media = t.status === 'done' ? (t.kind === 'image' ? `<img src="/tools/${t.file}" alt="" loading="lazy">` : `<video src="/tools/${t.file}" controls playsinline preload="metadata" style="width:100%;height:100%;object-fit:cover"></video>`)
    : `<div class="thumb-empty">${t.status === 'failed' ? 'Failed: ' + esc(t.note) : esc(t.note || 'Waiting')}</div>`;
  const label = { image: 'Picture', t2v: 'Text to video', i2v: 'Image to video', repurpose: 'Video to Shorts' }[t.kind];
  if (t.kind === 'repurpose') return `<article class="vcard"><div class="thumb" style="aspect-ratio:9 / 16"><div class="thumb-empty">${t.status === 'failed' ? 'Failed: ' : ''}${esc(t.note || 'Waiting')}</div><span class="badge ${t.status === 'failed' ? 'b-failed' : t.status === 'done' ? 'b-published' : 'b-review'}">${label}</span></div>
    <p class="muted small" style="margin-top:8px">${esc(t.prompt)}</p>
    <div class="btn-row" style="margin-top:6px">${t.status === 'done' ? '<a class="btn quiet" href="#library">Open Library</a>' : ''}<button class="btn quiet danger" data-act="t-del" data-id="${t.id}">Delete</button></div></article>`;
  return `<article class="vcard"><div class="thumb" style="aspect-ratio:${r}">${media}<span class="badge ${t.status === 'failed' ? 'b-failed' : t.status === 'done' ? '' : 'b-review'}">${label}</span></div>
    <p class="muted small" style="margin-top:8px">${esc(t.prompt.slice(0, 90))}</p>
    <div class="btn-row" style="margin-top:6px">${t.status === 'done' ? `<a class="btn quiet" href="/tools/${t.file}" download>Download</a>` : ''}<button class="btn quiet danger" data-act="t-del" data-id="${t.id}">Delete</button></div></article>`;
}

// ---------- settings ----------
// ---------- settings (tabs) ----------
const sub = () => location.hash.slice(1).split('/')[1] || '';
const SET_TABS = [['setup', 'Setup checklist', 'check'], ['brand', 'Brand and account', 'spark'], ['video', 'Video style', 'film'], ['posting', 'Posting', 'send'], ['online', 'Online access', 'connections'], ['music', 'Music library', 'play'], ['updates', 'Updates and help', 'upload']];
const srow = (title, desc, control) => `<div class="srow"><div class="srow-t"><b>${title}</b>${desc ? `<p>${desc}</p>` : ''}</div><div class="srow-c">${control}</div></div>`;
const sel = (key, val, opts) => `<select data-set="${key}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const tog = (key, on) => `<label class="switch"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''}><span></span></label>`;
const subtabs = (base, tabs, cur) => `<nav class="subtabs" aria-label="Sections">${tabs.map(([k, l, ic]) => `<a href="#${base}/${k}" class="${cur === k ? 'on' : ''}">${ic ? icon(ic) : ''}<span>${l}</span></a>`).join('')}</nav>`;

function checklist() {
  const st = S.st, c = st.connections, anyAcc = st.profiles.some(p => PL.some(([k]) => p[k].ok));
  return [
    ['Add your logo', 'Shows in the menu, on the sign-in screen and as the phone app icon.', st.brand.logo, '#settings/brand'],
    ['Connect a script writer', 'Gemini or Groq writes scripts, titles and captions. Free.', c.writer, '#connections/services'],
    ['Connect Telegram', 'Approve videos from your phone and get alerts. Free.', c.telegram, '#connections/services'],
    ['Put the studio online', 'Open it on your phone from anywhere. Free, 4 guided steps.', st.online.funnel || (st.cf && st.cf.state === 'online'), '#settings/online'],
    ['Open it from studio.kmr-groups.com', 'One setting in Vercel, shown step by step (step 4).', st.online.door_ok, '#settings/online'],
    ['Save the app keys', 'One-time keys for YouTube, Instagram and Facebook, and LinkedIn.', c.youtube_client || c.meta_app || c.linkedin_app, '#connections/keys'],
    ['Connect accounts to profiles', 'Each person or brand gets a profile with its own YouTube, Instagram, Facebook, LinkedIn and X.', anyAcc, '#connections/profiles'],
    ['Choose where videos go by default', 'The accounts ticked in "Post to" when you make a new video.', defTargets().length > 0, '#settings/posting'],
    ['Add some music (optional)', 'Royalty-free tracks with a mood word in the file name.', st.music.length > 0, '#settings/music'],
    ['Make your first video', 'Type a topic in the Studio, or post your own video from Upload.', S.jobs.length > 0, '#studio']
  ];
}
function setupTab() {
  const items = checklist(), done = items.filter(i => i[2]).length;
  return `<div class="panel sgroup"><div class="setup-top"><div><h2>Set up KMR Studio</h2><p class="muted small">Work down the list. Each step opens the right place, with instructions there.</p></div>
    <div class="flow-meter" style="--p:${Math.round(100 * done / items.length)}"><b>${done}/${items.length}</b><small>done</small></div></div>
    <ol class="checklist">${items.map(([t, d, ok, href], i) => `<li class="${ok ? 'ok' : ''}"><span class="ck">${ok ? icon('check') : i + 1}</span><div><b>${t}</b><p>${d}</p></div><a class="btn ${ok ? 'quiet' : 'primary'} sm" href="${href}">${ok ? 'Change' : 'Set up'}</a></li>`).join('')}</ol></div>`;
}
function brandTab() {
  const b = S.st.brand, s = S.st.settings;
  const tzs = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'];
  if (!tzs.includes(s.timezone)) tzs.unshift(s.timezone);
  return `<div class="panel sgroup"><h2>Logo</h2>
    <div class="logo-box"><div class="logo-prev ${b.bg}">${b.logo ? `<img src="/brand/logo?v=${b.v}" alt="Your logo">` : '<span class="brand-mark big"></span>'}</div>
      <div class="logo-ctl"><p class="muted small">Use a PNG with a transparent background if you have one. It appears in the menu, on the sign-in screen and as the icon when you add KMR Studio to your phone's home screen.</p>
        <div class="btn-row"><label class="btn primary">${icon('upload')}${b.logo ? 'Change logo' : 'Upload logo'}<input type="file" id="logo-up" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden></label>${b.logo ? '<button class="btn quiet danger" data-act="logo-del">Remove</button>' : ''}</div>
        <div class="seg" role="group" aria-label="Logo background"><span class="muted small">Logo sits on</span><button class="${b.bg === 'light' ? 'on' : ''}" data-act="logo-bg" data-v="light">Light tile</button><button class="${b.bg === 'dark' ? 'on' : ''}" data-act="logo-bg" data-v="dark">Dark tile</button></div></div></div></div>
  <div class="panel sgroup"><h2>Account</h2>
    ${srow('Time zone', 'Autopilot runs at these local times.', sel('timezone', s.timezone, tzs.map(t => [t, t])))}
    <form id="pw-form" class="srow wide"><div class="srow-t"><b>Password</b><p>Use at least 6 characters. Anyone with the password can use the studio.</p></div>
      <div class="srow-c pw"><input type="password" id="pw-cur" placeholder="Current password" required><input type="password" id="pw-new" placeholder="New password" minlength="6" required><button class="btn">Change</button></div></form>
    ${srow('Sign out', 'Signs out on this device only.', '<button type="button" class="btn quiet" data-act="logout">Sign out</button>')}</div>`;
}
function videoTab() {
  const s = S.st.settings;
  return `<div class="panel sgroup"><h2>Picture and sound</h2>
    ${srow('Quality', '1080p looks sharper; 720p renders faster on slow computers.', sel('quality', s.quality, [['1080', '1080p (sharper)'], ['720', '720p (faster)']]))}
    ${srow('Subtitles', 'Burn easy-to-read subtitles into every video.', tog('burn_subtitles', s.burn_subtitles))}
    ${srow('Sound effects', 'Real sound effects on the right scenes (needs Freesound in Connections).', tog('sfx_enabled', s.sfx_enabled !== false))}
    ${srow('Background music', 'Which tracks from your music library to use.', sel('music_mode', s.music_mode || 'match', [['match', 'Only when a track fits the mood'], ['any', 'Any track from my library'], ['off', 'No music']]))}
    ${srow('Music volume', 'How loud the music is under the voice.', `<input type="range" min="0" max="0.4" step="0.02" value="${s.music_volume}" data-set="music_volume">`)}</div>
  <div class="panel sgroup"><h2>Cinematic and AI motion</h2>
    ${srow('Speech in Veo and Flow videos', 'Characters speak, or a steady narrator voice speaks over them (better for Tamil).', sel('cinematic_voice', s.cinematic_voice || 'veo', [['veo', 'Characters speak'], ['narrator', 'Narrator voice']]))}
    ${srow('AI motion by default', 'Characters really move, using the free Kaggle GPU. Slower.', tog('motion_default', s.motion_default))}
    ${srow('Motion scenes per video', 'More scenes use more of the free weekly GPU time.', sel('motion_max_scenes', s.motion_max_scenes, [2, 4, 6, 8, 12].map(n => [n, n + ' scenes' + (n === 6 ? ' (recommended)' : '')])))}</div>`;
}
function postingTab() {
  const s = S.st.settings;
  return `<div class="panel sgroup"><h2>Default "Post to"</h2><p class="muted small" style="margin:0 0 12px">Ticked for every new video in the Studio, Autopilot and Shorts. You can still change it per video. Saved as you tap.</p>${targetPicker('def')}</div>
  <div class="panel sgroup"><h2>Posting rules</h2>
    ${srow('Ask me before posting', 'New videos wait for your OK (on Telegram or in the Library) before going online.', `<label class="switch"><input type="checkbox" data-set="auto_approve" data-invert="1" ${s.auto_approve ? '' : 'checked'}><span></span></label>`)}
    ${srow('YouTube visibility', 'Public, unlisted (only people with the link) or private.', sel('yt_privacy', s.yt_privacy, [['public', 'Public'], ['unlisted', 'Unlisted'], ['private', 'Private']]))}</div>`;
}
function onlineTab() {
  const o = S.st.online, cf = S.st.cf;
  const door = o.door || 'https://studio.kmr-groups.com';
  const doorShort = door.replace(/^https?:\/\//, '');
  const cfOn = cf && cf.state === 'online';
  const live = o.funnel || cfOn;
  const addr = o.address || (cfOn ? cf.address : '');
  const step = (n, done, title, body, now) => `<li class="wz ${done ? 'ok' : now ? 'now' : ''}"><span class="ck">${done ? icon('check') : n}</span><div class="wz-b"><b>${title}</b>${body}</div></li>`;
  const now1 = !o.installed, now2 = o.installed && !o.logged_in, now3 = o.logged_in && !o.funnel, now4 = o.funnel && !o.door_ok;
  return `<div class="panel sgroup online-card ${live ? 'online' : ''}">
    <div class="setup-top"><div><h2>Open KMR Studio from anywhere</h2><p class="muted small">Four steps, about 10 minutes, once. Free. Nothing changes on your domain or at Squarespace. This computer must stay on.</p></div>
      <span class="state-pill ${live ? 'ok' : ''}"><i class="dot ${live ? 'ok' : ''}"></i>${live ? 'Online' : 'Not online'}</span></div>
    ${o.door_ok ? `<a class="big-link" href="${esc(door)}" target="_blank" rel="noopener">${esc(doorShort)}</a>` : addr ? `<a class="big-link" href="${esc(addr)}" target="_blank" rel="noopener">${esc(addr.replace('https://', ''))}</a>` : ''}
    ${o.message ? `<p class="err">${esc(o.message)}</p>` : ''}
    <ol class="wizard">
      ${step(1, o.installed, 'Install Tailscale', o.installed ? '<p>Installed.</p>' : `<p>Tailscale is a free app that gives this computer a safe web address. Download it, run the installer and press <b>Install</b>.</p>
        <div class="btn-row"><a class="btn primary" href="${esc(o.download || 'https://tailscale.com/download/windows')}" target="_blank" rel="noopener">Download Tailscale</a><button class="btn" data-act="on-check">I installed it, check again</button></div>`, now1)}
      ${step(2, o.logged_in, 'Sign in to Tailscale', o.logged_in ? '<p>Signed in.</p>' : o.installed ? `<p>Press <b>Sign in</b>, then sign in with your Google account on the page that opens. No card needed.</p>
        <div class="btn-row">${o.login_url ? `<a class="btn primary" href="${esc(o.login_url)}" target="_blank" rel="noopener">Open the sign-in page</a>` : `<button class="btn primary" data-act="on-login" ${o.busy === 'login' ? 'disabled' : ''}>${o.busy === 'login' ? 'Starting…' : 'Sign in'}</button>`}<button class="btn quiet" data-act="on-check">Check again</button></div>` : '<p class="muted">After step 1.</p>', now2)}
      ${step(3, o.funnel, 'Go online', o.funnel ? `<p>This studio is on the internet at:</p><div class="copyline"><code>${esc(o.address)}</code><button class="btn sm" data-act="copy-text" data-v="${esc(o.address)}">${icon('copy')}Copy address</button></div>` : o.logged_in ? (o.approve_url ? `<p><b>One more click:</b> Tailscale asks you to allow public access once. Open the page, press <b>Enable</b>, then come back.</p><div class="btn-row"><a class="btn primary" href="${esc(o.approve_url)}" target="_blank" rel="noopener">Allow in Tailscale</a><button class="btn quiet" data-act="on-check">Check again</button></div>`
        : `<p>Press <b>Go online</b>. KMR Studio switches it on for you, and it stays on after restarts.</p><div class="btn-row"><button class="btn primary" data-act="on-go" ${o.busy === 'funnel' ? 'disabled' : ''}>${o.busy === 'funnel' ? 'Switching on…' : 'Go online'}</button></div>`) : '<p class="muted">After step 2.</p>', now3)}
      ${step(4, o.door_ok, `Open it from ${esc(doorShort)}`, o.door_ok ? `<p>Done. Use <b>${esc(doorShort)}</b> on your phone and add it to the home screen.</p>` : o.funnel ? `<p>Tell the studio's web door where the studio is (once). The door is the Vercel project <b>KMR-Studio</b>, made from the GitHub repo of the same name (setup guide, Part 3).</p>
        <ol class="steps small"><li>Press <b>Copy address</b> in step 3.</li><li>Open <a href="https://vercel.com/dashboard" target="_blank" rel="noopener">vercel.com</a>, the project <b>KMR-Studio</b>, then <b>Settings</b>, <b>Environment Variables</b>.</li><li>Key <code>KMR_STUDIO_URL</code>, value: paste the address. Press <b>Save</b>.</li><li>Open <b>Deployments</b>, the three dots on the newest one, <b>Redeploy</b>. Wait about 2 minutes.</li><li>Press <b>Test</b> below.</li></ol>
        <label class="field" style="max-width:420px"><span class="label">Door address</span><input id="on-door-url" value="${esc(door)}" autocomplete="off" spellcheck="false"></label>
        ${o.door_msg ? `<p class="err">${esc(o.door_msg)}</p>` : ''}<div class="btn-row"><button class="btn primary" data-act="on-door">Test</button></div>` : '<p class="muted">After step 3.</p>', now4)}
    </ol>
    ${live ? `<div class="btn-row" style="margin-top:6px"><button class="btn quiet sm danger" data-act="on-off">Take the studio offline</button></div>` : ''}
  </div>
  <div class="panel sgroup"><h2>On your phone</h2><ol class="steps small" style="margin:0">
    <li>Open <b>${esc(o.door_ok ? doorShort : 'your studio address')}</b> in Chrome (Android) or Safari (iPhone) and sign in with your studio password.</li>
    <li>Android: menu (three dots), <b>Add to Home screen</b>. iPhone: Share, <b>Add to Home Screen</b>.</li></ol></div>
  <details class="panel keybox"><summary><span class="need">Advanced</span><b>Other ways online</b></summary>
    <p class="muted small">Only if you do not want Tailscale. A Cloudflare Tunnel needs your domain's DNS moved to Cloudflare.</p>
    <div class="form-grid" style="margin-top:6px">
      <label class="field"><span class="label">Studio address on your Cloudflare domain</span><input id="on-addr" value="${esc(cf && cf.enabled ? (S.st.settings.public_url || '').replace('https://', '') : '')}" placeholder="studio.example.com" autocomplete="off" spellcheck="false"></label>
      <label class="field"><span class="label">Cloudflare tunnel token${cf && cf.has_token ? ' (saved)' : ''}</span><input type="text" class="secret" id="on-token" placeholder="Paste what Cloudflare shows (eyJ…)" autocomplete="off" spellcheck="false" data-lpignore="true"></label>
    </div>
    <div class="btn-row" style="margin-top:12px"><button class="btn sm" data-act="online-save">Save and connect</button>${cf && cf.enabled ? '<button class="btn quiet sm danger" data-act="online-off">Turn off</button>' : ''}${cf && cf.enabled ? `<span class="muted small">Cloudflare: ${esc(cf.state)}${cf.message ? ', ' + esc(cf.message) : ''}</span>` : ''}</div></details>`;
}
function musicTab() {
  return `<div class="panel sgroup"><div class="setup-top"><div><h2>Music library</h2><p class="muted small">Upload royalty-free tracks (YouTube Audio Library, Pixabay Music). Put a mood word in the file name so the right track is picked: <i>happy, calm, emotional, epic, dark, mysterious, upbeat, funny</i>, for example <i>calm-piano.mp3</i>.</p></div>
    <label class="btn primary">${icon('upload')}Upload music<input type="file" id="music-up" accept="audio/*" multiple hidden></label></div>
    <div class="progress" id="music-prog" hidden><i></i></div>
    ${S.st.music.length ? `<ul class="tracks">${S.st.music.map(m => `<li><span>${esc(m)}</span><button class="icon-btn" data-act="play-music" data-v="${esc(m)}" aria-label="Play">▶</button><button class="btn quiet sm danger" data-act="del-music" data-v="${esc(m)}">Remove</button></li>`).join('')}</ul>` : '<p class="empty">No music yet. Videos will have voice and sound effects only.</p>'}</div>`;
}
function updatesTab() {
  return `<div class="panel sgroup"><h2>Update KMR Studio</h2>
    ${srow('Current version', 'Your videos, keys, profiles and settings are kept when you update.', `<b class="ver-big">${esc(S.st.version)}</b>`)}
    ${srow('Install an update', 'Choose the new zip you received. The studio restarts by itself in about a minute.', '<label class="btn primary">' + icon('upload') + 'Upload update zip<input type="file" id="update-up" accept=".zip" hidden></label>')}
    <div class="progress" id="update-prog" hidden><i></i></div></div>
  <div class="panel sgroup"><h2>Fix problems</h2>
    ${srow('Voice engine', 'If voice-overs start failing, Microsoft changed something. This installs the newest voice engine.', '<button class="btn" data-act="repair-voice">Repair voice engine</button>')}
    ${srow('Online access', 'If your address stops opening, reconnect the Cloudflare tunnel.', '<a class="btn" href="#settings/online">Open online access</a>')}</div>`;
}
function settings() {
  const t = SET_TABS.some(x => x[0] === sub()) ? sub() : 'setup';
  const body = { setup: setupTab, brand: brandTab, video: videoTab, posting: postingTab, online: onlineTab, music: musicTab, updates: updatesTab }[t]();
  return `<div class="page-head"><div><h1>Settings</h1><p>Everything about how KMR Studio looks, makes and posts your videos.</p></div></div>
  <div class="set-layout">${subtabs('settings', SET_TABS, t)}<div class="set-body">${body}</div></div>`;
}

// ---------- events ----------
function readDraft() {
  if (!$('#topic')) return;
  Object.assign(S.draft, { topic: $('#topic').value, niche: $('#niche').value, language: $('#lang').value, voice: $('#voice').value, duration: Number($('#dur').value), auto: $('#auto').checked, motion: !!($('#motion') && $('#motion').checked) });
  S.count = Number($('#count').value) || 1;
}
function readSchedForm() {
  const e = S.editing; if (!e || !$('#sf-name')) return;
  Object.assign(e, { name: $('#sf-name').value, niche: $('#sf-niche').value, times: $('#sf-times').value.split(/[,\s]+/).filter(Boolean), topics: $('#sf-topics').value.split('\n'),
    ratio: $('#sf-ratio').value, style: $('#sf-style').value, language: $('#sf-lang').value, voice: $('#sf-voice').value, duration: Number($('#sf-dur').value), auto_approve: $('#sf-auto').checked, topic_source: $('#sf-source').value, engine: $('#sf-engine').value, motion: !!($('#sf-motion') && $('#sf-motion').checked) });
}

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, v = el.dataset.v, id = el.dataset.id;
  if (el.tagName === 'INPUT') return;
  if (act !== 'close-modal' || el.tagName !== 'A') e.preventDefault();
  readDraft(); readSchedForm(); readTools(); readTrends(); readUpload();
  switch (act) {
    case 'ratio': S.draft.ratio = v; render(); break;
    case 'engine': S.draft.engine = v; render(); break;
    case 'style': S.draft.style = v; render(); break;
    case 'use-idea': S.draft.topic = v; render(); $('#topic').focus(); break;
    case 'ideas': busy(el, async () => { el.textContent = 'Thinking…'; S.ideas = (await api('/api/ideas', { body: { niche: S.draft.niche || S.draft.topic, language: S.draft.language } })).ideas; render(); }).finally(() => { el.textContent = 'Suggest topics'; }); break;
    case 'preview': busy(el, async () => { const b = await api('/api/voice-preview', { body: { voice: S.draft.voice, text: sampleText() }, blob: true }); new Audio(URL.createObjectURL(b)).play(); }); break;
    case 'make': case 'surprise': {
      if (act === 'make' && !S.draft.topic.trim() && !S.draft.niche.trim()) { toast('Write a topic, or a niche and press Surprise me.', true); $('#topic').focus(); break; }
      busy(el, async () => {
        const d = S.draft;
        const r = await api('/api/jobs', { body: { topic: act === 'surprise' ? '' : d.topic, niche: d.niche, ratio: d.ratio, style: d.style, language: d.language, voice: d.voice, duration: d.duration, auto_approve: d.auto, motion: d.motion, engine: d.engine, count: S.count, targets: d.targets.filter(readyT) } });
        toast(r.jobs.length > 1 ? `${r.jobs.length} videos started.` : 'Video started. Follow it below.');
        d.topic = ''; S.ideas = []; await loadJobs(); await loadState(); render();
      }); break;
    }
    case 'open': openJob(id); break;
    case 'close-modal': closeModal(); break;
    case 'filter': S.filter = v; render(); break;
    case 'job': busy(el, async () => {
      if (v === 'approve' || v === 'publish') await saveMeta(true);
      S.job = (await api(`/api/jobs/${S.job.id}/${v}`, { body: {} })).job;
      toast({ approve: 'Approved. Posting now.', publish: 'Posting again.', reject: 'Rejected.', remake: 'Remaking with a new script.', rerender: 'Retrying.' }[v]);
      await loadJobs(); if (['remake', 'rerender'].includes(v)) closeModal(); else renderModal(); render();
    }); break;
    case 'save-meta': busy(el, () => saveMeta()); break;
    case 'del-job': if (confirm('Delete this video and its files?')) busy(el, async () => { await api('/api/jobs/' + S.job.id, { method: 'DELETE' }); closeModal(); await loadJobs(); render(); toast('Deleted.'); }); break;
    case 'new-sched': S.editing = blankSchedule(); render(); $('#sf-name').focus(); break;
    case 'edit-sched': S.editing = JSON.parse(JSON.stringify(S.schedules.find(s => s.id === id))); if (!Array.isArray(S.editing.targets)) S.editing.targets = defTargets(); render(); window.scrollTo(0, 0); break;
    case 'cancel-sched': S.editing = null; render(); break;
    case 'sf-day': { const days = S.editing.days; const i = days.indexOf(v); i >= 0 ? days.splice(i, 1) : days.push(v); S.editing.days = DAYS.filter(d => days.includes(d)); render(); break; }
    case 'del-sched': if (confirm('Delete this autopilot?')) busy(el, async () => { await api('/api/schedules/' + id, { method: 'DELETE' }); await loadSchedules(); render(); }); break;
    case 'save-key': busy(el, async () => {
      const val = $('#k-' + id).value.trim(); if (!val) throw new Error('Paste the key first.');
      await api('/api/settings', { body: { [el.dataset.key]: val } });
      const t = await api('/api/test/' + id, { body: {} }).catch(err => { toast(err.message, true); return null; });
      if (t) toast(t.message);
      await loadState(); render();
    }); break;
    case 'test': busy(el, async () => { try { const t = await api('/api/test/' + id, { body: {} }); toast(t.message, /expires on|Missing/.test(t.message)); } finally { if (id === 'meta') { await loadState(); render(); } } }); break;
    case 'veo-save': busy(el, async () => {
      const k = $('#k-veo').value.trim(); if (k) await api('/api/settings', { body: { veo_key: k } });
      const t = await api('/api/test/veo', { body: {} }).catch(err => { toast(err.message, true); return null; });
      if (t) toast(t.message); await loadState(); render();
    }); break;
    case 'copy-shot': {
      const ta = $('#shot-p-' + v);
      (navigator.clipboard ? navigator.clipboard.writeText(ta.value) : Promise.reject()).catch(() => { ta.select(); document.execCommand('copy'); }).finally(() => toast(`Shot ${Number(v) + 1} prompt copied. Paste it in Flow.`));
      break;
    }
    case 'copy-all': {
      const txt = S.job.script.shots.map((sh, i) => `SHOT ${i + 1}\n${sh.prompt}`).join('\n\n');
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast('All prompts copied.')).catch(() => toast('Copy did not work here. Use the Copy prompt buttons.', true));
      break;
    }
    case 'resend-flow': busy(el, async () => { await api(`/api/jobs/${S.job.id}/resend-flow`, { body: {} }); toast('Prompts sent to Telegram. Reply to each one with its clip.'); }); break;
    case 'del-clip': busy(el, async () => { S.job = (await api(`/api/jobs/${S.job.id}/clip/${v}`, { method: 'DELETE' })).job; renderModal(); }); break;
    case 'up-mode': S.up.mode = v; render(); break;
    case 'up-move': { const [i, d] = v.split(':').map(Number); const f = S.up.files; [f[i], f[i + d]] = [f[i + d], f[i]]; render(); break; }
    case 'up-remove': { const f = S.up.files.find(x => x.key === v); S.up.files = S.up.files.filter(x => x !== f); if (f && f.file) api('/api/uploads/file/' + f.file, { method: 'DELETE' }).catch(() => {}); if (f) f.blob = null; render(); break; }
    case 'up-ai': aiText(v, el); break;
    case 'up-go': busy(el, async () => {
      const u = S.up, ready = u.files.filter(f => f.status === 'ready');
      const pick = f => ({ file: f.file, name: f.name, title: f.title, description: f.description, hashtags: f.hashtags });
      const r = await api('/api/uploads/post', { body: { mode: u.mode, items: ready.map(pick), join: u.join, targets: u.targets.filter(readyT), approve: u.approve, language: u.language } });
      toast(u.approve ? `${r.jobs.length} video${r.jobs.length > 1 ? 's' : ''} being prepared. You'll get ${r.jobs.length > 1 ? 'them' : 'it'} for approval.` : `${r.jobs.length} post${r.jobs.length > 1 ? 's' : ''} on the way. Follow progress below.`);
      const keep = { targets: u.targets, approve: u.approve, language: u.language, mode: u.mode };
      S.up = null; Object.assign(upState(), keep);
      await loadJobs(); await loadState(); render();
    }); break;
    case 'logo-del': if (confirm('Remove your logo?')) busy(el, async () => { await api('/api/brand/logo', { method: 'DELETE' }); await loadState(); render(); }); break;
    case 'logo-bg': busy(el, async () => { const r = await api('/api/brand', { body: { bg: v } }); await loadState(); applyFavicon(r.brand); render(); }); break;
    case 'on-check': busy(el, async () => { S.st.online = await api('/api/online'); render(); }); break;
    case 'on-login': busy(el, async () => { S.st.online = await api('/api/online/login', { body: {} }); render(); if (S.st.online.login_url) window.open(S.st.online.login_url, '_blank'); }); break;
    case 'on-go': busy(el, async () => { S.st.online = await api('/api/online/go', { body: {} }); render(); if (S.st.online.approve_url) window.open(S.st.online.approve_url, '_blank'); else if (S.st.online.funnel) toast('KMR Studio is online.'); }); break;
    case 'on-off': if (confirm('Take the studio off the internet? It keeps working on this computer.')) busy(el, async () => { S.st.online = await api('/api/online/off', { body: {} }); render(); }); break;
    case 'on-door': busy(el, async () => { S.st.online = await api('/api/online/door', { body: { door: ($('#on-door-url') || {}).value } }); render(); toast(S.st.online.door_ok ? 'It works: ' + S.st.online.door.replace(/^https?:\/\//, '') + ' opens your studio.' : 'Not yet. See the message in step 4.', !S.st.online.door_ok); }); break;
    case 'copy-text': (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(() => toast('Copied.')).catch(() => prompt('Copy this', v)); break;
    case 'online-save': busy(el, async () => {
      const address = $('#on-addr').value.trim(), token = $('#on-token').value.trim();
      if (!address) throw new Error('Type the studio address on your Cloudflare domain.');
      if (!token && !(S.st.cf && S.st.cf.has_token)) throw new Error('Paste the Cloudflare tunnel token first.');
      await api('/api/online/cloudflare', { body: { address, token, enabled: true } });
      toast('Connecting to Cloudflare. The status turns green in about a minute.'); await loadState(); render();
    }); break;
    case 'online-off': if (confirm('Take the studio off the internet? It keeps working on this computer.')) busy(el, async () => { await api('/api/online/cloudflare', { body: { enabled: false } }); await loadState(); render(); }); break;
    case 'goto-lib': S.filter = v; location.hash = '#library'; break;
    case 'flow-finish': busy(el, async () => { S.job = (await api(`/api/jobs/${S.job.id}/finish-flow`, { body: {} })).job; toast('Finishing your video. It will arrive for approval soon.'); await loadJobs(); closeModal(); render(); }); break;
    case 'kg-save': busy(el, async () => {
      el.textContent = 'Testing, first time takes a minute…';
      await api('/api/settings', { body: { kaggle_username: $('#kg-user').value.trim(), kaggle_key: $('#kg-key').value.trim() || undefined } });
      const t = await api('/api/test/kaggle', { body: {} }).catch(err => { toast(err.message, true); return null; });
      if (t) toast(t.message);
      await loadState(); render();
    }).finally(() => { el.textContent = 'Save and test'; }); break;
    case 't-image': readTools(); busy(el, async () => {
      el.textContent = 'Making pictures…';
      const d = S.tdraft; await api('/api/tools/image', { body: { prompt: d.prompt, ratio: d.ratio, style: d.style, count: d.count } });
      await loadTools(); render();
    }).finally(() => { if (el.isConnected) el.textContent = 'Make pictures'; }); break;
    case 't-video': readTools(); busy(el, async () => {
      const d = S.tdraft; await api('/api/tools/video', { body: { prompt: d.vprompt, ratio: d.vratio, seconds: d.seconds, image: d.image } });
      toast('Clip queued on the free GPU. It appears below when ready.'); d.image = null; d.imageName = ''; await loadTools(); render();
    }); break;
    case 't-clear-img': readTools(); S.tdraft.image = null; S.tdraft.imageName = ''; render(); break;
    case 't-del': busy(el, async () => { await api('/api/tools/' + id, { method: 'DELETE' }); await loadTools(); render(); }); break;
    case 'tr-run': readTrends(); busy(el, async () => {
      el.textContent = 'Analysing…';
      const d = S.trdraft; const r = await api('/api/trends', { body: { niche: d.niche, language: d.language, days: d.days, shorts: d.shorts, region: d.region } });
      await loadTrends(); S.trendSel = r.trend.id; render(); toast('Analysis ready.');
    }).finally(() => { if (el.isConnected) el.textContent = "Analyse what's working"; }); break;
    case 'tr-sel': readTrends(); S.trendSel = id; render(); break;
    case 'tr-del': if (confirm('Delete this analysis?')) busy(el, async () => { await api('/api/trends/' + id, { method: 'DELETE' }); await loadTrends(); S.trendSel = null; render(); }); break;
    case 'tr-make': busy(el, async () => {
      const t = S.trendList.find(x => x.id === id); const x = t.insights.ideas[Number(v)];
      const style = S.st.styles[x.style] ? x.style : S.st.settings.default_style;
      const ratio = ['9:16', '16:9', '1:1', '4:5'].includes(x.format) ? x.format : '9:16';
      const dur = LENGTHS.map(l => l[0]).reduce((a, b) => Math.abs(b - (x.length_seconds || 45)) < Math.abs(a - (x.length_seconds || 45)) ? b : a);
      await api('/api/jobs', { body: { topic: `${x.title}. ${x.angle} Hook: ${x.hook}`, language: t.language, ratio, style, duration: dur, niche: t.niche } });
      toast('Video started. Follow it in the Studio.'); await loadJobs(); location.hash = '#studio';
    }); break;
    case 'rep-go': readTools(); busy(el, async () => {
      const d = S.tdraft; const [mn, mx] = (d.repLen || '25-60').split('-').map(Number);
      await api('/api/tools/repurpose', { body: { source: d.repSource, name: d.repName, count: d.repCount || 3, minLen: mn, maxLen: mx, reframe: d.repFrame || 'fit', subtitles: d.repSubs !== false } });
      toast('Working on your Shorts. They will appear in the Library for approval.'); d.repSource = null; d.repName = ''; await loadTools(); render();
    }); break;
    case 'tp': { const [scope, t] = v.split('|'); const cur = [...(tpGet(scope) || [])]; const i = cur.indexOf(t); i >= 0 ? cur.splice(i, 1) : cur.push(t); tpSet(scope, cur); scope === 'job' ? renderModal() : render(); break; }
    case 'tp-all': { const [scope, pid] = v.split('|'); const p = S.st.profiles.find(x => x.id === pid); const mine = PL.filter(([k]) => p[k].ok).map(([k]) => pid + ':' + k);
      const cur = tpGet(scope) || []; const allOn = mine.every(t => cur.includes(t)); tpSet(scope, allOn ? cur.filter(t => !t.startsWith(pid + ':')) : [...new Set([...cur, ...mine])]); scope === 'job' ? renderModal() : render(); break; }
    case 'acc-open': S.accOpen = S.accOpen === v ? null : v; render(); break;
    case 'acc-check': { const [pid, pl] = v.split(':'); busy(el, async () => { try { const r = await api(`/api/profiles/${pid}/${pl}/check`, { body: {} }); toast(r.message, /expires on|Missing/.test(r.message)); } finally { await loadState(); render(); } }); break; }
    case 'acc-disc': { const [pid, pl] = v.split(':'); if (confirm('Disconnect this account? Videos will not post to it until you connect again.')) busy(el, async () => { await api(`/api/profiles/${pid}/${pl}/disconnect`, { body: {} }); await loadState(); render(); }); break; }
    case 'yt-start': busy(el, async () => { S.yt = S.yt || {}; S.yt[v] = await api(`/api/profiles/${v}/youtube/start`, { body: {} }); render(); }); break;
    case 'yt-own': busy(el, async () => { const i = $('#yc-id-' + v).value.trim(), sec = $('#yc-sec-' + v).value.trim(); if (!i || !sec) throw new Error('Paste both the client ID and secret.'); await api(`/api/profiles/${v}/youtube/client`, { body: { client_id: i, client_secret: sec } }); toast('Own keys saved. Now connect the channel.'); await loadState(); render(); }); break;
    case 'yt-own-clear': busy(el, async () => { await api(`/api/profiles/${v}/youtube/client`, { body: {} }); toast('This profile uses the shared keys again. Connect the channel once more.'); await loadState(); render(); }); break;
    case 'meta-connect': busy(el, async () => {
      const tok = $('#mt-' + v).value.trim(); if (!tok) throw new Error('Paste the access token first.');
      const r = await api(`/api/profiles/${v}/meta/connect`, { body: { user_token: tok } });
      toast(`Connected ${r.page}${r.ig ? ' and @' + r.ig : ''}.${r.missing?.length ? ' Missing permissions: ' + r.missing.join(', ') : ''}`, !!r.missing?.length); await loadState(); await loadJobs(); render();
    }); break;
    case 'oauth-go': case 'oauth-link': { const [pid, pl] = v.split(':'); const w = act === 'oauth-go' ? window.open('', '_blank') : null;
      busy(el, async () => {
        try {
          const r = await api(`/api/profiles/${pid}/${pl}/start`, { body: { base: location.origin } });
          if (w) { w.location = r.url; toast('Sign in on the new tab. This page updates when it is done.'); }
          else { await (navigator.clipboard ? navigator.clipboard.writeText(r.url) : Promise.reject()).catch(() => prompt('Copy this link', r.url)); toast('Sign-in link copied. Send it to them; it works for 30 minutes.'); }
        } catch (e) { if (w) w.close(); throw e; }
      }); break; }
    case 'save-keys': busy(el, async () => {
      const body = {}; for (const k of v.split(',')) { const i = $('#ak-' + k); if (i && (i.value.trim() || !i.classList.contains('secret'))) body[k] = i.value.trim(); }
      if (body.oauth_redirect && !/^https:\/\//i.test(body.oauth_redirect)) throw new Error('The address must start with https://');
      await api('/api/settings', { body }); S.keysOpen = el.closest('details')?.id?.replace('keys-', '') || null; toast('Saved.'); await loadState(); render();
    }); break;
    case 'prof-add': { const name = (prompt('Name of the person or brand (for example KMR Group, Priya):') || '').trim(); if (name) busy(el, async () => { const r = await api('/api/profiles', { body: { name } }); await loadState(); S.accOpen = r.profile.id + ':youtube'; render(); setTimeout(() => $('#prof-' + r.profile.id)?.scrollIntoView({ behavior: 'smooth' }), 50); toast(`Profile "${name}" added. Connect its accounts.`); }); break; }
    case 'prof-rename': { const p = S.st.profiles.find(x => x.id === v); const name = (prompt('New name:', p.name) || '').trim(); if (name) busy(el, async () => { await api('/api/profiles/' + v, { body: { name } }); await loadState(); render(); }); break; }
    case 'prof-del': { const p = S.st.profiles.find(x => x.id === v); if (confirm(`Remove the profile "${p.name}" and forget its accounts? Videos already posted stay online.`)) busy(el, async () => { await api('/api/profiles/' + v, { method: 'DELETE' }); await loadState(); render(); }); break; }
    case 'repair-voice': busy(el, async () => { el.textContent = 'Updating, about a minute…'; const r = await api('/api/repair-voice', { body: {} }); toast(r.message); S.voices = (await api('/api/voices')).voices; }).finally(() => { el.textContent = 'Repair voice engine'; }); break;
    case 'del-music': busy(el, async () => { await api('/api/music/' + encodeURIComponent(v), { method: 'DELETE' }); await loadState(); render(); }); break;
    case 'play-music': { if (window._track) window._track.pause(); if (window._trackName === v) { window._trackName = null; break; } window._track = new Audio('/music/' + encodeURIComponent(v)); window._trackName = v; window._track.play(); break; }
    case 'logout': if (confirm('Sign out of KMR Studio on this device?')) { await api('/api/logout', { body: {} }); S.st = null; boot(); } break;
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.job) closeModal();
  if (e.key === 'Enter' && e.target.matches('[data-act="open"]')) openJob(e.target.dataset.id);
  if (e.key === 'Enter' && e.target.id === 'topic' && (e.ctrlKey || e.metaKey)) $('[data-act="make"]').click();
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'lang') { S.draft.language = t.value; S.draft.voice = (S.voices.find(v => v.language === t.value && /-IN-/.test(v.id)) || S.voices.find(v => v.language === t.value) || {}).id || ''; readDraftKeepLang(); render(); }
  if (t.id === 'voice') S.draft.voice = t.value;
  if (t.id === 'sf-lang') { readSchedForm(); S.editing.voice = (S.voices.find(v => v.language === t.value) || {}).id || ''; render(); }
  if (t.dataset.set) {
    const val = t.type === 'checkbox' ? (t.dataset.invert ? !t.checked : t.checked) : t.type === 'range' ? Number(t.value) : t.value;
    busy(null, async () => { await api('/api/settings', { body: { [t.dataset.set]: val } }); await loadState(); toast('Saved.'); });
  }
  if (t.dataset.act === 'toggle-sched') {
    const s = S.schedules.find(x => x.id === t.dataset.id); s.enabled = t.checked;
    busy(null, async () => { await api('/api/schedules', { body: s }); toast(s.enabled ? 'Autopilot on.' : 'Autopilot paused.'); });
  }
  if (t.id === 'music-up') uploadMusic([...t.files]);
  if (t.classList.contains('meta-page')) busy(null, async () => { await api(`/api/profiles/${t.dataset.pid}/meta/connect`, { body: { page_id: t.value } }); await loadState(); render(); toast('Page switched.'); });
  if (t.classList.contains('flow-up') && t.files[0]) uploadFlowClips([[Number(t.dataset.shot), t.files[0]]]);
  if (t.id === 'flow-multi' && t.files.length) flowMany([...t.files]);
  if (t.id === 'up-files' && t.files.length) { addUploads([...t.files]); t.value = ''; }
  if (['up-ratio', 'up-fit', 'up-lang', 'up-approve'].includes(t.id)) { readUpload(); render(); }
  if (t.id === 'rep-file' && t.files[0]) {
    readTools(); const f = t.files[0];
    busy(null, async () => { toast('Uploading video…'); const r = await xhrUpload('/api/tools/upload-video?name=' + encodeURIComponent(f.name), f, 'PUT', $('#rep-prog')); S.tdraft.repSource = r.source; S.tdraft.repName = f.name; render(); toast('Video uploaded.'); });
  }
  if (t.id === 'v-image' && t.files[0]) { readTools(); const f = t.files[0]; busy(null, async () => { const r = await xhrUpload('/api/tools/upload?name=' + encodeURIComponent(f.name), f, 'PUT'); S.tdraft.image = r.image; S.tdraft.imageName = f.name; render(); }); }
  if (t.id === 'update-up' && t.files[0]) uploadUpdate(t.files[0]);
  if (t.id === 'logo-up' && t.files[0]) { const f = t.files[0]; busy(null, async () => { const r = await xhrUpload('/api/brand/logo?name=' + encodeURIComponent(f.name), f, 'PUT'); await loadState(); applyFavicon(r.brand); render(); toast('Logo saved.'); }); }
});
function readDraftKeepLang() { if ($('#topic')) { S.draft.topic = $('#topic').value; S.draft.niche = $('#niche').value; } }

document.addEventListener('submit', e => {
  if (e.target.id === 'sched-form') {
    e.preventDefault(); readSchedForm();
    busy(e.submitter, async () => { await api('/api/schedules', { body: S.editing }); S.editing = null; await loadSchedules(); render(); toast('Autopilot saved.'); });
  }
  if (e.target.id === 'pw-form') {
    e.preventDefault();
    busy(e.submitter, async () => { await api('/api/password', { body: { current: $('#pw-cur').value, password: $('#pw-new').value } }); e.target.reset(); toast('Password changed.'); });
  }
});

async function saveMeta(silent) {
  if (!$('#m-title') || $('#m-title').disabled) {
    if (S.job && S.jobTargets) { S.job = (await api(`/api/jobs/${S.job.id}/meta`, { body: { targets: S.jobTargets } })).job; if (!silent) toast('Saved.'); }
    return;
  }
  const hash = $('#m-hash').value.split(/[\s,]+/).filter(Boolean).map(h => h.startsWith('#') ? h : '#' + h);
  S.job = (await api(`/api/jobs/${S.job.id}/meta`, { body: { title: $('#m-title').value, description: $('#m-desc').value, hashtags: hash, targets: S.jobTargets } })).job;
  if (!silent) toast('Changes saved.');
}
function sampleText() {
  const l = S.draft.language;
  const t = { English: 'Hi! This is how your videos will sound.', Hindi: 'नमस्ते! आपके वीडियो ऐसे सुनाई देंगे।', Tamil: 'வணக்கம்! உங்கள் வீடியோக்கள் இப்படித்தான் ஒலிக்கும்.', Kannada: 'ನಮಸ್ಕಾರ! ನಿಮ್ಮ ವಿಡಿಯೋಗಳು ಹೀಗೆ ಕೇಳಿಸುತ್ತವೆ.', Telugu: 'నమస్కారం! మీ వీడియోలు ఇలా వినిపిస్తాయి.', Malayalam: 'നമസ്കാരം! നിങ്ങളുടെ വീഡിയോകൾ ഇങ്ങനെ കേൾക്കും.', Spanish: '¡Hola! Así sonarán tus videos.', French: 'Bonjour ! Voici comment vos vidéos vont sonner.', Arabic: 'مرحبا! هكذا ستبدو فيديوهاتك.' };
  return t[l] || t.English;
}

function xhrUpload(url, file, method, prog, onPct) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest(); x.open(method, url);
    x.upload.onprogress = e => { if (e.lengthComputable) { if (prog) { prog.hidden = false; prog.firstElementChild.style.width = (100 * e.loaded / e.total) + '%'; } if (onPct) onPct(100 * e.loaded / e.total); } };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch {} x.status < 300 ? resolve(j) : reject(new Error(j.error || 'Upload failed')); };
    x.onerror = () => reject(new Error('Upload failed. Check your connection.'));
    x.send(file);
  });
}
async function uploadMusic(files) {
  for (const f of files) { try { await xhrUpload('/api/music?name=' + encodeURIComponent(f.name), f, 'PUT', $('#music-prog')); } catch (e) { toast(f.name + ': ' + e.message, true); } }
  await loadState(); render(); toast('Music added.');
}
async function uploadUpdate(file) {
  try {
    const r = await xhrUpload('/api/update', file, 'POST', $('#update-prog'));
    toast(`Updated to ${r.version}. Restarting…`);
    for (let i = 0; i < 60; i++) { await new Promise(res => setTimeout(res, 2000)); try { const b = await fetch('/api/boot').then(x => x.json()); if (b.version === r.version) { location.reload(); return; } } catch {} }
    location.reload();
  } catch (e) { toast(e.message, true); }
}

function readTools() {
  if (!$('#t-prompt')) return;
  Object.assign(S.tdraft, { prompt: $('#t-prompt').value, ratio: $('#t-ratio').value, style: $('#t-style').value, count: Number($('#t-count').value), vprompt: $('#v-prompt').value, vratio: $('#v-ratio').value, seconds: Number($('#v-sec').value),
    repCount: Number($('#rep-count').value), repLen: $('#rep-len').value, repFrame: $('#rep-frame').value, repSubs: $('#rep-subs').checked });
}
function readTrends() {
  if (!$('#tr-niche')) return;
  Object.assign(S.trdraft, { niche: $('#tr-niche').value, language: $('#tr-lang').value, days: Number($('#tr-days').value), shorts: $('#tr-type').value === 'shorts', region: $('#tr-region').value });
}
function flowMany(list) {
  const files = list.filter(f => /^video\//.test(f.type) || /\.(mp4|mov|webm|m4v)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!files.length) return toast('Those files are not videos.', true);
  const shots = S.job.script.shots, clips = S.job.clips || [];
  const slots = files.length >= shots.length ? shots.map((_, i) => i) : shots.map((_, i) => i).filter(i => !clips[i]);
  if (!slots.length) return toast('Every shot already has a clip. Use Replace on a shot to change one.', true);
  uploadFlowClips(files.slice(0, slots.length).map((f, n) => [slots[n], f]));
}
// drag and drop: whole Flow panel, or onto one shot to fill that shot
const DROPS = '#flow-drop, #up-drop, .page-upload .up-main';
document.addEventListener('dragover', e => { const z = e.target.closest && e.target.closest(DROPS); if (z) { e.preventDefault(); (z.id === 'flow-drop' ? z : ($('#up-drop') || z)).classList.add('drag'); } });
document.addEventListener('dragleave', e => { const z = e.target.closest && e.target.closest(DROPS); if (z && !z.contains(e.relatedTarget)) (z.id === 'flow-drop' ? z : ($('#up-drop') || z)).classList.remove('drag'); });
document.addEventListener('drop', e => {
  const up = e.target.closest && e.target.closest('#up-drop, .page-upload .up-main');
  if (up && !(e.target.closest('#flow-drop'))) { e.preventDefault(); $('#up-drop') && $('#up-drop').classList.remove('drag'); return addUploads([...(e.dataTransfer?.files || [])]); }
  const z = e.target.closest && e.target.closest('#flow-drop'); if (!z || !S.job) return;
  e.preventDefault(); z.classList.remove('drag');
  const files = [...(e.dataTransfer?.files || [])];
  const one = e.target.closest('.shot');
  if (one && files.length === 1) uploadFlowClips([[Number(one.dataset.shot), files[0]]]);
  else flowMany(files);
});
async function uploadFlowClips(pairs) {
  for (const [shot, f] of pairs) {
    try {
      const r = await xhrUpload(`/api/jobs/${S.job.id}/clip?shot=${shot}&name=${encodeURIComponent(f.name)}`, f, 'PUT', $('#flow-prog'));
      S.job = r.job; renderModal();
      if (r.warning) toast(r.warning, true);
    } catch (e) { toast(`Shot ${shot + 1}: ${e.message}`, true); }
  }
  const { done, total } = { done: (S.job.clips || []).filter(Boolean).length, total: (S.job.script?.shots || []).length };
  toast(done === total ? 'All clips are in. Press Finish video.' : `${done} of ${total} clips uploaded.`);
}
async function loadTools() { S.tools = (await api('/api/tools')).tools; }
async function loadSchedules() { const r = await api('/api/schedules'); S.schedules = r.schedules; S.clock = r.now; }

// ---------- live refresh ----------
async function afterRender(v) {
  const entered = v !== S.lastView; S.lastView = v;
  if (v === 'autopilot' && entered) { await loadSchedules().catch(() => {}); render(); }
  if (v === 'tools' && entered) { await loadTools().catch(() => {}); render(); }
  if (v === 'trends' && entered) { await loadTrends().catch(() => {}); render(); }
  if (v === 'connections' && !S.yt) { S.yt = await api('/api/youtube/status').catch(() => ({})); if (Object.values(S.yt || {}).some(y => y.state === 'waiting')) render(); }
}
function typing() { const a = document.activeElement; return a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName); }
setInterval(async () => {
  if (!S.st || document.hidden) return;
  const v = view();
  try {
    if (v === 'studio' || v === 'library' || v === 'upload' || S.job) {
      const before = JSON.stringify(S.jobs.map(j => [j.id, j.status, j.progress, j.stage, j.updated]));
      await loadJobs();
      const changed = before !== JSON.stringify(S.jobs.map(j => [j.id, j.status, j.progress, j.stage, j.updated]));
      if (changed) {
        await loadState();
        if (!typing()) { readDraft(); readUpload(); render(); }
        if (S.job) { const fresh = S.jobs.find(j => j.id === S.job.id); if (fresh && fresh.status !== S.job.status && !typing()) openJob(S.job.id); }
      }
    }
    if (v === 'tools' && (S.tools || []).some(t => ['queued', 'working'].includes(t.status))) {
      const before = JSON.stringify(S.tools); await loadTools();
      if (before !== JSON.stringify(S.tools) && !typing()) { readTools(); render(); }
    }
    if (v === 'settings' && sub() === 'online') {
      const before = JSON.stringify(S.st.online);
      S.st.online = await api('/api/online');
      if (before !== JSON.stringify(S.st.online) && !typing()) render();
    }
    if (v === 'connections') {
      const c = JSON.stringify([S.st.connections, S.st.profiles]);
      const waiting = Object.entries(S.yt || {}).filter(([, y]) => y.state === 'waiting').map(([k]) => k);
      if (waiting.length) S.yt = await api('/api/youtube/status');
      await loadState();
      const doneNow = waiting.filter(k => S.yt[k] && S.yt[k].state !== 'waiting');
      if (c !== JSON.stringify([S.st.connections, S.st.profiles]) || doneNow.length) { if (!typing()) render(); if (doneNow.some(k => S.yt[k].state === 'connected')) toast('YouTube connected.'); }
    }
  } catch {}
}, 4000);

window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#library/')) { closeModal(); } if (S.st) { readDraft(); readTools(); readTrends(); readUpload(); render(); window.scrollTo(0, 0); } });
boot().catch(e => { $('#app').innerHTML = `<div class="gate"><div class="gate-card"><h1>Can't reach the studio</h1><p>${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Try again</button></div></div>`; });
