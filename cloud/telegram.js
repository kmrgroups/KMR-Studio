// Telegram: approve videos from your phone and get told when they are posted.
// Works in the cloud with a webhook: Telegram calls <studio>/api/telegram when you press a button.
const crypto = require('crypto');
const st = require('./state');
const kv = require('./kv');
const files = require('./files');

const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const PL = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', x: 'X' };

async function call(method, params, token) {
  const t = token || (await st.settings()).telegram_token;
  if (!t) throw new Error('Telegram is not set up. Settings, Telegram.');
  const isForm = params instanceof FormData;
  const r = await fetch(`https://api.telegram.org/bot${t}/${method}`, { method: 'POST', headers: isForm ? {} : { 'Content-Type': 'application/json' }, body: isForm ? params : JSON.stringify(params || {}), signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) {
    const d = j.description || String(r.status);
    throw new Error(/Unauthorized/i.test(d) ? 'The Telegram bot token is not valid. Copy it again from @BotFather.' : /chat not found|blocked/i.test(d) ? 'Telegram cannot reach your chat. Open your bot in Telegram and press Start, then press Connect again.' : 'Telegram: ' + d);
  }
  return j.result;
}
const hookSecret = token => crypto.createHash('sha256').update('kmr-tg|' + token).digest('hex').slice(0, 48);
async function ready() { const s = await st.settings(); return !!(s.telegram_token && s.telegram_chat_id); }

// Settings, Telegram, Connect: points the bot at this studio and gives a start link that links your chat.
async function connect(base, token) {
  const s = await st.settings();
  token = String(token || s.telegram_token || '').trim();
  if (!token) throw new Error('Paste the bot token from @BotFather first.');
  const me = await call('getMe', {}, token);
  await call('setWebhook', { url: base + '/api/telegram', secret_token: hookSecret(token), allowed_updates: ['message', 'callback_query'], drop_pending_updates: true }, token);
  const code = crypto.randomBytes(6).toString('hex');
  await kv.setJ('tg_link', code, 3600);
  await st.saveSettings({ telegram_token: token, telegram_bot: me.username });
  return { bot: me.username, link: `https://t.me/${me.username}?start=${code}`, linked: !!s.telegram_chat_id && s.telegram_token === token };
}
async function send(text, extra = {}) {
  const s = await st.settings();
  if (!s.telegram_token || !s.telegram_chat_id) return null;
  return call('sendMessage', { chat_id: s.telegram_chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...extra });
}

const targetsText = async job => {
  const profs = await st.profiles();
  return job.targets.map(t => { const [pid, pl] = t.split(':'); return `${PL[pl]} (${profs.find(p => p.id === pid)?.name || pid})`; }).join(', ');
};
const keyboard = id => ({ inline_keyboard: [[{ text: '✅ Approve and post', callback_data: 'ap:' + id }, { text: '❌ Reject', callback_data: 'rj:' + id }]] });

// Sends the finished video (or its thumbnail and a watch link) with Approve and Reject buttons.
async function review(job, base) {
  const s = await st.settings();
  if (!s.telegram_token || !s.telegram_chat_id) return false;
  const v = job.video;
  const caption = `🎬 <b>${esc(job.title)}</b>\n\n${esc(String(job.description || '').slice(0, 500))}\n${esc((job.hashtags || []).slice(0, 12).join(' '))}\n\n⏱ ${Math.round(v.duration)}s · ${v.w}x${v.h}\n📤 ${esc(await targetsText(job))}`.slice(0, 1024);
  const watch = await files.signedUrl(v.pathname, 24 * 60);
  const markup = { inline_keyboard: [...keyboard(job.id).inline_keyboard, [{ text: '▶ Watch the full video', url: watch }]] };
  try {
    if (v.size && v.size < 19 * 1024 * 1024) {
      await call('sendVideo', { chat_id: s.telegram_chat_id, video: watch, caption, parse_mode: 'HTML', supports_streaming: true, reply_markup: markup });
      return true;
    }
  } catch { /* too big or slow for Telegram to fetch: send the thumbnail instead */ }
  if (job.thumb) {
    try { await call('sendPhoto', { chat_id: s.telegram_chat_id, photo: await files.signedUrl(job.thumb, 60), caption, parse_mode: 'HTML', reply_markup: markup }); return true; } catch {}
  }
  await send(caption, { reply_markup: markup });
  return true;
}

async function finished(job, results) {
  const lines = await Promise.all(job.targets.map(async t => {
    const [pid, pl] = t.split(':'); const r = results[t] || {};
    const who = `${PL[pl]} · ${esc((await st.profile(pid))?.name || pid)}`;
    return r.status === 'done' ? `✅ ${who}: ${r.url ? `<a href="${esc(r.url)}">open</a>` : 'posted'}` : `❌ ${who}: ${esc(String(r.error || 'failed').slice(0, 200))}`;
  }));
  const ok = job.targets.every(t => results[t]?.status === 'done');
  await send(`${ok ? '🎉 Posted' : '⚠️ Posted with problems'}: <b>${esc(job.title)}</b>\n\n${lines.join('\n')}${ok ? '' : '\n\nOpen History in KMR Studio and press Retry.'}`).catch(() => {});
}

// Telegram calls this (webhook). Only your own chat can approve.
async function handleUpdate(req, update, base) {
  const s = await st.settings();
  if (!s.telegram_token || req.headers['x-telegram-bot-api-secret-token'] !== hookSecret(s.telegram_token)) return;
  const msg = update.message, q = update.callback_query;
  if (msg && msg.text) {
    const m = /^\/start(?:\s+(\w+))?/.exec(msg.text);
    if (m && m[1] && m[1] === await kv.getJ('tg_link')) {
      await st.saveSettings({ telegram_chat_id: String(msg.chat.id) });
      await kv.del('tg_link');
      await call('sendMessage', { chat_id: msg.chat.id, text: '✅ KMR Studio is connected. New videos will come here for your approval, and you will be told when they are posted.' });
    } else if (String(msg.chat.id) === String(s.telegram_chat_id)) {
      await call('sendMessage', { chat_id: msg.chat.id, text: 'Upload videos at ' + base + ' — they come here for approval before posting.' }).catch(() => {});
    }
    return;
  }
  if (q) {
    if (String(q.message?.chat?.id) !== String(s.telegram_chat_id)) return call('answerCallbackQuery', { callback_query_id: q.id, text: 'Not allowed.' }).catch(() => {});
    const [act, id] = String(q.data || '').split(':');
    const jobs = require('./jobs');
    let text = '';
    try {
      if (act === 'ap') { await jobs.approve(id, base); text = '✅ Approved. Posting now; you will get the links here.'; }
      else if (act === 'rj') { await jobs.reject(id); text = '❌ Rejected. Nothing was posted.'; }
      else text = 'Done.';
    } catch (e) { text = e.message; }
    await call('answerCallbackQuery', { callback_query_id: q.id, text: text.slice(0, 190) }).catch(() => {});
    await call('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text, callback_data: 'noop' }]] } }).catch(() => {});
  }
}

async function test() {
  if (!await ready()) throw new Error('Press Connect and then Start in Telegram first.');
  await send('👋 Test from KMR Studio: Telegram works.');
  return 'Sent. Check Telegram.';
}
async function disconnect() {
  const s = await st.settings();
  if (s.telegram_token) await call('deleteWebhook', {}, s.telegram_token).catch(() => {});
  await st.saveSettings({ telegram_chat_id: '', telegram_bot: '' });
}

module.exports = { connect, review, finished, handleUpdate, test, disconnect, ready, send, hookSecret };
