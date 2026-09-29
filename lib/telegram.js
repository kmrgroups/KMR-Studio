// Telegram bot: sends finished videos with Approve / Reject / Remake buttons,
// and lets you order a new video by just texting a topic to the bot.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { sleep } = require('./util');

const api = t => `https://api.telegram.org/bot${t}`;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pipeline = () => require('./pipeline');

async function call(method, body, token) {
  const t = token || db.settings().telegram_token;
  if (!t) throw new Error('Telegram is not connected');
  const r = await fetch(`${api(t)}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}), signal: AbortSignal.timeout(30000)
  });
  const j = await r.json().catch(() => { throw new Error('Telegram could not be reached. Check the internet connection of the computer running KMR Studio.'); });
  if (!j.ok) throw new Error('Telegram: ' + j.description);
  return j.result;
}

function ready() { const s = db.settings(); return s.telegram_token && s.telegram_chat_id; }

async function notify(text) {
  if (!ready()) return;
  return call('sendMessage', { chat_id: db.settings().telegram_chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

function keyboard(id) {
  return { inline_keyboard: [
    [{ text: '✅ Approve & post', callback_data: 'ap:' + id }, { text: '❌ Reject', callback_data: 'rj:' + id }],
    [{ text: '🔁 Remake (new script)', callback_data: 'rm:' + id }]
  ] };
}

async function sendReview(job) {
  if (!ready()) return;
  const s = db.settings();
  const dir = pipeline().jobDir(job.id);
  const file = path.join(dir, job.video);
  const link = s.public_url ? `\n\nOpen in studio: ${s.public_url}/#library/${job.id}` : '';
  const P = require('./platforms');
  const dest = P.clean(P.targetsOf(job)).map(P.label);
  const caption = `🎬 <b>${esc(job.title || job.topic)}</b>\n${esc(job.options.ratio)} ${esc(job.options.language)} ${Math.round(job.duration || 0)}s\n📤 ${esc(dest.length ? dest.join(', ') : 'No accounts chosen yet')}\n\n${esc((job.description || '').slice(0, 400))}${esc(link)}`.slice(0, 1020);
  const size = fs.statSync(file).size;
  const fd = new FormData();
  fd.append('chat_id', s.telegram_chat_id);
  fd.append('caption', caption);
  fd.append('parse_mode', 'HTML');
  fd.append('reply_markup', JSON.stringify(keyboard(job.id)));
  if (size < 49 * 1024 * 1024) {
    fd.append('supports_streaming', 'true');
    fd.append('video', new Blob([fs.readFileSync(file)], { type: 'video/mp4' }), 'video.mp4');
    await post('sendVideo', fd);
  } else {
    fd.append('photo', new Blob([fs.readFileSync(path.join(dir, job.thumb))], { type: 'image/jpeg' }), 'thumb.jpg');
    await post('sendPhoto', fd);
  }
  db.log(job.id, 'Sent to Telegram for approval');
}

// ---- Flow assistant: shot prompts arrive on the phone; clips come back by sending them to the bot ----
async function sendFlow(job) {
  if (!ready()) return;
  const s = db.settings();
  const shots = job.script?.shots || [];
  const orient = job.options.ratio === '16:9' ? 'Landscape 16:9' : 'Portrait 9:16';
  const intro = `🎬 <b>Shot list ready: ${esc(job.title || job.topic)}</b>\n\n` +
    `1. Open Google Flow, New project, aspect ratio <b>${orient}</b>, model <b>Veo 3.1 Fast</b>.\n` +
    (job.character ? '2. Save the character picture above and add it in Flow as an <b>Ingredient</b>.\n' : '') +
    `${job.character ? 3 : 2}. For each shot below: tap the prompt to copy it, paste it in Flow, generate and download the clip.\n` +
    `${job.character ? 4 : 3}. <b>Reply to the shot's message with the clip</b> (or just send clips in order). I finish the video when you press Finish.`;
  if (job.character) {
    const fd = new FormData();
    fd.append('chat_id', s.telegram_chat_id);
    fd.append('caption', intro.slice(0, 1020));
    fd.append('parse_mode', 'HTML');
    fd.append('document', new Blob([fs.readFileSync(path.join(pipeline().jobDir(job.id), job.character))], { type: 'image/jpeg' }), 'character.jpg');
    await post('sendDocument', fd).catch(() => call('sendMessage', { chat_id: s.telegram_chat_id, text: intro, parse_mode: 'HTML' }));
  } else await call('sendMessage', { chat_id: s.telegram_chat_id, text: intro, parse_mode: 'HTML' });
  const msgs = {};
  for (let i = 0; i < shots.length; i++) {
    const sh = shots[i];
    const text = `<b>Shot ${i + 1} of ${shots.length}</b>${sh.dialogue ? `\nSays: <i>${esc(sh.dialogue)}</i>` : ''}\n\n<code>${esc(sh.prompt)}</code>\n\n↩️ Reply to this message with the clip for shot ${i + 1}.`;
    const m = await call('sendMessage', { chat_id: s.telegram_chat_id, text: text.slice(0, 4090), parse_mode: 'HTML' });
    msgs[m.message_id] = i;
  }
  db.updateJob(job.id, { flow_msgs: msgs });
  db.log(job.id, 'Shot prompts sent to Telegram');
}

async function downloadFile(fileId, dest) {
  const f = await call('getFile', { file_id: fileId });
  if (!f.file_path) throw new Error('Telegram did not give the file.');
  const r = await fetch(`https://api.telegram.org/file/bot${db.settings().telegram_token}/${f.file_path}`, { signal: AbortSignal.timeout(300000) });
  if (!r.ok) throw new Error('Could not download the clip from Telegram (' + r.status + ')');
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return path.extname(f.file_path) || '.mp4';
}

async function receiveClip(msg) {
  const chat = msg.chat.id;
  const media = msg.video || (msg.document && /^video\//.test(msg.document.mime_type || '') ? msg.document : null) || msg.animation;
  const waiting = db.jobs().filter(j => j.status === 'flow').sort((a, b) => a.created - b.created);
  if (!waiting.length) return call('sendMessage', { chat_id: chat, text: 'No video is waiting for Flow clips right now.' });
  let job = null, shot = -1;
  const replyId = msg.reply_to_message?.message_id;
  if (replyId) for (const j of waiting) if (j.flow_msgs && replyId in j.flow_msgs) { job = j; shot = Number(j.flow_msgs[replyId]); break; }
  if (!job) {
    job = waiting[0];
    shot = (job.script?.shots || []).findIndex((_, i) => !(job.clips || [])[i]);
    if (shot < 0) return call('sendMessage', { chat_id: chat, text: 'All shots already have clips. To replace one, reply to that shot\'s message with the new clip.', reply_markup: finishKb(job.id) });
  }
  if (media.file_size && media.file_size > 20 * 1024 * 1024) {
    return call('sendMessage', { chat_id: chat, text: `This clip is ${Math.round(media.file_size / 1048576)} MB. Telegram only lets bots download up to 20 MB. Upload this one in KMR Studio (Library, open the video) or download it from Flow at 720p.` });
  }
  const tmp = path.join(require('./util').ensureDir(path.join(require('./util').DATA, 'tmp')), `tg_${Date.now()}.mp4`);
  const ext = await downloadFile(media.file_id, tmp);
  const r = await pipeline().attachClip(job.id, shot, tmp, ext);
  const { done, total } = pipeline().flowCount(r.job);
  const left = total - done;
  await call('sendMessage', {
    chat_id: chat, parse_mode: 'HTML', reply_to_message_id: msg.message_id,
    text: `✅ Shot ${shot + 1} of ${total} saved for <b>${esc(job.title || job.topic)}</b>.${left ? ` ${left} to go.` : ' All clips are in!'}${r.warning ? '\n\n⚠️ ' + esc(r.warning) : ''}`,
    ...(left ? {} : { reply_markup: finishKb(job.id) })
  });
}
const finishKb = id => ({ inline_keyboard: [[{ text: '🎞️ Finish video', callback_data: 'ff:' + id }]] });

async function post(method, fd) {
  const r = await fetch(`${api(db.settings().telegram_token)}/${method}`, { method: 'POST', body: fd, signal: AbortSignal.timeout(300000) });
  const j = await r.json().catch(() => { throw new Error('Telegram could not be reached. Check the internet connection of the computer running KMR Studio.'); });
  if (!j.ok) throw new Error(j.description);
  return j.result;
}

async function handle(u) {
  const s = db.settings();
  if (u.message) {
    const chat = String(u.message.chat.id);
    const text = (u.message.text || '').trim();
    if (!s.telegram_chat_id) {
      db.updateSettings({ telegram_chat_id: chat });
      await call('sendMessage', { chat_id: chat, text: '✅ KMR Studio is connected. Finished videos will arrive here for approval.\n\nSend me any topic and I will make a video about it.' });
      return;
    }
    if (chat !== String(s.telegram_chat_id)) return; // ignore strangers
    const m = u.message;
    if (m.video || m.animation || (m.document && /^video\//.test(m.document.mime_type || ''))) {
      try { await receiveClip(m); }
      catch (e) { await call('sendMessage', { chat_id: chat, text: '⚠️ ' + e.message, reply_to_message_id: m.message_id }).catch(() => {}); }
      return;
    }
    if (text === '/finish') {
      const w = db.jobs().filter(j => j.status === 'flow').sort((a, b) => a.created - b.created)[0];
      if (!w) return call('sendMessage', { chat_id: chat, text: 'No video is waiting for Flow clips.' });
      const { done, total } = pipeline().flowCount(w);
      if (!done) return call('sendMessage', { chat_id: chat, text: 'Send at least one clip first.' });
      pipeline().flowFinish(w.id);
      return call('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: `🎞️ Finishing <b>${esc(w.title || w.topic)}</b> with ${done} of ${total} clips. I will send it for approval.` });
    }
    if (!text || text === '/start') {
      await call('sendMessage', { chat_id: chat, text: 'Send me a topic and I will make a video.\n/status shows what I am working on.\n/finish finishes a Flow video with the clips sent so far.\n\nFor Flow videos, reply to a shot message with its clip.' });
      return;
    }
    if (text === '/status') {
      const act = db.jobs().filter(j => ['queued', 'working', 'review', 'approved', 'uploading'].includes(j.status)).slice(0, 10);
      await call('sendMessage', { chat_id: chat, parse_mode: 'HTML', text: act.length ? act.map(j => `• ${esc(j.title || j.topic || 'auto topic')} (${j.status})`).join('\n') : 'Nothing in progress.' });
      return;
    }
    const topic = text.replace(/^\/new\s*/i, '');
    const j = pipeline().createJob({ topic, source: 'telegram' });
    await call('sendMessage', { chat_id: chat, text: `🎬 On it: "${topic}". I will send the video here when it is ready.` });
    return j;
  }
  if (u.callback_query) {
    const q = u.callback_query;
    if (String(q.message?.chat?.id) !== String(s.telegram_chat_id)) return;
    const [act, id] = String(q.data || '').split(':');
    const job = db.job(id);
    let msg = 'Video not found';
    if (job) {
      if (act === 'ap') { await pipeline().approve(id, 'Telegram'); msg = 'Approved. Posting now.'; }
      if (act === 'rj') { pipeline().reject(id, 'Telegram'); msg = 'Rejected.'; }
      if (act === 'rm') { pipeline().remake(id); msg = 'Remaking. I will send the new version.'; }
      if (act === 'ff') {
        if (job.status !== 'flow') msg = 'This video is already being finished.';
        else { try { pipeline().flowFinish(id); msg = 'Finishing the video. I will send it for approval.'; } catch (e) { msg = e.message; } }
      }
    }
    await call('answerCallbackQuery', { callback_query_id: q.id, text: msg }).catch(() => {});
    await call('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text: msg, callback_data: 'noop' }]] } }).catch(() => {});
  }
}

let offset = null, running = false;
async function loop() {
  if (running) return; running = true;
  while (true) {
    const t = db.settings().telegram_token;
    if (!t) { await sleep(5000); continue; }
    if (offset === null) offset = Number(db.settings().telegram_offset) || 0;
    try {
      const r = await fetch(`${api(t)}/getUpdates?timeout=50&offset=${offset}`, { signal: AbortSignal.timeout(65000) });
      const j = await r.json();
      if (!j.ok) {
        if (j.error_code === 409) await fetch(`${api(t)}/deleteWebhook`).catch(() => {});
        await sleep(8000); continue;
      }
      for (const u of j.result) {
        offset = u.update_id + 1;
        db.updateSettings({ telegram_offset: offset }); // remembered, so a restart never repeats an order
        await handle(u).catch(e => console.error('telegram handle', e.message));
      }
    } catch { await sleep(5000); }
  }
}

async function test(token) {
  const me = await call('getMe', {}, token);
  return me.username;
}

function resetOffset() { offset = 0; }

module.exports = { loop, notify, sendReview, sendFlow, test, esc, resetOffset, handle };
