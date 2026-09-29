// KMR Studio web door (Vercel). The studio itself runs on the owner's PC; this tiny function only
// forwards visitors to it. Set KMR_STUDIO_URL in Vercel to the address KMR Studio shows in
// Settings, Online access, step 3 (like https://kmr-pc.tail1234.ts.net), then redeploy.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KMR Studio</title><meta name="robots" content="noindex">
<style>:root{color-scheme:light dark;--bg:#0b0d12;--card:#151923;--fg:#eef1f7;--mut:#9aa3b5;--acc:#7c9cff}
@media (prefers-color-scheme:light){:root{--bg:#f4f6fb;--card:#fff;--fg:#141824;--mut:#5b6478;--acc:#3d63e6}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;padding:16px;box-sizing:border-box}
.c{max-width:460px;background:var(--card);border-radius:18px;padding:28px 26px;box-shadow:0 10px 40px rgba(0,0,0,.18)}
h1{margin:0 0 6px;font-size:22px}p{margin:10px 0;color:var(--mut)}b{color:var(--fg)}ol{padding-left:20px;color:var(--mut)}a{color:var(--acc)}</style></head>
<body><div class="c"><h1>KMR Studio is not connected yet</h1>
<p>This is the web door to KMR Studio. It does not know where the studio is yet.</p>
<ol><li>On the studio PC, open KMR Studio, <b>Settings, Online access</b>, and finish steps 1 to 3.</li>
<li>Press <b>Copy address</b>.</li><li>In Vercel, project <b>KMR-Studio</b>, <b>Settings, Environment Variables</b>: add <b>KMR_STUDIO_URL</b> with that address, then <b>Redeploy</b>.</li></ol>
<p>If it worked before, the studio PC may be off or asleep.</p></div></body></html>`;

module.exports = (req, res) => {
  const origin = String(process.env.KMR_STUDIO_URL || '').trim().replace(/\/+$/, '');
  const u = new URL(req.url || '/', 'https://door.local');
  const path = (u.searchParams.get('__door') || '').replace(/^\/+/, '');
  u.searchParams.delete('__door');
  res.setHeader('Cache-Control', 'no-store');
  const ok = /^https:\/\/[^/?#\s]+$/i.test(origin);
  res.setHeader('X-KMR-Door', ok ? 'connected' : 'not-connected');
  if (ok) {
    const q = u.searchParams.toString();
    res.statusCode = 307;
    res.setHeader('Location', `${origin}/${path}${q ? '?' + q : ''}`);
    return res.end();
  }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(PAGE);
};
