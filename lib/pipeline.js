// The production line: topic -> script -> voice -> visuals -> sound -> render -> review -> publish.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { DATA, ensureDir, uid, probeDuration, sleep } = require('./util');
const gemini = require('./gemini');
const tts = require('./tts');
const visuals = require('./visuals');
const { renderVideo, renderClips, dims } = require('./render');

const STAGES = ['script', 'voice', 'visuals', 'sound', 'render', 'review', 'publish'];
const jobDir = id => path.join(DATA, 'jobs', id);
const tg = () => require('./telegram');
const yt = () => require('./youtube');
const kaggle = () => require('./kaggle');
const meta = () => require('./meta');
const trends = () => require('./trends');

function createJob({ topic = '', niche = '', language, voice, style, ratio, duration, auto_approve, motion, engine, use_trends = false, schedule_id = null, source = 'studio', targets }) {
  const s = db.settings();
  const job = {
    id: uid(), created: Date.now(), updated: Date.now(), source,
    status: 'queued', stage: 'script', progress: 0,
    topic: String(topic || '').trim(),
    options: {
      niche: niche || s.default_niche,
      language: language || s.default_language,
      voice: voice || s.default_voice,
      style: style || s.default_style,
      ratio: ratio || s.default_ratio,
      duration: Math.max(10, Math.min(900, Number(duration || s.default_duration))),
      auto_approve: auto_approve ?? s.auto_approve,
      motion: motion ?? s.motion_default,
      use_trends: !!use_trends,
      engine: ['veo', 'flow'].includes(engine) ? engine : (engine === 'lumen' ? 'lumen' : (s.default_engine || 'lumen')),
      schedule_id
    },
    targets: plat().clean(Array.isArray(targets) ? targets : plat().defaults()),
    seed: Math.floor(Math.random() * 1e9),
    log: []
  };
  db.addJob(job);
  db.log(job.id, job.topic ? `Queued: ${job.topic}` : 'Queued: topic will be chosen automatically');
  kick();
  return job;
}

function step(id, stage, progress, msg) {
  db.updateJob(id, { stage, progress: Math.round(progress) });
  if (msg) db.log(id, msg);
}

