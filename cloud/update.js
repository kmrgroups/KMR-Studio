// Update KMR Studio from inside the studio: upload a zip of the new files (Settings, Update), and the files
// are committed to your GitHub repository. Vercel sees the commit and deploys it by itself in a minute or two.
// (Vercel's own disk is read-only, so the studio cannot change its files directly; GitHub is the way in.)
const zlib = require('zlib');
const crypto = require('crypto');
const vm = require('vm');
const st = require('./state');
const files = require('./files');

const MAX_ZIP = 15 * 1024 * 1024, MAX_FILES = 400;
const TOP_DIRS = ['api', 'cloud', 'web', 'dev'];
const TOP_FILES = ['package.json', 'package-lock.json', 'vercel.json', 'VERSION', 'HANDOVER.md', 'README.md'];

// ---- a small zip reader (stored and deflated files), so no extra package is needed ----
function readZip(buf) {
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('This is not a zip file.');
  const count = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('The zip file is damaged.');
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nlen).replace(/\\/g, '/');
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    if (csize === 0xffffffff || usize === 0xffffffff) throw new Error('This zip is too large or uses an unsupported format.');
    if (usize > 5 * 1024 * 1024) throw new Error(`${name} is larger than 5 MB.`);
    const dataAt = off + 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28);
    const raw = buf.subarray(dataAt, dataAt + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw, { maxOutputLength: 5 * 1024 * 1024 });
    else throw new Error(`${name}: unsupported zip compression.`);
    out.push({ name, data });
  }
  return out;
}

// Only the app's own files may be updated, never keys, data or hidden files.
function cleanPath(name) {
  const parts = String(name).replace(/\\/g, '/').split('/').filter(x => x && x !== '.');
  if (!parts.length || parts.some(x => x === '..' || x.startsWith('.') || x.includes('\0'))) return null;
  return parts;
}
function allowed(parts) {
  if (parts.length === 1) return TOP_FILES.includes(parts[0]);
  return TOP_DIRS.includes(parts[0]) && !parts.includes('node_modules') && !parts.includes('.devdata');
}
function select(entries) {
  let list = entries.map(e => ({ ...e, parts: cleanPath(e.name) })).filter(e => e.parts);
  // a zip made from GitHub ("Download ZIP") has one folder around everything: take it off
  const first = new Set(list.map(e => e.parts[0]));
  if (first.size === 1 && list.every(e => e.parts.length > 1) && !TOP_DIRS.includes([...first][0])) list = list.map(e => ({ ...e, parts: e.parts.slice(1) }));
  const keep = list.filter(e => allowed(e.parts)).map(e => ({ path: e.parts.join('/'), data: e.data }));
  return { keep, skipped: entries.length - keep.length };
}
// A broken file must never reach the live studio: every JavaScript file has to compile first.
function checkSyntax(keep) {
  for (const f of keep) {
    if (!/\.js$/.test(f.path) || f.path.startsWith('web/vendor/')) continue;
    try { new vm.Script('(function (exports, require, module, __filename, __dirname) {' + f.data.toString('utf8') + '\n})', { filename: f.path }); }
    catch (e) { throw new Error(`The update was not sent: ${f.path} has an error (${e.message}). Nothing was changed.`); }
  }
}

// ---- GitHub ----
async function gh(repo, token, method, url, body) {
  const r = await fetch('https://api.github.com/repos/' + repo + url, {
    method, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'kmr-studio', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(25000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = String(j.message || r.status);
    throw new Error(r.status === 401 ? 'GitHub did not accept the token. Make a new one and save it in Settings, Update.' : r.status === 404 ? 'GitHub cannot find that repository or branch with this token. Check the repository name, and that the token has access to it.' : r.status === 403 || /resource not accessible/i.test(m) ? 'The GitHub token is not allowed to change this repository. Give it Contents: Read and write.' : 'GitHub: ' + m.slice(0, 200));
  }
  return j;
}
async function config() {
  const s = await st.settings();
  const repo = String(s.github_repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '');
  if (!s.github_key) throw new Error('Save the GitHub token first (Settings, Update).');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Type the repository like this: kmrgroups/KMR-Studio');
  return { token: s.github_key, repo, branch: String(s.github_branch || 'main').trim() || 'main' };
}

async function check() {
  const c = await config();
  const r = await gh(c.repo, c.token, 'GET', '');
  await gh(c.repo, c.token, 'GET', '/git/ref/heads/' + encodeURIComponent(c.branch));
  if (r.permissions && r.permissions.push === false) throw new Error('The token can read this repository but not change it. Give it Contents: Read and write.');
  return `Connected to ${r.full_name}, branch ${c.branch}. You can upload an update zip now.`;
}

const blobSha = buf => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');

async function apply(pathname) {
  const c = await config();
  if (!files.okPath(pathname) || !/^up\/[\w.\-]+\.zip$/i.test(pathname)) throw new Error('Choose a .zip file.');
  let zip;
  try { zip = await files.readBuffer(pathname); } finally { await files.remove([pathname]).catch(() => {}); }
  if (zip.length > MAX_ZIP) throw new Error('This zip is larger than 15 MB. Send only the changed files.');
  const { keep, skipped } = select(readZip(zip));
  if (!keep.length) throw new Error('No KMR Studio files were found in this zip (api, cloud, web, package.json…).');
  if (keep.length > MAX_FILES) throw new Error('This zip has too many files.');
  checkSyntax(keep);

  const ref = await gh(c.repo, c.token, 'GET', '/git/ref/heads/' + encodeURIComponent(c.branch));
  const head = ref.object.sha;
  const commit = await gh(c.repo, c.token, 'GET', '/git/commits/' + head);
  const tree = await gh(c.repo, c.token, 'GET', '/git/trees/' + commit.tree.sha + '?recursive=1');
  if (tree.truncated) throw new Error('The repository is too large to compare here.');
  const have = new Map(tree.tree.filter(t => t.type === 'blob').map(t => [t.path, t.sha]));
  const changed = keep.filter(f => have.get(f.path) !== blobSha(f.data));
  const version = (keep.find(f => f.path === 'VERSION') || {}).data;
  if (!changed.length) return { changed: 0, files: [], skipped, version: version && version.toString().trim() };

  const entries = [];
  for (let i = 0; i < changed.length; i += 4) {
    entries.push(...await Promise.all(changed.slice(i, i + 4).map(async f => {
      const b = await gh(c.repo, c.token, 'POST', '/git/blobs', { content: f.data.toString('base64'), encoding: 'base64' });
      return { path: f.path, mode: '100644', type: 'blob', sha: b.sha };
    })));
  }
  const nt = await gh(c.repo, c.token, 'POST', '/git/trees', { base_tree: commit.tree.sha, tree: entries });
  const v = version ? version.toString().trim() : '';
  const nc = await gh(c.repo, c.token, 'POST', '/git/commits', { message: `KMR Studio update${v ? ' ' + v : ''} (from the studio: ${changed.length} file${changed.length > 1 ? 's' : ''})`, tree: nt.sha, parents: [head] });
  await gh(c.repo, c.token, 'PATCH', '/git/refs/heads/' + encodeURIComponent(c.branch), { sha: nc.sha });
  return { changed: changed.length, files: changed.map(f => f.path), skipped, version: v, commit: nc.sha.slice(0, 7) };
}

module.exports = { readZip, select, checkSyntax, check, apply, blobSha };
