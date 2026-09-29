// Autopilot: at the times you set, KMR Studio writes a script, makes the video (Veo clips, or free AI
// pictures when the video credit is used up), adds an AI voice and subtitles, then sends it for your OK and posts it.
// The making runs in steps; each background run hands over to a fresh one before the 5-minute limit.
const fs = require('fs');
const path = require('path');
const st = require('./state');
const kv = require('./kv');
const files = require('./files');

const RUN_MS = 270000;
const LENGTHS = [15, 30, 45, 60];
const DAYS = [0, 1, 2, 3, 4, 5, 6];
const IST = 5.5 * 3600000;

// ---- schedules ----
async function schedules() { const l = await kv.getJ('schedules'); return Array.isArray(l) ? l : []; }
function clean(b, old = {}) {
  const times = (Array.isArray(b.times) ? b.times : String(b.times ?? old.times ?? '19:00').split(/[\s,]+/))
    .map(t => String(t).trim()).filter(t => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t)).map(t => t.padStart(5, '0'));
  const s = {
    id: old.id || st.uid(),
    name: String(b.name ?? old.name ?? '').trim().slice(0, 60) || 'My autopilot',
    enabled: b.enabled !== undefined ? !!b.enabled : old.enabled !== undefined ? old.enabled : true,
    about: String(b.about ?? old.about ?? '').trim().slice(0, 600),
    topics: String(b.topics ?? old.topics ?? '').trim().slice(0, 6000),
    language: String(b.language ?? old.language ?? 'English').trim().slice(0, 30) || 'English',
    voice: (b.voice ?? old.voice) === 'male' ? 'male' : 'female',
    seconds: LENGTHS.includes(Number(b.seconds ?? old.seconds)) ? Number(b.seconds ?? old.seconds) : 30,
    ratio: (b.ratio ?? old.ratio) === '16:9' ? '16:9' : '9:16',
    days: (Array.isArray(b.days) ? b.days : old.days || DAYS).map(Number).filter(d => DAYS.includes(d)),
    times: times.length ? [...new Set(times)].slice(0, 6) : ['19:00'],
    targets: [...new Set((b.targets ?? old.targets ?? []).map(String))].filter(t => /^[\w-]+:(youtube|instagram|facebook|linkedin|x)$/.test(t)),
    approve: b.approve !== undefined ? !!b.approve : old.approve !== undefined ? old.approve : true,
    engine: (b.engine ?? old.engine) === 'free' ? 'free' : 'auto'
  };
  if (!s.about && !s.topics) throw new Error('Write what the videos are about (or a list of topics).');
  if (!s.days.length) throw new Error('Pick at least one day.');
  return s;
}
async function saveSchedule(b) {
  const list = await schedules();
  const i = b.id ? list.findIndex(x => x.id === b.id) : -1;
  const s = clean(b, i >= 0 ? list[i] : {});
  if (i >= 0) list[i] = s; else { if (list.length >= 10) throw new Error('Up to 10 autopilots.'); list.push(s); }
  await kv.setJ('schedules', list);
  return s;
}
async function removeSchedule(id) { await kv.setJ('schedules', (await schedules()).filter(x => x.id !== id)); }

// ---- the clock: called every hour by the platform ----
const istParts = ms => { const d = new Date(ms + IST); return { day: d.getUTCDay(), date: d.toISOString().slice(0, 10) }; };
function dueSlots(s, now) {
  const out = [];
  for (const back of [0, 1]) {
    const { day, date } = istParts(now - back * 864e5);
    if (!s.days.includes(day)) continue;
    for (const t of s.times) {
      const at = Date.parse(`${date}T${t}:00Z`) - IST;
      if (at <= now && now - at < 3 * 3600000) out.push(`${date} ${t}`);
    }
  }
  return out;
}
async function tick(base) {
  const now = Date.now();
  const started = [];
  for (const s of await schedules()) {
    if (!s.enabled) continue;
    for (const slot of dueSlots(s, now)) {
      if ((await kv.cmd('SET', kv.P + `slot:${s.id}:${slot}`, '1', 'NX', 'EX', 3 * 86400)) !== 'OK') continue;
      try { started.push((await runNow(s.id, base)).id); }
      catch (e) { require('./telegram').send(`⚠️ Autopilot "${esc(s.name)}" could not start: ${esc(e.message)}`).catch(() => {}); }
    }
  }
  // a video whose making stopped (for example a lost hand-over) is picked up again
  for (const id of await st.jobIds(30)) {
    const j = await st.job(id);
    if (j && j.status === 'making' && now - (j.updated || j.created) > 8 * 60000 && now - j.created < 2 * 3600000) {
      await trigger(base, id).catch(() => {});
    }
  }
  return { started };
}
const esc = t => String(t).replace(/[<>&]/g, '');