async function produce(job) {
  const id = job.id;
  const dir = ensureDir(jobDir(id));
  const s = db.settings();
  const o = job.options;
  if (job.source === 'upload') return require('./uploads').prepare(job);
  const [W, H] = dims(o.ratio, s.quality);

  // 1. Script
  step(id, 'script', 3, 'Writing the script');
  if (!job.topic && o.use_trends) {
    try {
      const r = await trends().nextIdea(o.niche, o.language);
      if (r) { db.updateJob(id, { topic: r.topic, idea: r.idea }); db.log(id, `Viral idea chosen: ${r.idea.title}`); }
    } catch (e) { db.log(id, 'Viral analysis unavailable, picking a topic from the niche instead. ' + e.message); }
  }
  if (!db.job(id).topic) {
    const recent = db.jobs().slice(0, 40).map(j => j.title || j.topic).filter(Boolean);
    const topic = await gemini.topicIdea(o.niche, o.language, recent);
    db.updateJob(id, { topic });
    db.log(id, `Topic chosen: ${topic}`);
  }
  if (o.engine === 'veo' || o.engine === 'flow') return produceCinematic(db.job(id));
  let script = job.script;
  if (!script || !job.keep_script) {
    script = await gemini.writeScript({ topic: db.job(id).topic, language: o.language, style: o.style, ratio: o.ratio, duration: o.duration });
    db.updateJob(id, { script, title: script.title, description: script.description, tags: script.tags, hashtags: script.hashtags });
  }
  db.log(id, `Script ready: ${script.scenes.length} scenes`);

  // 2. Voice
  const voice = await tts.voiceFor(o.language, o.voice);
  const scenes = [];
  for (let i = 0; i < script.scenes.length; i++) {
    step(id, 'voice', 10 + 20 * (i / script.scenes.length));
    const sc = script.scenes[i];
    const file = path.join(dir, `voice_${i}.mp3`);
    await tts.speak({ text: sc.narration, voice, dest: file });
    scenes.push({ narration: sc.narration, voice: file, voiceDur: await probeDuration(file) });
  }
  db.log(id, `Voice-over recorded with ${voice}`);

  // 3. Visuals
  const used = new Set();
  const look = (visuals.STYLES[o.style] || visuals.STYLES.cartoon).prompt;
  const useStock = o.style === 'stock' && s.pexels_key;
  let fallbacks = 0;
  for (let i = 0; i < scenes.length; i++) {
    step(id, 'visuals', 30 + 35 * (i / scenes.length), i === 0 ? 'Creating visuals' : null);
    const sc = script.scenes[i];
    const query = sc.stock_query || sc.visual || db.job(id).topic;
    const img = path.join(dir, `scene_${i}.jpg`);
    try {
      if (useStock) {
        const vid = path.join(dir, `scene_${i}.mp4`);
        try {
          await visuals.stockVideo({ query, ratio: o.ratio, key: s.pexels_key, dest: vid, used, minDur: scenes[i].voiceDur });
          scenes[i].src = vid; scenes[i].isVideo = true; continue;
        } catch { await visuals.stockPhoto({ query, ratio: o.ratio, key: s.pexels_key, dest: img, used }); }
      } else {
        const prompt = `${sc.visual || query}. ${script.character ? 'Main character: ' + script.character + '. ' : ''}${look}. No text, no watermark.`;
        await visuals.aiImage({ prompt, ratio: o.ratio, seed: job.seed + i, dest: img, token: s.pollinations_token });
      }
    } catch (e) {
      fallbacks++;
      if (s.pexels_key) {
        try { await visuals.stockPhoto({ query, ratio: o.ratio, key: s.pexels_key, dest: img, used }); }
        catch { await plainCard(img, W, H); }
      } else await plainCard(img, W, H);
      db.log(id, `Scene ${i + 1}: image service failed, used a backup picture`);
    }
    scenes[i].src = img;
  }
  if (fallbacks > scenes.length / 2) db.log(id, 'Many images failed. Adding a free Pollinations token or Pexels key in Connections makes this more reliable.');

  // 3b. AI motion on the free Kaggle GPU (falls back to animated pictures if anything goes wrong)
  if (o.motion && kaggle().ready() && !useStock) {
    const max = Math.max(1, Number(s.motion_max_scenes) || 6);
    const pick = scenes.map((sc, i) => i).filter(i => !scenes[i].isVideo).slice(0, max);
    step(id, 'visuals', 50, `Animating ${pick.length} scenes on the free Kaggle GPU. This usually takes 15 to 60 minutes.`);
    try {
      const res = await kaggle().animate({
        ratio: o.ratio,
        onLog: m => db.log(id, m),
        items: pick.map(i => ({ key: 's' + i, image: scenes[i].src, seconds: scenes[i].voiceDur + 0.35,
          prompt: `${script.scenes[i].visual || script.scenes[i].stock_query}. The scene comes alive with smooth, natural motion; characters move and react, subtle camera movement. ${look}` }))
      });
      let ok = 0;
      for (const i of pick) {
        const r = res['s' + i];
        if (r && r.file) {
          const dest = path.join(dir, `motion_${i}.mp4`);
          fs.copyFileSync(r.file, dest);
          scenes[i].src = dest; scenes[i].isVideo = true; scenes[i].hold = true;
          scenes[i].clipDur = await probeDuration(dest);
          ok++;
        }
      }
      db.log(id, ok ? `${ok} of ${pick.length} scenes now have AI motion` : 'AI motion made no clips, using animated pictures: ' + (Object.values(res)[0]?.error || ''));
    } catch (e) {
      db.log(id, 'AI motion skipped, using animated pictures instead. ' + e.message);
    }
  } else if (o.motion && !kaggle().ready()) db.log(id, 'AI motion is on but Kaggle is not connected, using animated pictures');

  // 4. Sound
  step(id, 'sound', 66, 'Adding music and sound effects');
  if (s.freesound_key && s.sfx_enabled !== false) {
    let got = 0;
    for (let i = 0; i < scenes.length; i++) {
      const q = script.scenes[i].sfx;
      if (!q || got >= 4) continue;
      try {
        scenes[i].sfx = await visuals.soundEffect({ query: q, key: s.freesound_key, dest: path.join(dir, `sfx_${i}.mp3`) });
        got++;
      } catch {}
    }
    if (got) db.log(id, `${got} sound effects added (${script.scenes.map(x => x.sfx).filter(Boolean).slice(0, 4).join(', ')})`);
  }
  const music = visuals.pickMusic(script.music_mood, s.music_mode || 'match');
  if (music) db.log(id, `Music: ${path.basename(music)} (mood: ${script.music_mood})`);
  else if (s.music_mode !== 'off') db.log(id, `No music: no track in your library matches the mood "${script.music_mood}". Upload one with that word in its file name.`);

  // 5. Render
  step(id, 'render', 70, 'Rendering the video');
  const out = await renderVideo({
    dir, scenes, W, H, music, musicVolume: Number(s.music_volume) || 0.12,
    subtitles: s.burn_subtitles !== false,
    onProgress: p => db.updateJob(id, { progress: Math.round(70 + 25 * p) })
  });
  for (const f of fs.readdirSync(dir)) if (/^(voice_|sfx_|motion_)|\.txt$|^scene_\d+\.mp4$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  db.updateJob(id, { video: out.video, thumb: out.thumb, duration: out.duration, status: 'review', stage: 'review', progress: 100 });
  db.log(id, `Video ready (${Math.round(out.duration)}s). Waiting for your approval.`);
}

async function plainCard(dest, W, H) {
  const { run } = require('./util');
  const colors = ['0x2b1d3a', '0x1d2f3a', '0x3a2a1d', '0x1d3a2b'];
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=${colors[Math.floor(Math.random() * 4)]}:s=${W}x${H}:d=1`, '-frames:v', '1', dest]);
}

// ---- Cinematic engines: Veo (automatic, paid) and Flow (you make the clips with your Pro plan) ----
const veo = () => require('./veo');
const FLOW_URL = 'https://labs.google/fx/tools/flow';

function shotPrompt(script, shot, o, narrator) {
  const look = (visuals.STYLES[o.style === 'stock' ? 'cinematic' : o.style] || visuals.STYLES.cinematic).prompt;
  const speech = !narrator && shot.dialogue ? ` The character looks at the camera and says in ${o.language}: "${shot.dialogue}"` : ' No one speaks.';
  return `${look}. Main character: ${script.character}. Setting: ${script.setting}. Shot: ${shot.visual}. Camera: ${shot.camera}.${speech} Sound: ${shot.sound}. ${o.ratio === '16:9' ? 'Widescreen 16:9' : 'Vertical 9:16'} framing. No subtitles, no captions, no on-screen text.`;
}

async function produceCinematic(job) {
  const id = job.id, o = job.options, s = db.settings();
  const dir = ensureDir(jobDir(id));
  const [W, H] = dims(o.ratio, s.quality);
  const narrator = s.cinematic_voice === 'narrator';

  let script = job.script;
  if (!script || !script.shots || !job.keep_script) {
    step(id, 'script', 5, 'Writing the shot list');
    script = await gemini.writeShots({ topic: db.job(id).topic, language: o.language, style: o.style, ratio: o.ratio, duration: o.duration, narrator });
    script.shots.forEach(sh => { sh.prompt = shotPrompt(script, sh, o, narrator); });
    db.updateJob(id, { script, title: script.title, description: script.description, tags: script.tags, hashtags: script.hashtags, clips: [], flow_msgs: {} });
    for (const f of fs.readdirSync(dir)) if (/^(shot|flowclip)_\d+\./.test(f)) fs.rmSync(path.join(dir, f), { force: true });
    db.log(id, `Shot list ready: ${script.shots.length} shots of 8 seconds`);
  }
  const shots = script.shots;

  if (o.engine === 'flow') {
    const j = db.job(id);
    if (!j.flow_ready) {
      step(id, 'visuals', 30);
      if (!fs.existsSync(path.join(dir, 'character.jpg'))) {
        try {
          const look = (visuals.STYLES[o.style === 'stock' ? 'cinematic' : o.style] || visuals.STYLES.cinematic).prompt;
          await visuals.aiImage({ prompt: `Character reference portrait, full body, neutral background: ${script.character}. ${look}`, ratio: o.ratio === '16:9' ? '16:9' : '9:16', seed: job.seed, dest: path.join(dir, 'character.jpg'), token: s.pollinations_token });
        } catch {}
      }
      db.updateJob(id, { status: 'flow', stage: 'visuals', progress: 35, character: fs.existsSync(path.join(dir, 'character.jpg')) ? 'character.jpg' : null });
      db.log(id, 'Shot list is ready. Make the clips in Google Flow and upload them here or send them to your Telegram bot.');
      tg().sendFlow(db.job(id)).catch(e => db.log(id, 'Telegram: ' + e.message));
      return 'paused';
    }
  }

  const clipFiles = [];
  if (o.engine === 'flow') {
    const clips = db.job(id).clips || [];
    shots.forEach((sh, i) => { if (clips[i]) clipFiles[i] = path.join(dir, clips[i]); });
    if (!clipFiles.filter(Boolean).length) throw new Error('No Flow clips were uploaded.');
  } else {
    const need = shots.filter((sh, i) => !fs.existsSync(path.join(dir, `shot_${i}.mp4`))).length;
    const cost = veo().estimate(need);
    if (need && cost > veo().budgetLeft()) throw new Error(`This video would cost about $${cost} on Veo, but only $${Math.max(0, veo().budgetLeft())} is left of your monthly limit. Raise the limit in Connections, or use Flow mode.`);
    for (let i = 0; i < shots.length; i++) {
      const f = path.join(dir, `shot_${i}.mp4`);
      if (!fs.existsSync(f)) {
        step(id, 'visuals', 15 + 55 * (i / shots.length), `Veo is filming shot ${i + 1} of ${shots.length}`);
        await veo().generateClip({ prompt: shots[i].prompt, ratio: o.ratio, dest: f, onLog: m => db.log(id, m) });
      }
      clipFiles[i] = f;
    }
    db.log(id, `All shots filmed. Veo spend this month: about $${veo().spent()}`);
  }

  step(id, 'sound', 72, 'Adding music');
  const parts = [];
  for (let i = 0; i < shots.length; i++) {
    if (!clipFiles[i]) continue;
    const part = { file: clipFiles[i], text: shots[i].dialogue || '' };
    if (narrator && shots[i].dialogue) {
      const voice = await tts.voiceFor(o.language, o.voice);
      part.narration = path.join(dir, `voice_${i}.mp3`);
      await tts.speak({ text: shots[i].dialogue, voice, dest: part.narration });
      part.narrationDur = await probeDuration(part.narration);
    }
    parts.push(part);
  }
  const music = visuals.pickMusic(script.music_mood, s.music_mode || 'match');
  if (music) db.log(id, `Music: ${path.basename(music)}`);

  step(id, 'render', 80, 'Joining the shots');
  const out = await renderClips({ dir, clips: parts, W, H, music, musicVolume: Math.min(0.1, Number(s.music_volume) || 0.08), subtitles: s.burn_subtitles !== false,
    onProgress: p => db.updateJob(id, { progress: Math.round(80 + 15 * p) }) });
  for (const f of fs.readdirSync(dir)) if (/^voice_\d+\.(mp3|txt)$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
  db.updateJob(id, { video: out.video, thumb: out.thumb, duration: out.duration, status: 'review', stage: 'review', progress: 100 });
  db.log(id, `Video ready (${Math.round(out.duration)}s). Waiting for your approval.`);
}

// Saves one clip made in Google Flow for a shot. Used by the dashboard upload and the Telegram bot.
// Returns { job, warning }.
async function attachClip(id, shot, srcFile, ext = '.mp4') {
  const j = db.job(id);
  if (!j || j.status !== 'flow') { fs.rmSync(srcFile, { force: true }); throw new Error('This video is not waiting for Flow clips.'); }
  const shots = j.script?.shots || [];
  if (!(shot >= 0 && shot < shots.length)) { fs.rmSync(srcFile, { force: true }); throw new Error('Unknown shot number.'); }
  ext = String(ext || '.mp4').toLowerCase();
  if (!['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) ext = '.mp4';
  const { run } = require('./util');
  let info;
  try {
    const out = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', srcFile]);
    const p = JSON.parse(out);
    info = { w: p.streams?.[0]?.width, h: p.streams?.[0]?.height, dur: parseFloat(p.format?.duration) || 0 };
  } catch { info = null; }
  if (!info || !info.w || !info.h) { fs.rmSync(srcFile, { force: true }); throw new Error('This file is not a video KMR Studio can read. Download the clip from Flow as MP4 and upload it again.'); }
  const dir = ensureDir(jobDir(id));
  for (const f of fs.readdirSync(dir)) if (f.startsWith(`flowclip_${shot}.`)) fs.rmSync(path.join(dir, f), { force: true });
  const name = `flowclip_${shot}${ext}`;
  fs.renameSync(srcFile, path.join(dir, name));
  const clips = [...(db.job(id).clips || [])]; clips[shot] = name;
  while (clips.length < shots.length) clips.push(null);
  const want = j.options.ratio === '16:9' ? 'landscape' : j.options.ratio === '1:1' ? 'square' : 'portrait';
  const got = info.w > info.h * 1.1 ? 'landscape' : info.h > info.w * 1.1 ? 'portrait' : 'square';
  const warning = want !== got && want !== 'square'
    ? `Shot ${shot + 1} is ${got} but this video is ${j.options.ratio}. KMR Studio will crop it to fit; for a better result, set the aspect ratio in Flow to ${want === 'portrait' ? 'Portrait 9:16' : 'Landscape 16:9'}.`
    : '';
  db.updateJob(id, { clips });
  db.log(id, `Clip for shot ${shot + 1} received (${Math.round(info.dur)}s, ${info.w}x${info.h})`);
  return { job: db.job(id), warning };
}

function removeClip(id, shot) {
  const j = db.job(id);
  if (!j || j.status !== 'flow') return j;
  const dir = jobDir(id);
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (f.startsWith(`flowclip_${shot}.`)) fs.rmSync(path.join(dir, f), { force: true });
  const clips = [...(j.clips || [])]; clips[shot] = null;
  return db.updateJob(id, { clips });
}

const flowCount = j => { const shots = j.script?.shots || []; return { done: shots.filter((_, i) => (j.clips || [])[i]).length, total: shots.length }; };

function flowFinish(id) {
  const j = db.job(id);
  if (!j || j.status !== 'flow') return j;
  if (!flowCount(j).done) throw new Error('Upload at least one clip first.');
  db.updateJob(id, { flow_ready: true, keep_script: true, status: 'queued' });
  db.log(id, 'Flow clips received, finishing the video');
  kick();
  return db.job(id);
}

// ---- review actions ----
async function approve(id, by = 'dashboard') {
  const j = db.job(id);
  if (!j || !['review', 'approved', 'failed_upload'].includes(j.status)) return j;
  db.updateJob(id, { status: 'approved', stage: 'publish', approved_by: by });
  db.log(id, `Approved from ${by}`);
  kick();
  return db.job(id);
}
function reject(id, by = 'dashboard') {
  const j = db.job(id); if (!j) return;
  db.updateJob(id, { status: 'rejected' });
  db.log(id, `Rejected from ${by}`);
  return db.job(id);
}
function remake(id, { newScript = true } = {}) {
  const j = db.job(id); if (!j || j.source === 'repurpose' || j.source === 'upload') return j;
  db.updateJob(id, { status: 'queued', stage: 'script', progress: 0, error: null, seed: Math.floor(Math.random() * 1e9), keep_script: !newScript, video: null, thumb: null, flow_ready: newScript ? false : j.flow_ready });
  db.log(id, newScript ? 'Remaking with a new script' : 'Re-rendering with the same script');
  kick();
  return db.job(id);
}
function remove(id) {
  fs.rmSync(jobDir(id), { recursive: true, force: true });
  db.removeJob(id);
}

const plat = () => require('./platforms');
// kept for older callers: which platforms have at least one connected profile
function connectedPlatforms() {
  const out = {};
  for (const [k, v] of Object.entries(plat().P)) out[k] = db.profiles().some(p => v.ok(p));
  return out;
}

async function publish(j) {
  const id = j.id, P = plat();
  const targets = P.clean(P.targetsOf(j));
  const published = P.publishedOf(j);
  const todo = targets.filter(t => !published[t]);
  const ready = todo.filter(P.isReady), missing = todo.filter(t => !P.isReady(t));
  if (!ready.length) {
    if (!todo.length && Object.keys(published).length) { db.updateJob(id, { status: 'published', published, waiting_for: null, failed: [] }); return; }
    db.updateJob(id, { status: 'approved', waiting_for: 'accounts' });
    db.log(id, targets.length ? `Approved. Waiting for ${missing.map(P.label).join(', ')} to be connected in Connections.` : 'Approved. Choose where to post it (open the video, Post to).');
    return;
  }
  db.updateJob(id, { status: 'uploading', waiting_for: null, error: null });
  const file = path.join(jobDir(id), j.video), thumb = j.thumb ? path.join(jobDir(id), j.thumb) : null;
  const errors = {};
  for (const t of missing) errors[t] = 'not connected. Connect it in Connections, then press Try posting again.';
  for (const t of ready) {
    const [pid, pl] = P.split(t);
    db.log(id, `Posting to ${P.label(t)}`);
    try {
      const r = await P.P[pl].post(db.profile(pid), db.job(id), file, thumb);
      published[t] = { ...r, label: P.label(t) };
      db.updateJob(id, { published, youtube: null });
      db.log(id, `Published on ${P.label(t)}: ${r.url}${r.note ? ' (' + r.note + ')' : ''}`);
    } catch (e) {
      errors[t] = e.message;
      db.log(id, `${P.label(t)} failed: ${e.message}`);
    }
  }
  const failed = Object.keys(errors);
  const title = tg().esc(j.title || j.topic);
  const links = Object.entries(published).map(([t, r]) => `${r.label || P.label(t)}: ${r.url}`).join('\n');
  if (failed.length) {
    db.updateJob(id, { status: 'failed_upload', published, failed, error: failed.map(t => `${P.label(t)}: ${errors[t]}`).join('\n') });
    tg().notify(`⚠️ <b>${title}</b>\n${failed.map(t => tg().esc(P.label(t) + ' failed: ' + errors[t])).join('\n')}${links ? '\n\n' + links : ''}`).catch(() => {});
  } else {
    db.updateJob(id, { status: 'published', stage: 'publish', published, failed: [], published_at: Date.now() });
    tg().notify(`✅ Published: <b>${title}</b>\n${links}`).catch(() => {});
  }
}

// After an account is (re)connected: posts waiting for it, or failed on it, go again.
function accountsChanged() {
  const P = plat();
  for (const j of db.jobs()) {
    if (j.waiting_for) db.updateJob(j.id, { waiting_for: null });
    if (j.status === 'failed_upload' && (j.failed || []).some(P.isReady)) { db.updateJob(j.id, { status: 'approved', error: null }); db.log(j.id, 'Account reconnected, posting again'); }
  }
  kick();
}

// ---- workers ----
let making = false, uploading = false;
function kick() { setImmediate(makeNext); setImmediate(uploadNext); }

async function makeNext() {
  if (making) return;
  const next = db.jobs().filter(j => j.status === 'queued').sort((a, b) => a.created - b.created)[0];
  if (!next) return;
  making = true;
  db.updateJob(next.id, { status: 'working', error: null });
  try {
    await produce(db.job(next.id));
    const j = db.job(next.id);
    if (j.status !== 'review') return;
    if (j.options.auto_approve) await approve(j.id, j.source === 'upload' ? 'Upload page' : 'autopilot');
    else tg().sendReview(j).catch(e => db.log(j.id, 'Telegram: ' + e.message));
  } catch (e) {
    console.error(e);
    db.updateJob(next.id, { status: 'failed', error: e.message });
    db.log(next.id, 'Failed: ' + e.message);
    tg().notify(`⚠️ Video failed: <b>${tg().esc(next.topic || 'auto topic')}</b>\n${tg().esc(e.message.slice(0, 300))}`).catch(() => {});
  } finally {
    making = false;
    setTimeout(makeNext, 500);
  }
}

async function uploadNext() {
  if (uploading) return;
  const next = db.jobs().filter(j => j.status === 'approved' && !j.waiting_for).sort((a, b) => a.created - b.created)[0];
  if (!next) return;
  uploading = true;
  try { await publish(next); } finally { uploading = false; setTimeout(uploadNext, 1000); }
}

function start() {
  // recover from a restart mid-job
  for (const j of db.jobs()) {
    if (j.status === 'working' && j.source === 'repurpose') { db.updateJob(j.id, { status: 'failed', error: 'Interrupted by a restart. Run the video tool again.' }); continue; }
    if (j.status === 'working') { db.updateJob(j.id, { status: 'queued' }); db.log(j.id, 'Restarted after server restart'); }
    if (j.status === 'uploading') db.updateJob(j.id, { status: 'approved' });
  }
  for (const t of db.tools()) {
    if (t.status === 'working' && (t.kind === 't2v' || t.kind === 'i2v')) db.updateTool(t.id, { status: 'queued' });
  }
  kick();
  setInterval(() => { kick(); toolNext(); }, 30000);
  toolNext();
}

function youtubeConnected() { accountsChanged(); }

// ---- ready-made videos (from the video-to-video tool) join the normal approve and post flow ----
function addReadyJob({ title, description, hashtags, language, source, topic }) {
  const s = db.settings();
  const job = {
    id: uid(), created: Date.now(), updated: Date.now(), source, status: 'working', stage: 'render', progress: 80,
    topic: topic || title, title: String(title || '').slice(0, 100), description, hashtags, tags: (hashtags || []).map(h => h.replace('#', '')),
    options: { language: language || s.default_language, style: 'stock', ratio: '9:16', duration: 60, auto_approve: false, motion: false },
    targets: plat().clean(plat().defaults()),
    log: []
  };
  db.addJob(job); ensureDir(jobDir(job.id));
  db.log(job.id, 'Cut from your uploaded video');
  return job;
}
function finishReadyJob(id, { duration }) {
  db.updateJob(id, { video: 'final.mp4', thumb: 'thumb.jpg', duration, status: 'review', stage: 'review', progress: 100 });
  db.log(id, `Short ready (${Math.round(duration)}s). Waiting for your approval.`);
  tg().sendReview(db.job(id)).catch(e => db.log(id, 'Telegram: ' + e.message));
}

// ---- Tools: text to video / image to video on the Kaggle GPU ----
const toolDir = () => ensureDir(path.join(DATA, 'tools'));
let tooling = false;
async function toolNext() {
  if (tooling) return;
  const t = db.tools().filter(x => x.status === 'queued' && (x.kind === 't2v' || x.kind === 'i2v')).sort((a, b) => a.created - b.created)[0];
  if (!t) return;
  tooling = true;
  db.updateTool(t.id, { status: 'working', note: 'Waiting for the Kaggle GPU' });
  try {
    const res = await kaggle().animate({
      ratio: t.ratio,
      onLog: m => db.updateTool(t.id, { note: m }),
      items: [{ key: 't', image: t.image ? path.join(toolDir(), t.image) : null, prompt: t.prompt, seconds: t.seconds }]
    });
    const r = res.t;
    if (!r || !r.file) throw new Error(r?.error || 'No clip was made');
    const name = `${t.id}.mp4`;
    fs.copyFileSync(r.file, path.join(toolDir(), name));
    db.updateTool(t.id, { status: 'done', file: name, note: '' });
    tg().notify(`🎞️ Your ${t.image ? 'image-to-video' : 'text-to-video'} clip is ready in KMR Studio Tools.`).catch(() => {});
  } catch (e) {
    db.updateTool(t.id, { status: 'failed', note: e.message });
  } finally { tooling = false; setTimeout(toolNext, 500); }
}
function createTool({ kind, prompt, ratio, seconds, image }) {
  const t = { id: uid(), created: Date.now(), kind, prompt: String(prompt || '').slice(0, 1200), ratio: ratio || '9:16', seconds: Math.max(2, Math.min(4, Number(seconds) || 4)), image: image || null, status: 'queued', note: 'Queued' };
  db.addTool(t); setImmediate(toolNext); return t;
}

module.exports = { STAGES, accountsChanged, createJob, approve, reject, remake, remove, start, kick, jobDir, youtubeConnected, createTool, toolDir, connectedPlatforms, addReadyJob, finishReadyJob, flowFinish, attachClip, removeClip, flowCount, FLOW_URL };
