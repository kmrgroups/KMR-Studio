// Free cloud GPU via Kaggle (about 30 GPU hours a week, no card).
// KMR Studio packs the scene pictures into a private GPU notebook that runs the open LTX-Video model,
// then downloads the finished clips.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { ROOT, DATA, PY_BIN, ensureDir, run, sleep, uid } = require('./util');

const exists = f => { try { return fs.existsSync(f); } catch { return false; } };
const PY = () => (process.env.LUMEN_PYTHON && exists(process.env.LUMEN_PYTHON) && process.env.LUMEN_PYTHON)
  || [path.join(PY_BIN, 'python'), path.join(ROOT, 'runtime', 'python', 'python.exe'), path.join(ROOT, '.venv', 'Scripts', 'python.exe')].find(exists)
  || (process.platform === 'win32' ? 'python' : 'python3');

const SHIM = 'import sys\nfrom kaggle.cli import main\nsys.argv=["kaggle"]+sys.argv[1:]\nmain()';
const KERNEL = 'lumen-motion';

function ready() { const s = db.settings(); return !!(s.kaggle_username && s.kaggle_key); }
const user = () => db.settings().kaggle_username.trim();

async function ensureCli() {
  try { await run(PY(), ['-m', 'pip', 'show', 'kaggle'], { timeout: 60000 }); }
  catch { await run(PY(), ['-m', 'pip', 'install', '-q', '-U', 'kaggle'], { timeout: 600000 }); }
}

async function cli(args, opts = {}) {
  const s = db.settings();
  const env = { ...process.env, KAGGLE_USERNAME: s.kaggle_username.trim(), KAGGLE_KEY: s.kaggle_key.trim(), KAGGLE_CONFIG_DIR: ensureDir(path.join(DATA, 'kaggle', 'config')), PYTHONIOENCODING: 'utf-8' };
  if (/^KGAT_/i.test(env.KAGGLE_KEY)) env.KAGGLE_API_TOKEN = env.KAGGLE_KEY;
  let out;
  try { out = await run(PY(), ['-c', SHIM, ...args], { env, timeout: opts.timeout || 600000, cwd: opts.cwd }); }
  catch (e) { if (opts.allowError) return e.message; throw new Error(friendly(e.message)); }
  if (opts.expect && !opts.expect.test(out)) throw new Error(friendly(out));
  return out;
}

function friendly(msg) {
  const m = String(msg);
  if (/401|Unauthorized|Invalid credentials/i.test(m)) return 'Kaggle rejected the username or key. Create a new API token in Kaggle Settings and paste it again.';
  if (/phone|verif/i.test(m)) return 'Kaggle needs your phone number verified before it gives a free GPU. Open kaggle.com, Settings, Phone verification.';
  if (/quota|exceeded|GPU.*limit/i.test(m)) return 'Your free Kaggle GPU hours for this week are used up. They reset every week; until then videos use animated pictures.';
  return 'Kaggle: ' + m.replace(/\s+/g, ' ').trim().slice(0, 300);
}

async function test() {
  await ensureCli();
  await cli(['kernels', 'list', '--mine', '--page-size', '1']);
  await cli(['datasets', 'list', '--mine'], { allowError: true });
  return `Kaggle works for ${user()}.`;
}

// ---- one GPU run at a time ----
let chain = Promise.resolve();
function enqueue(fn) { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; }

const DIMS = { '9:16': [480, 832], '16:9': [832, 480], '1:1': [576, 576], '4:5': [512, 640] };
function framesFor(seconds) {
  const f = Math.round(Math.max(2, Math.min(4, seconds)) * 24);
  return Math.max(49, Math.min(97, Math.round((f - 1) / 8) * 8 + 1));
}

/**
 * items: [{ key, image?: absolute path, prompt, seconds }]
 * returns { key: { file?: absolute path, error? } }
 */
function animate({ items, ratio, onLog = () => {} }) {
  return enqueue(() => runOnce({ items, ratio, onLog }));
}