// Starts one video now (the clock, or the Run now button).
async function runNow(sid, base) {
  const s = (await schedules()).find(x => x.id === sid);
  if (!s) throw new Error('This autopilot no longer exists.');
  const set = await st.settings();
  if (!set.gemini_key && !set.groq_key && !set.veo_key_1 && !set.veo_key_2) throw new Error('Add a Gemini key first (Settings, or the video key in Autopilot).');
  const profs = await st.allProfiles();
  const targets = s.targets.filter(t => { const [pid, pl] = t.split(':'); return st.connected(profs.find(p => p.id === pid), pl); });
  if (!targets.length) throw new Error('None of its "Post to" accounts is connected. Connect them in Profiles.');
  const job = {
    id: st.uid(), created: Date.now(), status: 'making', mode: 'single', auto: null,
    title: s.name, description: '', hashtags: [], hint: '', approve: s.approve, thumb_mode: set.auto_thumb === false ? 'none' : 'auto',
    targets, sources: [], ratio: 'auto', fit: 'crop', autopilot: s.id,
    make: { sid: s.id, stage: 'script', engine: s.engine, seconds: s.seconds, ratio: s.ratio, voice: s.voice, language: s.language },
    log: [{ t: Date.now(), msg: `Autopilot "${s.name}": writing the script` }]
  };
  await st.addJob(job);
  await trigger(base, job.id);
  return job;
}
async function trigger(base, id) { return require('./jobs').trigger(base, { kind: 'make', job: id }); }
async function lock(name, sec) { return (await kv.cmd('SET', kv.P + 'lock:' + name, '1', 'NX', 'EX', sec)) === 'OK'; }
async function unlock(name) { await kv.cmd('DEL', kv.P + 'lock:' + name); }

// ---- step: the script ----
async function nextTopic(s) {
  const lines = String(s.topics || '').split('\n').map(x => x.trim()).filter(Boolean);
  if (!lines.length) return '';
  const n = Number(await kv.cmd('INCR', kv.P + 'ap_next:' + s.id)) || 1;
  return lines[(n - 1) % lines.length];
}
async function writeScript(job, s) {
  const m = job.make;
  const clips = Math.ceil(m.seconds / 8);
  const scenes = m.engine === 'veo' ? clips : Math.max(4, Math.min(12, Math.round(m.seconds / 4)));
  const latin = /english|spanish|french|german|portug|italian|indonesian|malay/i.test(m.language);
  const words = Math.round(m.seconds * (latin ? 2.3 : 1.6));
  const topic = await nextTopic(s);
  const recent = (await kv.getJ('ap_recent:' + s.id)) || [];
  const prompt = `You create short social media videos (Reels, Shorts).
Channel / theme: ${s.about || '(see topic)'}
${topic ? `Topic of this video: ${topic}` : `Pick one fresh, specific, interesting topic that fits the theme. Do not repeat these recent ones: ${recent.join(' | ') || 'none yet'}.`}
Write the title, description, hashtags, thumbnail words and narration in ${m.language}.
Return only JSON:
{"title": "catchy title, max 70 characters",
 "description": "2-3 short sentences and a call to follow",
 "hashtags": ["8 to 12 hashtags without #"],
 "thumb_text": "2 to 4 punchy words for the thumbnail",
 "narration": "the spoken voice-over, about ${words} words so it fits in ${m.seconds} seconds; start with a strong hook; plain text, no stage directions or emojis",
 "scenes": [exactly ${scenes} items like {"visual": "in English: one shot for an AI video/image generator - subject, action, setting, lighting, camera move; realistic and cinematic; no text, letters or logos on screen"}]}
The scenes follow the narration in order.`;
  const set = await st.settings();
  const keys = [set.gemini_key, set.veo_key_1, set.veo_key_2].map(k => String(k || '').trim()).filter(Boolean);
  let out = null, err = '';
  for (const k of keys) {
    try { out = await require('./gemini').json(k, [{ text: prompt }], { temperature: 0.95, timeout: 50000, budget: 100000 }); break; }
    catch (e) { err = e.message; }
  }
  if (!out && set.groq_key) { try { out = await require('./groq').json(set.groq_key, prompt); } catch (e) { err = e.message; } }
  if (!out) throw new Error('The AI could not write the script: ' + (err || 'no Gemini or Groq key'));
  const list = (Array.isArray(out.scenes) ? out.scenes : []).map(x => String(x?.visual || x || '').trim()).filter(Boolean);
  if (!out.narration || !list.length) throw new Error('The AI script came back empty. It will try again next time.');
  while (list.length < scenes) list.push(list[list.length % Math.max(1, list.length)]);
  await kv.setJ('ap_recent:' + s.id, [String(out.title || topic).slice(0, 80), ...recent].slice(0, 15));
  return {
    title: String(out.title || s.name).slice(0, 100), description: String(out.description || '').slice(0, 4000),
    hashtags: out.hashtags || [], thumb_text: String(out.thumb_text || '').slice(0, 40),
    narration: String(out.narration).slice(0, 2500), scenes: list.slice(0, scenes)
  };
}

