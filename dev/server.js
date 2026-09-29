// Local preview of KMR Studio Cloud, working like Vercel does (for testing only; not deployed).
// Storage and database are simulated in a folder: KMR_FAKE_DIR (default ./.devdata).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 3500);
process.env.KMR_FAKE_DIR = process.env.KMR_FAKE_DIR || path.join(ROOT, '.devdata');
process.env.KMR_FAKE_BASE = process.env.KMR_FAKE_BASE || `http://localhost:${PORT}`;
process.env.KMR_PASSWORD = process.env.KMR_PASSWORD || 'test1234';

const main = require('../api/main');
const work = require('../api/work');
const files = require('../cloud/files');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname.startsWith('/__blob/')) { // simulated private storage
      const p = decodeURIComponent(u.pathname.slice(8));
      if (!files.okPath(p)) { res.statusCode = 400; return res.end('bad path'); }
      const f = files.fakePath(p);
      if (req.method === 'PUT') {
        fs.mkdirSync(path.dirname(f), { recursive: true });
        const out = fs.createWriteStream(f);
        req.pipe(out);
        out.on('finish', () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ pathname: p, url: process.env.KMR_FAKE_BASE + '/__blob/' + p })); });
        return;
      }
      if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('missing'); }
      const size = fs.statSync(f).size, range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
      res.setHeader('Content-Type', 'video/mp4'); res.setHeader('Accept-Ranges', 'bytes');
      if (range) {
        const a = +range[1], b = range[2] ? +range[2] : size - 1;
        res.statusCode = 206; res.setHeader('Content-Range', `bytes ${a}-${b}/${size}`); res.setHeader('Content-Length', b - a + 1);
        return fs.createReadStream(f, { start: a, end: b }).pipe(res);
      }
      res.setHeader('Content-Length', size);
      return fs.createReadStream(f).pipe(res);
    }
    if (u.pathname === '/api/work') return await work(req, res);
    if (u.pathname === '/oauth/callback') { req.url = '/api/main?__p=oauth/callback&' + u.searchParams; return await main(req, res); }
    if (u.pathname.startsWith('/api/')) { const q = new URLSearchParams(u.search); q.set('__p', u.pathname.slice(5)); req.url = '/api/main?' + q; return await main(req, res); }
    let f = path.join(ROOT, 'web', u.pathname === '/' ? 'index.html' : path.normalize(u.pathname));
    if (!f.startsWith(path.join(ROOT, 'web')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'web', 'index.html');
    res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); res.statusCode = 500; res.end(String(e.message)); }
}).listen(PORT, () => console.log(`KMR Studio Cloud preview on http://localhost:${PORT} (password ${process.env.KMR_PASSWORD})`));
