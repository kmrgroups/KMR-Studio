// WhatsApp Status: WhatsApp has no official way for a program to post a Status, so this is the safe way.
// The finished video goes to your Telegram with a ready caption (title, hashtags and your link), and you
// share it to WhatsApp Status from your phone in two taps. (There is also a Share button in History.)
const st = require('./state');
const tg = require('./telegram');

const TG_MAX = 49 * 1024 * 1024;   // Telegram bots can send files up to 50 MB
const CAPTION_MAX = 700;           // WhatsApp Status captions are limited to 700 characters

// "kmr-groups.com/offer" becomes "https://kmr-groups.com/offer"; anything that is not a web address becomes ''.
function cleanLink(v) {
  let s = String(v || '').trim().slice(0, 300);
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : ''; } catch { return ''; }
}

// Title, caption and hashtags, trimmed to fit, with the link always kept at the end so it stays tappable.
function caption(job, link) {
  const tags = (job.hashtags || []).slice(0, 6).join(' ');
  const tail = [tags, link ? '🔗 ' + link : ''].filter(Boolean).join('\n');
  const head = [job.title, job.description].map(x => String(x || '').trim()).filter(Boolean).join('\n\n');
  const room = Math.max(0, CAPTION_MAX - tail.length - (tail ? 2 : 0));
  const body = head.length > room ? head.slice(0, Math.max(0, room - 1)).trimEnd() + '…' : head;
  return [body, tail].filter(Boolean).join('\n\n').slice(0, CAPTION_MAX + 300);
}

async function save(pid, b) {
  if (!await tg.ready()) throw new Error('WhatsApp Status videos are sent to your Telegram, so connect Telegram first (Settings, Telegram).');
  const link = cleanLink(b.link);
  if (String(b.link || '').trim() && !link) throw new Error('That does not look like a web address. Example: https://kmr-groups.com');
  await st.setAccount(pid, 'wa', { on: true, link, problem: '' }, true);
  return link ? 'WhatsApp Status is on. Your link will be added to every caption.' : 'WhatsApp Status is on. No link is set, so captions go without one.';
}
async function check(pid) {
  if (!await tg.ready()) { await st.setAccount(pid, 'wa', { problem: 'Telegram is not connected. Connect it in Settings, Telegram.' }); throw new Error('Telegram is not connected. Connect it in Settings, Telegram.'); }
  await st.setAccount(pid, 'wa', { problem: '' });
  return 'WhatsApp Status is ready: videos will arrive in your Telegram.';
}
async function disconnect(pid) { await st.setAccount(pid, 'wa', {}, true); }

// One step: send the video and the caption to Telegram.
async function post(ctx) {
  const { profile, job, video, readVideo } = ctx;
  if (!await tg.ready()) throw new Error('Telegram is not connected, and WhatsApp Status videos are sent there. Connect it in Settings, Telegram, then press Retry.');
  if ((video.size || 0) > TG_MAX) throw new Error('This video is over 50 MB, which Telegram cannot carry. Use the Share to WhatsApp Status button on this video in History.');
  const s = await st.settings();
  const link = cleanLink(job.link) || cleanLink(profile.wa && profile.wa.link);
  const cap = caption(job, link);
  const buf = await readVideo();
  if (buf.length > TG_MAX) throw new Error('This video is over 50 MB, which Telegram cannot carry. Use the Share to WhatsApp Status button on this video in History.');
  const fd = new FormData();
  fd.append('chat_id', String(s.telegram_chat_id));
  fd.append('caption', ('📲 For WhatsApp Status: ' + String(job.title || '')).slice(0, 200));
  fd.append('supports_streaming', 'true');
  fd.append('video', new Blob([buf], { type: 'video/mp4' }), 'whatsapp-status.mp4');
  await tg.call('sendVideo', fd);
  await tg.send(`📋 <b>Caption for your Status</b> (tap it to copy):\n\n<code>${tg.esc(cap)}</code>\n\nOpen the video above, tap <b>Share</b>, choose <b>WhatsApp</b>, then <b>My status</b>, and paste the caption.${link ? '' : '\n\n(No link was set. Add one in Profiles, or on the Post page.)'}`);
  return { done: { note: link ? 'Video and caption with your link are in Telegram. Share it to your Status.' : 'Video and caption are in Telegram. No link was set.' } };
}

module.exports = { cleanLink, caption, save, check, disconnect, post };