async function runOnce({ items, ratio, onLog }) {
  if (!ready()) throw new Error('Kaggle is not connected.');
  await ensureCli();
  const token = uid();
  const work = path.join(DATA, 'kaggle', 'work');
  fs.rmSync(work, { recursive: true, force: true });
  const kDir = ensureDir(path.join(work, 'kernel'));
  const outDir = ensureDir(path.join(work, 'output'));
  const tmp = ensureDir(path.join(work, 'tmp'));
  const [W, H] = DIMS[ratio] || DIMS['9:16'];
  const clean = t => String(t || '').replace(/'{3}/g, "'").replace(/\\/g, '/').slice(0, 900);

  // Pictures travel inside the notebook itself (no Kaggle dataset, so nothing can be out of date).
  onLog('Packing scene pictures for Kaggle');
  const packed = [];
  for (let n = 0; n < items.length; n++) {
    const it = items[n];
    const o = { key: it.key, prompt: clean(it.prompt), frames: framesFor(it.seconds || 4), seed: 1000 + n };
    if (it.image) {
      const small = path.join(tmp, it.key + '.jpg');
      await run('ffmpeg', ['-y', '-i', it.image, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-q:v', '3', small]);
      o.image_b64 = fs.readFileSync(small).toString('base64');
    }
    packed.push(o);
  }
  const job = { token, width: W, height: H, steps: Number(db.settings().motion_steps) || 25, model: db.settings().motion_model || 'Lightricks/LTX-Video', items: packed };
  const code = KERNEL_CODE.replace('__TOKEN__', token).replace('__JOB__', () => JSON.stringify(job));
  fs.writeFileSync(path.join(kDir, 'job.py'), code);
  fs.writeFileSync(path.join(kDir, 'kernel-metadata.json'), JSON.stringify({
    id: `${user()}/${KERNEL}`, title: KERNEL, code_file: 'job.py', language: 'python', kernel_type: 'script',
    is_private: true, enable_gpu: true, enable_internet: true,
    dataset_sources: [], competition_sources: [], kernel_sources: [], model_sources: []
  }, null, 1));
  onLog(`Starting the free Kaggle GPU for ${items.length} clip${items.length > 1 ? 's' : ''}`);
  await cli(['kernels', 'push', '-p', kDir], { timeout: 600000, expect: /success/i });

  const t0 = Date.now();
  let result = null, lastMsg = '', started = false;
  while (Date.now() - t0 < 8 * 3600000) {
    await sleep(45000);
    const st = (await cli(['kernels', 'status', `${user()}/${KERNEL}`], { allowError: true })).toLowerCase();
    const status = /complete/.test(st) ? 'complete' : /error|fail/.test(st) ? 'error' : /cancel/.test(st) ? 'cancelled' : /running|queued|pending/.test(st) ? 'running' : 'unknown';
    if (status === 'running') started = true;
    const mins = Math.round((Date.now() - t0) / 60000);
    if (status === 'running' || status === 'unknown') {
      if (mins > 0 && mins % 5 === 0 && lastMsg !== 'm' + mins) { onLog(`Still animating on Kaggle (${mins} min so far)`); lastMsg = 'm' + mins; }
      continue;
    }
    // Finished: make sure these results belong to THIS run, not the previous one.
    fs.rmSync(outDir, { recursive: true, force: true }); ensureDir(outDir);
    await cli(['kernels', 'output', `${user()}/${KERNEL}`, '-p', outDir], { allowError: true, timeout: 1800000 });
    let r = null;
    try { r = JSON.parse(fs.readFileSync(path.join(outDir, 'result.json'), 'utf8')); } catch {}
    if (r && r.token === token) { result = r; break; }
    if (!started && mins < 20) continue; // Kaggle still shows the previous run
    if (status === 'error' || status === 'cancelled') throw new Error(friendly('The GPU notebook stopped. ' + logTail(outDir)));
    throw new Error('Kaggle did not return results for this run. Open kaggle.com, Your Work, lumen-motion to see what happened.');
  }
  if (!result) throw new Error('The Kaggle GPU took longer than 8 hours. Try fewer motion scenes.');
  if (result.error && !Object.keys(result.results || {}).length) throw new Error(friendly(result.error));

  const minutes = Math.round((Date.now() - t0) / 60000);
  onLog(`Kaggle finished in ${minutes} min${result.gpu ? ' on ' + result.gpu : ''}`);
  const out = {};
  for (const it of items) {
    const r = (result.results || {})[it.key];
    if (r && r.ok && exists(path.join(outDir, r.file))) out[it.key] = { file: path.join(outDir, r.file) };
    else out[it.key] = { error: (r && r.error) || result.error || 'not generated' };
  }
  return out;
}

function logTail(dir) {
  try {
    const f = fs.readdirSync(dir).find(x => x.endsWith('.log'));
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    let text = raw;
    try { text = JSON.parse(raw).map(x => x.data).join(''); } catch {}
    return text.trim().split('\n').slice(-4).join(' ').slice(-300);
  } catch { return ''; }
}

const KERNEL_CODE = String.raw`
# KMR Studio GPU job (runs on Kaggle). Open model: LTX-Video by Lightricks.
import os, sys, json, glob, time, subprocess, traceback
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
TOKEN = "__TOKEN__"
OUT = "/kaggle/working"
res = {"token": TOKEN, "results": {}, "gpu": None}
def save():
    json.dump(res, open(os.path.join(OUT, "result.json"), "w"))
def fit(img, W, H):
    w, h = img.size
    t = W / H
    if w / h > t:
        nw = int(h * t); img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = int(w / t); img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    return img.resize((W, H))
try:
    import base64
    job = json.loads(r'''__JOB__''')
    base = "/tmp/lumen_in"
    os.makedirs(base, exist_ok=True)
    for it in job["items"]:
        if it.get("image_b64"):
            it["image"] = it["key"] + ".jpg"
            with open(os.path.join(base, it["image"]), "wb") as fh:
                fh.write(base64.b64decode(it.pop("image_b64")))
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-U", "diffusers", "transformers", "accelerate", "sentencepiece", "imageio", "imageio-ffmpeg"], check=False)
    import torch
    if not torch.cuda.is_available():
        raise RuntimeError("No GPU was given. Verify your phone number in Kaggle settings.")
    res["gpu"] = torch.cuda.get_device_name(0)
    major = torch.cuda.get_device_capability(0)[0]
    dtype = torch.bfloat16 if major >= 7 else torch.float16
    from diffusers.utils import export_to_video, load_image
    W, H = job["width"], job["height"]
    has_image = any(it.get("image") for it in job["items"])
    if has_image:
        from diffusers import LTXImageToVideoPipeline as P
    else:
        from diffusers import LTXPipeline as P
    import gc
    pipe = P.from_pretrained(job["model"], torch_dtype=dtype)
    NEG = "worst quality, inconsistent motion, blurry, jittery, distorted, deformed, morphing, watermark, text"
    embeds, mode = {}, "split"
    try:
        # Step 1: only the text encoder on the GPU. Encode every prompt, then remove it to free ~10 GB.
        pipe.text_encoder.to("cuda")
        with torch.no_grad():
            for it in job["items"]:
                pe, pm, ne, nm = pipe.encode_prompt(prompt=it["prompt"], negative_prompt=NEG, do_classifier_free_guidance=True,
                                                    num_videos_per_prompt=1, max_sequence_length=128, device="cuda")
                embeds[it["key"]] = dict(prompt_embeds=pe, prompt_attention_mask=pm, negative_prompt_embeds=ne, negative_prompt_attention_mask=nm)
        pipe.text_encoder.to("cpu")
        pipe.text_encoder = None
        gc.collect(); torch.cuda.empty_cache()
        # Step 2: video model and decoder on the GPU.
        pipe.transformer.to("cuda"); pipe.vae.to("cuda")
    except Exception as e:
        print("split mode failed, using low-memory mode:", e, flush=True)
        traceback.print_exc()
        mode, embeds = "sequential", {}
        pipe = P.from_pretrained(job["model"], torch_dtype=dtype)
        gc.collect(); torch.cuda.empty_cache()
        pipe.enable_sequential_cpu_offload()
    for fn in ("enable_tiling", "enable_slicing"):
        try:
            getattr(pipe.vae, fn)()
        except Exception:
            pass
    if hasattr(pipe.vae, "use_framewise_decoding"):
        pipe.vae.use_framewise_decoding = True
    res["mode"] = mode
    for it in job["items"]:
        key, t0 = it["key"], time.time()
        frames_try = [it["frames"]] + ([49] if it["frames"] > 49 else [])
        for n_frames in frames_try:
            try:
                args = dict(width=W, height=H, num_frames=n_frames, num_inference_steps=job["steps"], guidance_scale=3.0,
                            generator=torch.Generator().manual_seed(it.get("seed", 0)))
                if it["key"] in embeds:
                    args.update(embeds[it["key"]])
                else:
                    args.update(prompt=it["prompt"], negative_prompt=NEG)
                if it.get("image"):
                    args["image"] = fit(load_image(os.path.join(base, it["image"])).convert("RGB"), W, H)
                with torch.no_grad():
                    frames = pipe(**args).frames[0]
                f = key + ".mp4"
                export_to_video(frames, os.path.join(OUT, f), fps=24)
                res["results"][key] = {"ok": True, "file": f, "secs": round(time.time() - t0), "frames": n_frames}
                break
            except Exception as e:
                traceback.print_exc()
                res["results"][key] = {"ok": False, "error": str(e)[:300]}
                gc.collect(); torch.cuda.empty_cache()
                if "out of memory" not in str(e).lower():
                    break
        save()
        print(key, "done in", round(time.time() - t0), "s", res["results"][key].get("ok"), flush=True)
except Exception as e:
    traceback.print_exc()
    res["error"] = str(e)[:500]
save()
`;

module.exports = { ready, test, animate, framesFor, DIMS, ensureCli };
