// Free natural voice-over in 70+ languages via Microsoft Edge TTS (edge-tts python package).
const fs = require('fs');
const path = require('path');
const { ROOT, DATA, PY_BIN, ensureDir, run, sleep } = require('./util');

const exists = f => { try { return fs.existsSync(f); } catch { return false; } };
const PY = process.env.LUMEN_PYTHON && exists(process.env.LUMEN_PYTHON) ? process.env.LUMEN_PYTHON
  : [path.join(PY_BIN, 'python'), path.join(ROOT, 'runtime', 'python', 'python.exe'), path.join(ROOT, '.venv', 'Scripts', 'python.exe')].find(exists)
  || (process.platform === 'win32' ? 'python' : 'python3');
const EDGE_EXE = [path.join(PY_BIN, 'edge-tts'), path.join(ROOT, 'runtime', 'python', 'Scripts', 'edge-tts.exe')].find(exists);
const edge = args => EDGE_EXE ? [EDGE_EXE, args] : [PY, ['-m', 'edge_tts', ...args]];
const CACHE = () => path.join(ensureDir(DATA), 'voices.json');

const langNames = new Intl.DisplayNames(['en'], { type: 'language' });
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

let voices = null;
async function listVoices(force = false) {
  if (voices && !force) return voices;
  if (!force) { try { voices = JSON.parse(fs.readFileSync(CACHE(), 'utf8')); return voices; } catch {} }
  const out = await run(PY, ['-c', 'import asyncio,json,edge_tts;print(json.dumps(asyncio.run(edge_tts.list_voices())))'], { timeout: 60000 });
  const raw = JSON.parse(out);
  voices = raw.map(v => {
    const [lang, region] = v.Locale.split('-');
    let language = lang;
    try { language = langNames.of(lang); } catch {}
    let place = region || '';
    try { place = regionNames.of(region); } catch {}
    const person = v.ShortName.split('-').slice(2).join('-').replace(/Neural$/, '').replace(/Multilingual/, ' multilingual');
    return { id: v.ShortName, language, place, gender: v.Gender, label: `${person}, ${String(v.Gender).toLowerCase()}, ${place}` };
  }).sort((a, b) => a.language.localeCompare(b.language) || a.label.localeCompare(b.label));
  fs.writeFileSync(CACHE(), JSON.stringify(voices));
  return voices;
}

async function voiceFor(language, preferred) {
  const all = await listVoices().catch(() => []);
  if (!all.length) return preferred || 'en-US-AndrewNeural';
  const ofLang = all.filter(v => v.language.toLowerCase() === String(language).toLowerCase());
  if (preferred && ofLang.some(v => v.id === preferred)) return preferred;
  if (!ofLang.length) return preferred || 'en-US-AndrewNeural';
  const india = ofLang.find(v => /-IN-/.test(v.id));
  return (india || ofLang[0]).id;
}

async function speak({ text, voice, dest, rate = '+0%' }) {
  const txt = dest.replace(/\.\w+$/, '.txt');
  fs.writeFileSync(txt, text);
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const [cmd, args] = edge(['--voice', voice, '--rate', rate, '-f', txt, '--write-media', dest]);
      await run(cmd, args, { timeout: 180000 });
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
      throw new Error('Empty audio');
    } catch (e) { last = e; await sleep(3000 * (i + 1)); }
  }
  throw new Error('Voice engine failed. Open Settings and press "Repair voice engine". ' + String(last.message).slice(0, 200));
}

async function repair() {
  await run(PY, ['-m', 'pip', 'install', '-q', '-U', 'edge-tts', 'kaggle'], { timeout: 600000 });
  voices = null;
  return listVoices(true);
}

module.exports = { listVoices, voiceFor, speak, repair };
