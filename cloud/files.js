// Video files in a private Vercel Blob store (free on Hobby: 1 GB, no card).
// Phones upload straight to the store (the video never passes through a function);
// Instagram and Facebook fetch videos through short-lived signed links.
// For local tests KMR_FAKE_DIR keeps files in a folder and KMR_FAKE_BASE serves them.
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const fake = () => !!process.env.KMR_FAKE_DIR;
const fakePath = p => path.join(process.env.KMR_FAKE_DIR, 'blob', p.replace(/\.\.+/g, '_'));
const MAX = 600 * 1024 * 1024;
let blobMod;
const blob = () => blobMod || (blobMod = require('@vercel/blob'));

function ready() { return fake() || !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID); }
function need() { if (!ready()) throw new Error('Video storage is not connected. In Vercel, open the project, Storage, Create, Blob, choose Private, and connect it to this project.'); }

const safeName = n => String(n || 'video.mp4').normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/_+/g, '_').slice(-80) || 'video.mp4';
const okPath = p => typeof p === 'string' && /^(up|out)\/[\w.\-/]+$/.test(p) && !p.includes('..');

// Called by the browser (through @vercel/blob/client uploadPresigned) to get a signed upload address.
async function handleUpload(body, req) {
  need();
  const { handleUploadPresigned } = require('@vercel/blob/client');
  const { issueSignedToken } = blob();
  return handleUploadPresigned({
    body, request: req,
    getSignedToken: async pathname => {
      if (!/^up\/[\w.\-]+$/.test(pathname)) throw new Error('Not allowed');
      const token = await issueSignedToken({ pathname, operations: ['put'], maximumSizeInBytes: MAX, validUntil: Date.now() + 60 * 60 * 1000 });
      return { token, urlOptions: { maximumSizeInBytes: MAX, addRandomSuffix: true, allowOverwrite: false, cacheControlMaxAge: 60 * 60 * 24 * 30, validUntil: Date.now() + 60 * 60 * 1000 } };
    }
  });
}

// A link anyone can open for a while (Instagram and Facebook download the video from it, and the page previews it).
async function signedUrl(p, minutes = 120) {
  need();
  if (!okPath(p)) throw new Error('Bad file name');
  if (fake()) return `${process.env.KMR_FAKE_BASE}/__blob/${p}?sig=1`;
  const { issueSignedToken, presignUrl } = blob();
  const until = Date.now() + minutes * 60000;
  const token = await issueSignedToken({ pathname: p, operations: ['get'], validUntil: until });
  return (await presignUrl(token, { operation: 'get', pathname: p, access: 'private', validUntil: until })).presignedUrl;
}

async function download(p, dest) {
  need();
  if (fake()) { fs.copyFileSync(fakePath(p), dest); return fs.statSync(dest).size; }
  const res = await blob().get(p, { access: 'private' });
  if (!res || res.statusCode !== 200 || !res.stream) throw new Error('A video file is missing from storage. Upload it again.');
  await pipeline(Readable.fromWeb(res.stream), fs.createWriteStream(dest));
  return fs.statSync(dest).size;
}

async function readBuffer(p) {
  const tmp = path.join(require('os').tmpdir(), 'kmr-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.bin');
  try { await download(p, tmp); return fs.readFileSync(tmp); } finally { fs.rmSync(tmp, { force: true }); }
}

async function putFile(p, file, contentType = 'video/mp4') {
  need();
  if (fake()) { fs.mkdirSync(path.dirname(fakePath(p)), { recursive: true }); fs.copyFileSync(file, fakePath(p)); return { pathname: p, size: fs.statSync(file).size }; }
  const size = fs.statSync(file).size;
  const r = await blob().put(p, fs.createReadStream(file), { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: true, multipart: size > 100 * 1024 * 1024 });
  return { pathname: r.pathname, size };
}

async function putBuffer(p, buf, contentType = 'image/jpeg') {
  const tmp = path.join(require('os').tmpdir(), 'kmr-put-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  fs.writeFileSync(tmp, buf);
  try { return await putFile(p, tmp, contentType); } finally { fs.rmSync(tmp, { force: true }); }
}

async function remove(list) {
  const ps = (Array.isArray(list) ? list : [list]).filter(okPath);
  if (!ps.length || !ready()) return;
  if (fake()) { for (const p of ps) fs.rmSync(fakePath(p), { force: true }); return; }
  try { await blob().del(ps.map(p => p)); } catch {}
}

async function size(p) {
  if (fake()) { try { return fs.statSync(fakePath(p)).size; } catch { return 0; } }
  try { const h = await blob().head(p); return h.size || 0; } catch { return 0; }
}

module.exports = { ready, handleUpload, signedUrl, download, readBuffer, putFile, putBuffer, remove, size, okPath, safeName, fakePath, MAX };