// ---- the whole making, one step after another ----
async function make(id, base) {
  const name = 'make:' + id;
  if (!await lock(name, 295)) return;
  const media = require('./media');
  const veo = require('./veo');
  const started = Date.now(), timeLeft = () => started + RUN_MS - Date.now();
  const dir = media.tmpDir('m' + id);
  let handOver = false;
  const save = async patch => { const j = await st.job(id); Object.assign(j.make, patch); return st.saveJob(j); };
  try {
    let job = await st.job(id);
    if (!job || job.status !== 'making') return;
    const s = (await schedules()).find(x => x.id === job.make.sid) || { id: job.make.sid, name: job.title, about: '', topics: '' };
    const W = job.make.ratio === '16:9' ? 1280 : 720, Hh = job.make.ratio === '16:9' ? 720 : 1280;

    while (true) {
      job = await st.job(id);
      const m = job.make;
      if (m.stage === 'script') {
        let engine = 'free', key = null;
        if (m.engine !== 'free') {
          key = await veo.pickKey(Math.ceil(m.seconds / 8));
          if (key) engine = 'veo';
          else await st.log(id, (await veo.keys()).length ? 'This month\'s video credit is used up, so it uses free AI pictures' : 'No video key yet, so it uses free AI pictures');
        }
        const sc = await writeScript({ ...job, make: { ...m, engine } }, s);
        job = await st.job(id);
        Object.assign(job, { title: sc.title, description: sc.description, hashtags: require('./jobs').cleanTags(sc.hashtags), thumb_text: sc.thumb_text });
        Object.assign(job.make, { stage: engine === 'veo' ? 'veo_start' : 'pictures', engine, script: sc, key_tail: key ? key.slice(-6) : '' });
        await st.saveJob(job);
        await st.log(id, `Script ready: ${sc.title}`);
        await st.log(id, engine === 'veo' ? `Making ${sc.scenes.length} video clips with Veo (about 2 minutes)` : `Making ${sc.scenes.length} AI pictures`);
        continue;
      }
      if (m.stage === 'veo_start') {
        const key = (await veo.keys()).find(k => k.slice(-6) === m.key_tail);
        try {
          if (!key) throw new Error('The video key was removed.');
          const ops = [...(m.ops || [])];
          for (let k = ops.length; k < m.script.scenes.length; k++) {
            ops.push(await veo.start(key, `${m.script.scenes[k]}. Cinematic, realistic, smooth camera, natural sound, no text on screen.`, m.ratio));
            await save({ ops });
          }
          await save({ stage: 'veo_wait', ops, clips: [], veo_since: Date.now() });
        } catch (e) { await fallBack(id, e); }
        continue;
      }
      if (m.stage === 'veo_wait') {
        const key = (await veo.keys()).find(k => k.slice(-6) === m.key_tail);
        try {
          if (!key) throw new Error('The video key was removed.');
          const clips = [...(m.clips || [])];
          while (clips.filter(Boolean).length < m.ops.length) {
            for (const [k, op] of m.ops.entries()) {
              if (clips[k]) continue;
              const r = await veo.check(key, op);
              if (!r.done) continue;
              const f = path.join(dir, `c${k}.mp4`);
              await veo.download(key, r.uri, f);
              clips[k] = `out/${id}-c${k}.mp4`;
              await files.putFile(clips[k], f, 'video/mp4');
              await save({ clips });
            }
            if (clips.filter(Boolean).length >= m.ops.length) break;
            if (Date.now() - (m.veo_since || started) > 15 * 60000) throw new Error('Veo took too long.');
            if (timeLeft() < 30000) { handOver = true; break; }
            await new Promise(r => setTimeout(r, 10000));
          }
          if (handOver) break;
          await save({ stage: 'voice' });
          await st.log(id, 'Video clips ready');
        } catch (e) { await fallBack(id, e); }
        continue;
      }
      if (m.stage === 'pictures') {
        const compose = require('./compose');
        const pics = [...(m.pics || [])];
        const todo = m.script.scenes.map((p, k) => k).filter(k => !pics[k]);
        // a few at a time, so a slow picture service does not use up the run
        for (let i = 0; i < todo.length; i += 4) {
          if (timeLeft() < 90000) { handOver = true; break; }
          await Promise.all(todo.slice(i, i + 4).map(async k => {
            const f = path.join(dir, `p${k}.jpg`);
            await compose.picture(`${m.script.scenes[k]}, cinematic photo, dramatic light, highly detailed, no text`, W, Hh, f, (Date.now() % 100000) + k);
            pics[k] = `out/${id}-p${k}.jpg`;
            await files.putFile(pics[k], f, 'image/jpeg');
          }));
          await save({ pics });
        }
        if (handOver) break;
        await save({ stage: 'voice', pics });
        await st.log(id, 'Pictures ready');
        continue;
      }
      if (m.stage === 'voice') {
        if (timeLeft() < 120000) { handOver = true; break; }
        let voice = '';
        try {
          const f = await require('./tts').speak(m.script.narration, { voice: m.voice, out: path.join(dir, 'voice.wav') });
          voice = `out/${id}-voice.wav`;
          await files.putFile(voice, f, 'audio/wav');
          await st.log(id, 'AI voice ready');
        } catch (e) { await st.log(id, e.message + ' The video gets subtitles only.'); }
        await save({ stage: 'render', voice_file: voice });
        continue;
      }
      if (m.stage === 'render') {
        if (timeLeft() < 170000) { handOver = true; break; }
        await st.log(id, 'Putting the video together');
        const kind = m.engine === 'veo' && (m.clips || []).length ? 'clips' : 'pictures';
        const list = kind === 'clips' ? m.clips : m.pics;
        const inputs = [];
        for (const [k, p] of list.entries()) { const f = path.join(dir, `in${k}${path.extname(p)}`); await files.download(p, f); inputs.push(f); }
        let voice = null;
        if (m.voice_file) { voice = path.join(dir, 'voice.wav'); await files.download(m.voice_file, voice); }
        const out = path.join(dir, 'final.mp4');
        await require('./compose').build({ kind, inputs, narration: m.script.narration, voice, W, H: Hh, dir, out, timeLeft: () => started + 290000 - Date.now() });
        const raw = `out/${id}-raw.mp4`;
        await files.putFile(raw, out, 'video/mp4');
        await files.remove([...(m.clips || []), ...(m.pics || []), m.voice_file || ''].filter(Boolean));
        const j = await st.job(id);
        j.sources = [{ pathname: raw, name: j.title + '.mp4', size: fs.statSync(out).size }];
        j.status = 'preparing';
        j.make = { ...j.make, stage: 'done', clips: [], pics: [] };
        await st.saveJob(j);
        await st.log(id, 'Video made');
        await require('./jobs').trigger(base, { kind: 'prepare', job: id });
        break;
      }
      break;
    }
  } catch (e) {
    const j = await st.job(id);
    if (j) {
      await st.patchJob(id, { status: 'failed', error: e.message });
      await st.log(id, 'Autopilot could not make the video: ' + e.message);
      await files.remove([...(j.make?.clips || []), ...(j.make?.pics || []), j.make?.voice_file].filter(Boolean)).catch(() => {});
      require('./telegram').send(`⚠️ Autopilot could not make "${esc(j.title)}": ${esc(e.message)}`).catch(() => {});
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    await unlock(name);
  }
  if (handOver) await trigger(base, id).catch(e => st.log(id, 'Could not continue: ' + e.message));
}

// Veo failed (credit, billing, safety filter): the same script is made with free pictures instead.
async function fallBack(id, e) {
  const j = await st.job(id);
  await files.remove((j.make.clips || []).filter(Boolean)).catch(() => {});
  const need = Math.max(4, Math.min(12, Math.round(j.make.seconds / 4)));
  const scenes = [...j.make.script.scenes];
  while (scenes.length < need) scenes.push(scenes[scenes.length % j.make.script.scenes.length]);
  j.make = { ...j.make, stage: 'pictures', engine: 'free', clips: [], ops: [], pics: [], script: { ...j.make.script, scenes } };
  await st.saveJob(j);
  await st.log(id, 'Veo did not work (' + e.message + '). Using free AI pictures instead.');
}

module.exports = { schedules, saveSchedule, removeSchedule, tick, runNow, make, dueSlots, LENGTHS };
