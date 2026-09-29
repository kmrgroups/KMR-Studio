// Where videos can go. A target is "profileId:platform", for example "me:youtube" or "kmr:linkedin".
const db = require('./db');

const P = {
  youtube:   { label: 'YouTube',   mod: () => require('./youtube'),  ok: p => require('./youtube').connected(p),  post: (p, j, f, t) => require('./youtube').upload(p, j, f, t) },
  instagram: { label: 'Instagram', mod: () => require('./meta'),     ok: p => require('./meta').igConnected(p),   post: (p, j, f) => require('./meta').postInstagram(p, j, f) },
  facebook:  { label: 'Facebook',  mod: () => require('./meta'),     ok: p => require('./meta').fbConnected(p),   post: (p, j, f) => require('./meta').postFacebook(p, j, f) },
  linkedin:  { label: 'LinkedIn',  mod: () => require('./linkedin'), ok: p => require('./linkedin').connected(p), post: (p, j, f) => require('./linkedin').post(p, j, f) },
  x:         { label: 'X',         mod: () => require('./x'),        ok: p => require('./x').connected(p),        post: (p, j, f) => require('./x').post(p, j, f) }
};
const NAMES = Object.keys(P);

const split = t => { const i = String(t).lastIndexOf(':'); return [String(t).slice(0, i), String(t).slice(i + 1)]; };
const firstProfile = () => (db.profiles()[0] || {}).id || 'me';

// Old jobs (before profiles) kept a platform list; they belong to the first profile.
function targetsOf(job) {
  if (Array.isArray(job.targets)) return job.targets;
  const s = db.settings();
  if (Array.isArray(job.post_to) && job.post_to.length) return job.post_to.map(p => firstProfile() + ':' + p);
  return defaults();
}
function defaults() {
  const s = db.settings();
  if (Array.isArray(s.default_targets)) return s.default_targets;
  return (s.post_to || ['youtube']).map(p => firstProfile() + ':' + p);
}
// Keeps only real profiles and platforms, removes duplicates.
function clean(list) {
  const ids = new Set(db.profiles().map(p => p.id));
  return [...new Set((Array.isArray(list) ? list : []).map(String))].filter(t => { const [pid, pl] = split(t); return ids.has(pid) && P[pl]; });
}
function isReady(t) { const [pid, pl] = split(t); const p = db.profile(pid); return !!(p && P[pl] && P[pl].ok(p)); }
function label(t) { const [pid, pl] = split(t); const p = db.profile(pid); return `${p ? p.name : pid} · ${P[pl] ? P[pl].label : pl}`; }
// published keys before profiles were plain platform names
function publishedOf(job) {
  const out = {};
  const pub = { ...(job.published || {}) };
  if (job.youtube && !pub.youtube && !Object.keys(pub).some(k => k.endsWith(':youtube'))) pub.youtube = job.youtube;
  for (const [k, v] of Object.entries(pub)) out[k.includes(':') ? k : firstProfile() + ':' + k] = v;
  return out;
}

module.exports = { P, NAMES, split, targetsOf, defaults, clean, isReady, label, publishedOf, firstProfile };
