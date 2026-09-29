// Small key-value store: Upstash Redis over its REST API (free, no card; added in Vercel, Storage, Upstash for Redis).
// For local tests KMR_FAKE_DIR keeps the same data in a JSON file instead.
const fs = require('fs');
const path = require('path');

const URL_ = () => (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const P = 'kmr:';

function ready() { return !!(process.env.KMR_FAKE_DIR || (URL_() && TOKEN())); }

// ---- fake (tests and local preview) ----
function fakeFile() { return path.join(process.env.KMR_FAKE_DIR, 'kv.json'); }
function fakeLoad() { try { return JSON.parse(fs.readFileSync(fakeFile(), 'utf8')); } catch { return {}; } }
function fakeSave(d) { fs.mkdirSync(process.env.KMR_FAKE_DIR, { recursive: true }); fs.writeFileSync(fakeFile(), JSON.stringify(d)); }
function fakeCmd(d, [c, k, ...a]) {
  const now = Date.now();
  const live = key => { const v = d[key]; if (v && v.exp && v.exp < now) { delete d[key]; return undefined; } return v; };
  switch (c.toUpperCase()) {
    case 'GET': { const v = live(k); return v ? v.s : null; }
    case 'SET': {
      const o = { s: String(a[0]) };
      const ex = a.findIndex(x => String(x).toUpperCase() === 'EX');
      if (ex >= 0) o.exp = now + Number(a[ex + 1]) * 1000;
      if (a.some(x => String(x).toUpperCase() === 'NX') && live(k)) return null;
      d[k] = o; return 'OK';
    }
    case 'DEL': { let n = 0; for (const key of [k, ...a]) if (live(key)) { delete d[key]; n++; } return n; }
    case 'INCR': { const v = Number(live(k)?.s || 0) + 1; d[k] = { ...(d[k] || {}), s: String(v) }; return v; }
    case 'EXPIRE': { if (live(k)) d[k].exp = now + Number(a[0]) * 1000; return 1; }
    case 'HSET': { const h = live(k)?.h || {}; for (let i = 0; i < a.length; i += 2) h[a[i]] = String(a[i + 1]); d[k] = { h }; return 1; }
    case 'HGET': return live(k)?.h?.[a[0]] ?? null;
    case 'HDEL': { const h = live(k)?.h; if (h) for (const f of a) delete h[f]; return 1; }
    case 'HGETALL': { const h = live(k)?.h || {}; return Object.entries(h).flat(); }
    case 'LPUSH': { const l = live(k)?.l || []; l.unshift(...a.map(String).reverse()); d[k] = { l }; return l.length; }
    case 'LREM': { const l = live(k)?.l || []; const n = l.length; d[k] = { l: l.filter(x => x !== String(a[1])) }; return n - d[k].l.length; }
    case 'LRANGE': { const l = live(k)?.l || []; const e = Number(a[1]); return l.slice(Number(a[0]), e < 0 ? l.length + e + 1 : e + 1); }
    case 'LTRIM': { const l = live(k)?.l || []; const e = Number(a[1]); d[k] = { l: l.slice(Number(a[0]), e < 0 ? l.length + e + 1 : e + 1) }; return 'OK'; }
    default: throw new Error('fake kv: ' + c);
  }
}

async function pipeline(cmds) {
  if (process.env.KMR_FAKE_DIR) { const d = fakeLoad(); const out = cmds.map(c => fakeCmd(d, c)); fakeSave(d); return out; }
  if (!ready()) throw new Error('The database is not connected. In Vercel, open the project, Storage, and add "Upstash for Redis" (free).');
  const r = await fetch(URL_() + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json' }, body: JSON.stringify(cmds), signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !Array.isArray(j)) throw new Error('Database error ' + r.status + (j && j.error ? ': ' + j.error : ''));
  return j.map(x => { if (x.error) throw new Error('Database: ' + x.error); return x.result; });
}
const cmd = async (...c) => (await pipeline([c]))[0];

const J = s => { if (s == null) return null; try { return JSON.parse(s); } catch { return null; } };

module.exports = {
  ready, pipeline, cmd, P,
  async getJ(k) { return J(await cmd('GET', P + k)); },
  async setJ(k, v, ttl) { return ttl ? cmd('SET', P + k, JSON.stringify(v), 'EX', ttl) : cmd('SET', P + k, JSON.stringify(v)); },
  async del(k) { return cmd('DEL', P + k); },
  async hsetJ(k, f, v) { return cmd('HSET', P + k, f, JSON.stringify(v)); },
  async hgetJ(k, f) { return J(await cmd('HGET', P + k, f)); },
  async hdel(k, f) { return cmd('HDEL', P + k, f); },
  async hallJ(k) { const a = await cmd('HGETALL', P + k) || []; const o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = J(a[i + 1]); return o; },
  async incr(k, ttl) { const [n] = await pipeline([['INCR', P + k], ['EXPIRE', P + k, ttl]]); return n; },
  async lpush(k, v) { return pipeline([['LREM', P + k, 0, v], ['LPUSH', P + k, v], ['LTRIM', P + k, 0, 299]]); },
  async lrem(k, v) { return cmd('LREM', P + k, 0, v); },
  async lrange(k, a, b) { return cmd('LRANGE', P + k, a, b); }
};
