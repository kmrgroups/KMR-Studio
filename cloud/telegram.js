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

// Makes sure Telegram sends button presses to this studio (a bot brought over from the laptop was never told).
async function ensureHook(base, force) {
  const s = await st.settings();
  if (!s.telegram_token || !base) return null;
  const want = base + '/api/telegram', key = want + '|' + s.telegram_token.slice(-8);
  if (!force && (await kv.getJ('tg_hook')) === key) return null;
  const info = await call('getWebhookInfo', {}, s.telegram_token).catch(() => null);
  if (!info || info.url !== want || force === true) {
    await call('setWebhook', { url: want, secret_token: hookSecret(s.telegram_token), allowed_updates: ['message', 'callback_query'], drop_pending_updates: false }, s.telegram_token);
    if (info && !info.url && s.telegram_chat_id) { // someone switched the bot off this studio: almost always the old laptop version
      const last = Number(await kv.getJ('tg_stolen')) || 0;
      await kv.setJ('tg_stolen', Date.now(), 7 * 86400);
      if (Date.now() - last > 6 * 3600000) await send('⚠️ The KMR Studio program on your laptop is still running and is taking the Approve and Reject buttons (it answers "Video not found"). Close it on the laptop, and remove it from Windows start-up. KMR Studio now runs fully online.').catch(() => {});
    }
  }
  await kv.setJ('tg_hook', key, 600); // checked again every 10 minutes
  return info;
}
// For the Setup page: is Telegram fully working?
async function health(base) {
  const s = await st.settings();
  if (!s.telegram_token) return { state: 'none' };
  if (!s.telegram_chat_id) return { state: 'start', bot: s.telegram_bot };
  const want = base + '/api/telegram';
  const info = await call('getWebhookInfo', {}, s.telegram_token).catch(e => ({ error: e.message }));
  if (info.error) return { state: 'error', error: info.error };
  const stolen = Number(await kv.getJ('tg_stolen')) || 0;
  if (info.url !== want) { await ensureHook(base, 'check').catch(() => {}); return { state: 'laptop', bot: s.telegram_bot }; }
  return { state: stolen && Date.now() - stolen < 86400000 ? 'laptop-recent' : 'ok', bot: s.telegram_bot, last_error: info.last_error_date && Date.now() / 1000 - info.last_error_date < 3600 ? info.last_error_message : '' };
}

// Sends the finished video (or its thumbnail and a watch link) with Approve and Reject buttons.
async function review(job, base) {
  const s = await st.settings();
  if (!s.telegram_token || !s.telegram_chat_id) return false;
  await ensureHook(base).catch(() => {});
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
      else if (act === 'ping') text = '✅ Buttons work.';
      else text = 'Done.';
    } catch (e) { text = e.message; }
    await call('answerCallbackQuery', { callback_query_id: q.id, text: text.slice(0, 190) }).catch(() => {});
    await call('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [[{ text, callback_data: 'noop' }]] } }).catch(() => {});
  }
}

async function test(base) {
  if (!await ready()) throw new Error('Press Connect and then Start in Telegram first.');
  const info = await ensureHook(base, true);
  await send('👋 Test from KMR Studio: Telegram works, and the Approve and Reject buttons are connected.', { reply_markup: { inline_keyboard: [[{ text: '👍 Press me to test the buttons', callback_data: 'ping' }]] } });
  return 'Sent. In Telegram, press the test button: it should answer "Buttons work".' + (info && info.last_error_message ? ' (Telegram had reported: ' + info.last_error_message + ' — now repaired.)' : '');
}
async function disconnect() {
  const s = await st.settings();
  if (s.telegram_token) await call('deleteWebhook', {}, s.telegram_token).catch(() => {});
  await st.saveSettings({ telegram_chat_id: '', telegram_bot: '' });
}

module.exports = { health, ensureHook, connect, review, finished, handleUpdate, test, disconnect, ready, send, hookSecret };
