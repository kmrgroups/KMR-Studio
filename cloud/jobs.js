// Post jobs: one job per video that goes out (a single video, or several joined into one).
// Each job is prepared once (checked, converted or joined), then every chosen account posts it
// in its own background run, so one slow platform never holds up the others.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const st = require('./state');
const kv = require('./kv');
const files = require('./files');

const RUN_MS = 250000; // each background run stops at about 4 minutes and hands over to a fresh one

const cleanTags = list => (Array.isArray(list) ? list : String(list || '').split(/[\s,]+/))
  .map(t => String(t).trim().replace(/^#+/, '')).filter(Boolean).map(t => '#' + t.replace(/[^\p{L}\p{N}_]/gu, '')).filter(t => t.length > 1).slice(0, 30);
const baseName = n => String(n || 'My video').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 100);

// ---- background runs: the page (or a run) asks /api/work, which answers at once and keeps working ----
async function workKey() { const s = await kv.getJ('secret') || ''; return crypto.createHmac('sha256', String(s) + '|' + (process.env.KMR_PASSWORD || '')).update('work').digest('hex'); }
async function trigger(base, payload) {
  const r = await fetch(base + '/api/work', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-kmr-key': await workKey() }, body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
  if (!r.ok && r.status !== 202) throw new Error('Could not start the background work (' + r.status + ')');
}
async function lock(name, sec) { return (await kv.cmd('SET', kv.P + 'lock:' + name, '1', 'NX', 'EX', sec)) === 'OK'; }
async function unlock(name) { await kv.cmd('DEL', kv.P + 'lock:' + name); }

// ---- new posts from the Post page ----
async function create(b, base) {
  const items = (Array.isArray(b.items) ? b.items : []).filter(it => it && files.okPath(it.pathname) && it.pathname.startsWith('up/'));
  if (!items.length) throw new Error('Add at least one video first.');
  const profs = await st.allProfiles();
  const targets = [...new Set((b.targets || []).map(String))].filter(t => { const [pid, pl] = t.split(':'); const p = profs.find(x => x.id === pid); return p && st.PKEYS.includes(pl) && st.connected(p, pl); });
  if (!targets.length) throw new Error('Tick at least one connected account under "Post to".');
  const join = b.mode === 'join' && items.length > 1;
  const groups = join
    ? [{ files: items, meta: { title: b.join?.title || baseName(items[0].name), description: b.join?.description || '', hashtags: b.join?.hashtags } }]
    : items.map(it => ({ files: [it], meta: { title: it.title || baseName(it.name), description: it.description || '', hashtags: it.hashtags } }));
  const made = [];
  for (const g of groups) {
    const job = {
      id: st.uid(), created: Date.now(), status: 'preparing', mode: g.files.length > 1 ? 'join' : 'single',
      title: String(g.meta.title || 'My video').slice(0, 100), description: String(g.meta.description || '').slice(0, 4500), hashtags: cleanTags(g.meta.hashtags),
      targets, sources: g.files.map(f => ({ pathname: f.pathname, name: String(f.name || '').slice(0, 120), size: Number(f.size) || 0 })),
      ratio: b.join?.ratio || 'auto', fit: ['blur', 'bars', 'crop'].includes(b.join?.fit) ? b.join.fit : 'blur',
      log: [{ t: Date.now(), msg: g.files.length > 1 ? `Joining ${g.files.length} videos into one` : 'Checking the video' }]
    };
    await st.addJob(job);
    made.push(job);
  }
  for (const j of made) await trigger(base, { kind: 'prepare', job: j.id });
  return made;
}

// ---- step 1: prepare the video (runs in /api/work) ----
async function prepare(id, base) {
  if (!await lock('prep:' + id, 290)) return;
  const media = require('./media');
  const started = Date.now(), timeLeft = () => started + 290000 - Date.now();
  const job = await st.job(id); if (!job) return;
  const dir = media.tmpDir(id);
  try {
    const srcs = [];
    for (const [k, s] of job.sources.entries()) {
      const f = path.join(dir, `src_${k}` + (path.extname(s.pathname).toLowerCase().replace(/[^.\w]/g, '') || '.mp4'));
      await files.download(s.pathname, f);
      srcs.push(f);
    }
    const r = await media.prepare(srcs, { join: job.mode === 'join', ratio: job.ratio, fit: job.fit, timeLeft }, dir, msg => st.log(id, msg));
    let pathname = job.sources[0].pathname;
    if (!r.reused) { pathname = `out/${id}.mp4`; await files.putFile(pathname, r.file); }
    const i = r.info;
    const video = { pathname, duration: Math.round(i.duration * 10) / 10, w: i.w, h: i.h, size: fs.statSync(r.file).size, ratio: media.ratioOf(i.w, i.h) };
    const notes = [];
    const tg = job.targets.join(' ');
    if (/:instagram\b/.test(tg) && (i.duration < 3 || i.duration > 900)) notes.push('Instagram Reels must be 3 seconds to 15 minutes long, so Instagram may refuse it.');
    if (/:linkedin\b/.test(tg) && i.duration > 600) notes.push('LinkedIn allows up to 10 minutes, so LinkedIn may refuse it.');
    if (/:youtube\b/.test(tg) && i.h > i.w && i.duration <= 180) notes.push('It goes to YouTube as a Short.');
    const j = await st.job(id);
    j.video = video; j.status = 'posting';
    j.log = [...(j.log || []), { t: Date.now(), msg: `Ready: ${Math.round(i.duration)} seconds, ${i.w}x${i.h}. ${notes.join(' ')}`.trim() }];
    await st.saveJob(j);
    if (!r.reused) await files.remove(job.sources.map(s => s.pathname)); // the joined or converted copy is what gets posted
    for (const t of job.targets) await st.setResult(id, t, { status: 'queued', msg: 'Waiting to start' }, true);
    for (const t of job.targets) await trigger(base, { kind: 'post', job: id, target: t }).catch(e => st.setResult(id, t, { status: 'failed', error: e.message }));
  } catch (e) {
    await st.patchJob(id, { status: 'failed', error: e.message });
    await st.log(id, 'Could not prepare the video: ' + e.message);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    await unlock('prep:' + id);
  }
}

// ---- step 2: one account posts it (runs in /api/work, continues in a fresh run when a platform is slow) ----
const POSTERS = {
  youtube: c => require('./youtube').post(c),
  instagram: c => require('./meta').postInstagram(c),
  facebook: c => require('./meta').postFacebook(c),
  linkedin: c => require('./linkedin').post(c),
  x: c => require('./x').post(c)
};
async function postTarget(id, target, base) {
  const name = 'post:' + id + ':' + target;
  if (!await lock(name, 290)) return;
  const started = Date.now();
  let handOver = false;
  try {
    const job = await st.job(id);
    const res = (await st.results(id))[target] || {};
    if (!job || !job.video || res.status === 'done') return;
    const [pid, platform] = target.split(':');
    const profile = await st.profile(pid);
    if (!profile) throw new Error('This profile was removed.');
    if (!st.connected(profile, platform)) throw new Error(`${st.PLATFORMS.find(p => p[0] === platform)[1]} is not connected for ${profile.name}. Connect it in Profiles, then press Retry.`);
    await st.setResult(id, target, { status: 'running', msg: res.state ? (res.msg || 'Still working') : 'Posting', error: '' });
    let buf = null;
    const ctx = {
      profile, job, video: job.video, state: { ...(res.state || {}) },
      timeLeft: () => started + RUN_MS - Date.now(),
      readVideo: async () => buf || (buf = await files.readBuffer(job.video.pathname)),
      videoUrl: minutes => files.signedUrl(job.video.pathname, minutes)
    };
    const out = await POSTERS[platform](ctx);
    if (out.done) {
      await st.setResult(id, target, { status: 'done', url: out.done.url, id: out.done.id, note: out.done.note || '', msg: '', state: null, error: '' });
    } else {
      await st.setResult(id, target, { status: 'running', state: out.wait, msg: out.msg || 'Still working' });
      handOver = true;
    }
  } catch (e) {
    await st.setResult(id, target, { status: 'failed', error: e.message, msg: '' });
  } finally {
    await unlock(name);
  }
  if (handOver) await trigger(base, { kind: 'post', job: id, target }).catch(e => st.setResult(id, target, { status: 'failed', error: e.message }));
  await finishIfDone(id);
}

async function finishIfDone(id) {
  const job = await st.job(id); if (!job || job.status !== 'posting') return;
  const res = await st.results(id);
  const all = job.targets.map(t => res[t] || {});
  if (all.some(r => !r.status || r.status === 'queued' || r.status === 'running')) return;
  const ok = all.filter(r => r.status === 'done').length;
  const status = ok === all.length ? 'done' : ok ? 'partial' : 'failed';
  await st.patchJob(id, { status, finished: Date.now() });
  if (status === 'done') await removeFiles(await st.job(id)); // storage is small (1 GB): a fully posted video is deleted
}
async function removeFiles(job) {
  if (!job || job.files_removed) return;
  await files.remove([job.video?.pathname, ...(job.sources || []).map(s => s.pathname)].filter(Boolean));
  await st.patchJob(job.id, { files_removed: true });
}

async function retry(id, target, base) {
  const job = await st.job(id); if (!job) throw new Error('This post no longer exists.');
  if (job.files_removed) throw new Error('The video file was already removed from storage. Upload it again to post it.');
  if (!job.video) { await st.patchJob(id, { status: 'preparing', error: '' }); await st.log(id, 'Trying again'); await trigger(base, { kind: 'prepare', job: id }); return; }
  const res = await st.results(id);
  const list = target ? [target] : job.targets.filter(t => res[t]?.status === 'failed' || (res[t]?.status === 'running' && Date.now() - (res[t].updated || 0) > 6 * 60000));
  if (!list.length) throw new Error('Nothing to retry.');
  await st.patchJob(id, { status: 'posting' });
  for (const t of list) { await st.setResult(id, t, { status: 'queued', error: '', msg: 'Waiting to start', state: res[t]?.status === 'running' ? res[t].state : null }); await unlock('post:' + id + ':' + t); }
  for (const t of list) await trigger(base, { kind: 'post', job: id, target: t });
}

// Jobs for the History page, with a short-lived preview link. Old files are cleared here too.
async function list(n = 40) {
  const ids = await st.jobIds(n);
  if (!ids.length) return [];
  const raw = await kv.pipeline(ids.flatMap(id => [['GET', kv.P + 'job:' + id], ['HGETALL', kv.P + 'res:' + id]]));
  const out = [];
  for (let k = 0; k < ids.length; k++) {
    let job; try { job = JSON.parse(raw[2 * k]); } catch { continue; }
    if (!job) continue;
    const a = raw[2 * k + 1] || [], res = {};
    for (let i = 0; i < a.length; i += 2) { try { res[a[i]] = JSON.parse(a[i + 1]); } catch {} }
    job.results = res;
    const age = Date.now() - (job.finished || job.created);
    if (!job.files_removed && ((job.status === 'done' && age > 3600000) || (['failed', 'partial'].includes(job.status) && age > 7 * 864e5))) { await removeFiles(job); job.files_removed = true; }
    out.push(job);
  }
  return out;
}

async function remove(id) {
  const job = await st.job(id);
  if (job) await files.remove([job.video?.pathname, ...(job.sources || []).map(s => s.pathname)].filter(Boolean));
  await st.removeJob(id);
}

module.exports = { create, prepare, postTarget, retry, list, remove, workKey, cleanTags, finishIfDone };
