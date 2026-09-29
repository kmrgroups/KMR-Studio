// Autopilot: makes videos on chosen days and times (in your timezone).
const db = require('./db');

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function now(tz) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { hm: `${p.hour}:${p.minute}`, day: p.weekday, date: `${p.year}-${p.month}-${p.day}` };
}

function normTime(t) {
  const m = String(t).trim().match(/^(\d{1,2})[:.](\d{2})$/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// A run that was missed (computer asleep, restarting or updating at that minute) still happens
// when KMR Studio is back, as long as it is less than CATCH_UP minutes late. Each slot runs once.
const CATCH_UP = 120;
const mins = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };

function tick() {
  const n = now(db.settings().timezone);
  const nowKey = n.date + ' ' + n.hm, nowMin = mins(n.hm);
  for (const s of db.schedules()) {
    if (!s.enabled) continue;
    if (!s.armed_key) { s.armed_key = nowKey; db.saveSchedule(s); } // never fire slots from before the autopilot was saved
    if (!(s.days || DAYS).includes(n.day)) continue;
    const done = Array.isArray(s.done_keys) ? s.done_keys : (s.last_key ? [s.last_key] : []);
    const due = (s.times || []).map(normTime).filter(Boolean)
      .filter(t => mins(t) <= nowMin && nowMin - mins(t) <= CATCH_UP)
      .map(t => n.date + ' ' + t)
      .filter(k => k > s.armed_key && !done.includes(k));
    if (!due.length) continue;
    const key = [...due].sort().at(-1); // if several were missed, make one video, not a burst
    const late = nowMin - mins(key.slice(-5));
    s.done_keys = [...done, ...due].slice(-40);
    s.last_key = key;
    const topics = (s.topics || []).filter(Boolean);
    const topic = topics.shift() || '';
    s.topics = topics;
    s.last_run = Date.now();
    db.saveSchedule(s);
    const job = require('./pipeline').createJob({
      topic, niche: s.niche, language: s.language, voice: s.voice, style: s.style,
      ratio: s.ratio, duration: s.duration, auto_approve: !!s.auto_approve, use_trends: s.topic_source === 'trends', motion: s.motion, engine: s.engine, schedule_id: s.id, source: 'autopilot', targets: Array.isArray(s.targets) ? s.targets : undefined
    });
    if (late > 1) db.log(job.id, `Autopilot "${s.name}" was due at ${key.slice(-5)}; started ${late} min late because KMR Studio was off or asleep.`);
  }
}

function start() { setInterval(tick, 20000); tick(); }

module.exports = { start, DAYS, normTime, now, _tick: tick };
