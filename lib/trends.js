// Viral analysis: finds the fastest-growing videos in a niche on YouTube, asks the script writer
// what makes them work, and turns that into original video ideas.
const db = require('./db');
const { uid } = require('./util');
const gemini = require('./gemini');

const YT = 'https://www.googleapis.com/youtube/v3';

async function ytGet(path, params) {
  const token = await require('./youtube').accessToken();
  const r = await fetch(`${YT}/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(60000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || String(r.status);
    if (/quota/i.test(msg)) throw new Error('YouTube search limit for today is used up. It resets at midnight Pacific time.');
    throw new Error('YouTube: ' + msg);
  }
  return j;
}

function isoSeconds(d) {
  const m = String(d || '').match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

async function langCode(language) {
  try {
    const v = (await require('./tts').listVoices()).find(x => x.language.toLowerCase() === String(language).toLowerCase());
    return v ? v.id.split('-')[0] : '';
  } catch { return ''; }
}

async function findVideos({ niche, language, region = 'IN', shorts = true, days = 30 }) {
  const after = new Date(Date.now() - days * 864e5).toISOString();
  const lang = await langCode(language);
  const q = { part: 'snippet', type: 'video', order: 'viewCount', maxResults: '30', q: niche, publishedAfter: after, regionCode: region };
  if (lang) q.relevanceLanguage = lang;
  if (shorts) q.videoDuration = 'short';
  const s = await ytGet('search', q);
  const ids = (s.items || []).map(i => i.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const v = await ytGet('videos', { part: 'snippet,statistics,contentDetails', id: ids.join(',') });
  const now = Date.now();
  return (v.items || []).map(x => {
    const views = +x.statistics.viewCount || 0, likes = +x.statistics.likeCount || 0, comments = +x.statistics.commentCount || 0;
    const ageDays = Math.max(1, (now - new Date(x.snippet.publishedAt).getTime()) / 864e5);
    const secs = isoSeconds(x.contentDetails.duration);
    return {
      id: x.id, title: x.snippet.title, channel: x.snippet.channelTitle, published: x.snippet.publishedAt,
      thumb: x.snippet.thumbnails?.medium?.url || x.snippet.thumbnails?.default?.url || '',
      description: String(x.snippet.description || '').slice(0, 300), tags: (x.snippet.tags || []).slice(0, 10),
      views, likes, comments, seconds: secs, perDay: Math.round(views / ageDays),
      engagement: views ? +(((likes + comments) / views) * 100).toFixed(2) : 0,
      url: secs <= 180 ? `https://youtube.com/shorts/${x.id}` : `https://youtu.be/${x.id}`
    };
  }).filter(x => !shorts || x.seconds <= 180).sort((a, b) => b.perDay - a.perDay).slice(0, 15);
}

async function analyze({ niche, language, region, shorts = true, days = 30 }) {
  niche = String(niche || '').trim();
  if (!niche) throw new Error('Type a niche or topic to analyse, like "Tamil kids stories".');
  if (!require('./youtube').anyConnected()) throw new Error('Connect YouTube for at least one profile first (Connections page). KMR Studio uses it to search YouTube.');
  language = language || db.settings().default_language;
  const videos = await findVideos({ niche, language, region, shorts, days });
  if (!videos.length) throw new Error('No recent videos found for that niche. Try broader words or a longer period.');
  const list = videos.map((v, i) => `${i + 1}. "${v.title}" | ${v.views} views | ${v.perDay} views/day | ${v.seconds}s | engagement ${v.engagement}% | tags: ${v.tags.join(', ')} | ${v.description.replace(/\s+/g, ' ').slice(0, 160)}`).join('\n');
  const insights = await gemini.generate(`You are a YouTube growth strategist. These are the fastest-growing ${shorts ? 'Shorts' : 'videos'} from the last ${days} days for the niche "${niche}":
${list}

Study them and return ONLY JSON:
{
 "summary": "2-3 sentences on what is working right now in this niche",
 "patterns": ["5 to 7 concrete patterns: topics, emotions, hooks, pacing, visuals"],
 "title_formulas": ["4 reusable title templates with blanks, like 'Why ___ never ___'"],
 "best_length_seconds": 45,
 "ideas": [
  {"title": "catchy title in ${language}", "hook": "first spoken line in ${language}", "angle": "one sentence in English describing the video so a scriptwriter can make it", "why": "why it should perform, based on the patterns", "format": "9:16 or 16:9", "length_seconds": 45, "style": "one of: cartoon, 3d, anime, cinematic, storybook, stock"}
 ]
}
Give 8 ideas. Ideas must be ORIGINAL: inspired by the patterns, never copies of a listed video.`);
  const report = { id: uid(), created: Date.now(), niche, language, region: region || 'IN', shorts, days, videos, insights, used: [] };
  db.addTrend(report);
  return report;
}

// For Autopilot: take the next unused idea for this niche, refreshing the analysis once a day.
async function nextIdea(niche, language) {
  let r = db.trends().find(t => t.niche.toLowerCase() === String(niche).toLowerCase() && t.language === language && Date.now() - t.created < 864e5);
  const fresh = r && (r.insights?.ideas || []).some((_, i) => !(r.used || []).includes(i));
  if (!fresh) r = await analyze({ niche, language, shorts: true, days: 30 });
  const i = (r.insights.ideas || []).findIndex((_, n) => !(r.used || []).includes(n));
  if (i < 0) return null;
  r.used = [...(r.used || []), i];
  db.save();
  const idea = r.insights.ideas[i];
  return { topic: `${idea.title}. ${idea.angle} Hook: ${idea.hook}`, idea };
}

module.exports = { analyze, nextIdea };
