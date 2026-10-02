# KMR Studio (formerly Lumen Studio): project handover

> **2.0.0 (current): KMR Studio Cloud.** The owner does not want a PC running, and wants it free with no card. He narrowed the scope to: upload Google Flow videos and post them, join several short videos into one longer video and post it, and post to one profile or several. That runs fully on Vercel Hobby:
> - `web/` (vanilla SPA), `api/main.js` (router; `vercel.json` rewrites `/api/*` and `/oauth/callback` to it), `api/work.js` (maxDuration 300, answers 202 and continues with `waitUntil`).
> - `cloud/kv.js`: Upstash Redis REST (`KV_REST_API_URL`/`TOKEN`). Keys `kmr:settings`, `kmr:profiles`, `kmr:acc:<pid>` (hash yt/meta/li/x), `kmr:job:<id>`, `kmr:jobs` (list), `kmr:res:<id>` (hash target -> result), locks.
> - `cloud/files.js`: private Vercel Blob. Browser uploads with `uploadPresigned` (bundled into `web/vendor/blob-client.js` with esbuild) against `/api/upload` (`handleUploadPresigned`). Signed GET links for Instagram/Facebook and previews.
> - `cloud/media.js`: ffmpeg-static; probe by parsing `ffmpeg -i`; single MP4 H.264/AAC used as is; same-format clips concat with `-c copy`; mixed sizes one-pass filter_complex (blur/bars/crop), ultrafast.
> - `cloud/jobs.js`: create, prepare, one run per target. Platform posters return `{done}` or `{wait: state}`; waits hand over to a fresh run (Instagram and LinkedIn processing, X media processing).
> - Login: env `KMR_PASSWORD`, HMAC cookie. Test: `dev/server.js` simulates Vercel, Blob and Redis (`KMR_FAKE_DIR`).
> - Deleted videos: once all targets post, and failed ones after 7 days (storage is 1 GB).
>
> **2.1.0:** `cloud/describe.js` (Gemini with inline JPEG frames and MP3 audio; thumbnails via ffmpeg `ass` filter with fonts in `cloud/fonts`: Anton, Noto Sans Tamil, Noto Sans Devanagari, read by name so Vercel bundles them) and `cloud/preview.js` (Post page preview, POST /api/work {kind:'preview'} for the signed-in owner, returns data URLs). Jobs carry `auto` (which fields the AI may fill), `thumb_mode` and `thumb` (out/<id>-thumb.jpg). Settings `auto_text`, `auto_thumb`, `text_language`.
>
> **2.2.0:** Settings, "Bring keys from the laptop version": the page reads the laptop's `data\db.json`, sends only keys and account logins (`cloud/transfer.js` importData, also reads pre-1.7 single-account files), and "Download backup" (GET /api/export) for the cloud version.
>
> **2.3.0:** Telegram in the cloud (`cloud/telegram.js`): webhook at /api/telegram (secret header), /start <code> links the chat, review message with Approve/Reject (callback ap:/rj:), result message after posting. Jobs have `approve`; after prepare they wait in status `review` (approve/reject also in History). Settings `telegram_token`, `telegram_chat_id`, `approve_default`; imported from the laptop db.json. Gemini: `cloud/gemini.js` lists models, asks two at once with thinkingBudget 0; Groq (`cloud/groq.js`) is the backup (Whisper + text model).
>
> **2.5.0 Autopilot:** `cloud/autopilot.js` keeps schedules in kv `schedules` (topics used in order via `ap_next:<id>`, recent titles `ap_recent:<id>`; times in India time). `vercel.json` has 24 daily crons (Hobby allows daily only) hitting /api/cron every hour; `tick` starts due slots (3 h catch-up, `slot:<id>:<date time>` SET NX) and re-triggers stuck `making` jobs. A job in status `making` runs `make` stages in /api/work `{kind:'make'}`: script (Gemini JSON, Groq backup) -> veo_start/veo_wait (`cloud/veo.js`, keys `veo_key_1/2`, monthly spend per key in `veo:<YYYY-MM>:<tail>`, limit `veo_limit`) or pictures (Pollinations via `cloud/compose.js`) -> voice (`cloud/tts.js`, Gemini TTS) -> render (`compose.build`: clips or zooming pictures, ASS subtitles, voice) -> `out/<id>-raw.mp4`, then the normal `prepare` (thumbnail from `job.thumb_text`, Telegram OK, posting). Veo errors fall back to pictures. Optional env `CRON_SECRET`. Test: scratchpad `aptest.js`.
>
> 2.7.0 WhatsApp Status: WhatsApp has no official API for posting a Status, so `cloud/whatsapp.js` is an assisted platform (`whatsapp`, profile section `wa` = {on, link}). The poster sends the finished video (up to 50 MB) to Telegram with sendVideo, then a second message with the caption in a `<code>` block (title, description, up to 6 hashtags, link; max 700 characters, the link is always kept). Link order: job.link (Post page field) then profile wa.link. Videos over 50 MB fail with a clear message and stay in storage so History's "Share to WhatsApp Status" button (Web Share API, two taps: load, then share) can be used. Not used: unofficial libraries (Baileys, whatsapp-web.js): they break WhatsApp's terms and need an always-on server.
>
> Everything below describes the older PC version (1.x), still in the repo but not deployed.


Read this first if you are continuing development (a new Claude chat or another developer).

## What it is
An automatic AI video maker and publisher for Rajavelu. Topic in, finished video out: script, voice-over in 70+ languages, visuals, music, sound effects, subtitles, any aspect ratio, Telegram approval, then posting to YouTube, Instagram Reels and Facebook. It also runs Autopilot on a schedule and studies viral videos.

The owner wants it to be user friendly and free. He does not paste code. Every delivery is a full zip that he unzips (or uploads in Settings, Update) and runs. Keep that promise: no manual edits, no terminal steps after the first install.

## How it runs
- **Windows PC** (main way now): `START.bat` downloads portable Node, FFmpeg and Python (edge-tts, kaggle) into `runtime/` the first time, then runs `node server.js` in a restart loop and opens http://localhost:3456. `START-WITH-WINDOWS.bat` adds it to startup.
- **Linux / Oracle Cloud Always Free**: `install.sh` sets up a systemd service.
- **Updates**: Settings, Update uploads the zip. `lib/updater.js` copies new files over the app, never touching `data/`, `runtime/` or `.venv/`, then exits so the loop or service restarts it.
- Zero npm dependencies. Node 20+, ffmpeg and edge-tts only.

## Code map
| File | Job |
|---|---|
| `server.js` | HTTP server, JSON API, login (scrypt password, cookie session), file uploads |
| `lib/db.js` | One JSON file `data/db.json`: settings, jobs, schedules, tools, trends |
| `lib/pipeline.js` | Production line and workers: `produce` (Lumen engine), `produceCinematic` (Veo and Flow), approve/publish, Flow clip handling |
| `lib/gemini.js` | Script writer: Gemini first, Groq as automatic backup. `writeScript`, `writeShots`, `topicIdea`, `ideas` |
| `lib/tts.js` | Edge-TTS voices |
| `lib/visuals.js` | Pollinations AI images, Pexels stock footage, Freesound effects, music library with mood matching |
| `lib/render.js` | FFmpeg: Ken Burns scenes, audio mix, loudness, ASS subtitles; `renderClips` joins Veo/Flow clips |
| `lib/kaggle.js` | Free Kaggle GPU: pushes a private notebook running LTX-Video, polls, downloads clips |
| `lib/veo.js` | Paid Google Veo via Gemini API with a monthly spending cap |
| `lib/telegram.js` | Bot: review with Approve/Reject/Remake, order by topic, Flow assistant (prompts out, clips in) |
| `lib/youtube.js` | Device-code OAuth and resumable upload |
| `lib/meta.js` | Instagram Reels and Facebook Page posting |
| `lib/trends.js` | YouTube viral analysis and idea generation |
| `lib/repurpose.js` | Long video to Shorts (Groq Whisper or Gemini transcription) |
| `lib/uploads.js` | Upload and post: stages your own videos, then posts each separately or joins them into one (blurred background or crop). Converts to H.264/AAC MP4. Jobs have `source: 'upload'` and their own `post_to` |
| `lib/platforms.js` | Registry of the 5 platforms; a target is `profileId:platform` (e.g. `me:youtube`); `published` is keyed the same way |
| `lib/oauth.js` | Web sign-in state for LinkedIn and X. The redirect is `studio.kmr-groups.com/oauth/callback` once the door tests OK, otherwise the Tailscale address `/oauth/callback` |
| `lib/online.js` | Online access wizard (Tailscale Funnel) and the door test |
| `api/door.js`, `vercel.json` | The Vercel web door (only this runs on Vercel) |
| `lib/linkedin.js` | LinkedIn personal-profile video posts (assets registerUpload, upload, ugcPosts). 60-day tokens, no refresh |
| `lib/x.js` | X OAuth2 PKCE and v2 chunked media upload (initialize, append, finalize) then POST /2/tweets. Paid per use |
| `lib/scheduler.js` | Autopilot in the owner's timezone, with catch-up for missed runs |
| `public/` | Single-page dashboard (vanilla JS, no build step) |

## Video engines
- **Lumen**: free. AI pictures animated with zoom and pan, optional AI motion on Kaggle.
- **Flow**: the owner has a Google AI Pro plan. Lumen writes a shot list and a character picture. He makes 8-second clips in Google Flow (Veo 3.1) and uploads them in the dashboard or replies to the bot. Lumen then joins them, adds subtitles and music, and sends the result for approval.
- **Veo**: fully automatic but paid per second through the Gemini API, with a monthly cap (default $10).

## Version history
- 1.0 to 1.3: dashboard, Lumen engine, Telegram, YouTube, Kaggle motion, Instagram and Facebook, trends, tools, Windows one-click setup.
- 1.4.0: Flow and Veo cinematic engines.
- 1.5.0:
  - Flow assistant in Telegram: shot prompts are sent to the phone, clips come back as replies, and there is a Finish button.
  - Flow panel redesign: progress ring, drag and drop, clip previews, remove clip, Copy all prompts.
  - Clips are checked on upload (a bad file is rejected; wrong orientation gets a warning).
  - Autopilot catch-up: a run missed while the PC was asleep still happens if it is less than 2 hours late.
  - Telegram no longer repeats orders after a restart (the update offset is saved).
  - A video can't be deleted while it is posting.
  - Premium dashboard refresh: icons, stat tiles, glass panels, a better mobile bottom bar and a 2-column library on phones.

- 1.6.0:
  - New Upload page for posting your own videos, one or many, each separately or joined into one, to the chosen connected platforms.
  - AI writes the title, caption and hashtags.
  - Optional approval on Telegram before posting.
  - Phone rotation handled; any format converted.
  - Clearer Telegram "cannot be reached" error.

- 1.6.1:
  - Facebook/Instagram login fix. Connecting now requires the App ID and secret, so the token is swapped for a Page token that never expires; before this, a missing secret left a 1-hour token.
  - Check connection button and a daily background check.
  - Reconnect without disconnecting; failed Instagram/Facebook posts retry by themselves after reconnecting.
  - Clear reasons for a dead login (password changed, expired, and so on).
  - Fix for input boxes inside collapsible sections.

- 1.7.0:
  - **Profiles** (`db.state.profiles`: `{id, name, yt, meta, li, x}`): accounts are per profile. 1.6 settings migrate to profile `me`; old jobs' `post_to` and `published` are read through `platforms.targetsOf` and `publishedOf`.
  - New LinkedIn and X platforms.
  - **Post to** picker in Studio, Upload, Autopilot, the video screen and Settings (`default_targets`).
  - Per-profile YouTube device sign-in, with optional own Google keys per profile.
  - Twice-daily login checks, with a Telegram reminder before LinkedIn expires.
  - Installable on phones (manifest, icons, a small service worker).

- 1.8.0:
  - **Renamed to KMR Studio** (visible text only; internal names such as the `lumen` cookie, `LUMEN_DATA` and the systemd unit `lumen-studio` stay the same so updates keep working).
  - **Logo upload:** `lib/brand.js`, stored in `data/brand`; it makes 192 and 512 icons, and the manifest is generated by `/manifest.webmanifest`.
  - **Online access:** `lib/tunnel.js` downloads `cloudflared` to `runtime/` and runs `tunnel run --token`. The owner routes `studio.kmr-groups.com` to `http://localhost:3456` in Cloudflare.
  - When `public_url` is https, LinkedIn and X sign in straight to `<public_url>/oauth/callback`; the return page is now optional (Advanced).
  - Behind the tunnel: `Secure` cookies and the real visitor IP from `cf-connecting-ip`.
  - **Settings** reorganised into tabs (Setup checklist, Brand and account, Video style, Posting, Online access, Music library, Updates and help). **Connections** is split into tabs (Profiles and accounts, App keys, Services). A setup banner on the Studio page shows the next step.
  - Oracle is no longer the recommended route. The PC plus Cloudflare Tunnel is the default, because the owner found Oracle too complicated.

- 1.9.0:
  - **Online access** is now a 4-step wizard (`lib/online.js`) driving **Tailscale Funnel**: detect the app, `tailscale up` sign-in link, `tailscale funnel --bg 3456` plus the one-time approval link, and the fixed `https://<pc>.<tailnet>.ts.net` saved as `public_url`. No DNS change; the owner's domain is registered at Squarespace, and www.kmr-groups.com runs on Vercel.
  - **Website door:** the repo `kmrgroups/kmr-group-website` (commit 133ede2) `next.config.js` redirects `/kmr-studio` and `/kmr-studio/*` to `KMR_STUDIO_URL` (Vercel env var); if it is unset, it shows `public/kmr-studio.html`. KMR Studio tests the door (`door_url`, `door_ok`). When `door_ok`, the LinkedIn/X `redirect_uri` is `https://www.kmr-groups.com/kmr-studio/oauth/callback`.
  - Cloudflare Tunnel is kept under Advanced. The callback HTML file and the paste-a-link panel are removed.
  - **Sign out** added to the sidebar and to a mobile top bar.
  - The engine cannot run on Vercel (time limits, no disk, no background jobs); the website only forwards to the PC.

- 1.9.1:
  - **Moved out of the website repo** (owner's request). Commit 133ede2 in `kmrgroups/kmr-group-website` was reverted; that repo has nothing of KMR Studio.
  - The source now lives in its own GitHub repo **`kmrgroups/KMR-Studio`**, which is also its own Vercel project: `api/door.js` (307 redirect of every path and query to `KMR_STUDIO_URL`, or a "not connected" page with header `X-KMR-Door: not-connected`), `vercel.json` (all non-api paths rewrite to the door, output dir `door/`), `.vercelignore` (the app is not uploaded to Vercel).
  - The address is **studio.kmr-groups.com** (Vercel domain plus one CNAME). `door_url` default changed; 1.9.0 installs that had the old `/kmr-studio` door are moved to the new one. The wizard's step 4 has a Door address box (for a `*.vercel.app` address before the domain is added), and Test explains a missing domain.

## Known limits (not bugs)
- X API has no free tier since February 2026 (pay per use, about US$0.02 per video post). LinkedIn company pages need Community Management API approval; only personal profiles are supported.
- Free GPU is about 30 Kaggle hours a week. LTX-Video clips are 2 to 4 seconds at 480p to 832p.
- YouTube API uploads stay private until the owner's Google app passes Google's audit.
- Telegram bots can download at most 20 MB per file.
- The live connections (Gemini, Telegram, YouTube, Meta, Kaggle, Veo) cannot be reached from Claude's sandbox. Ask the owner for the Activity log text or a screenshot when something fails.

## Working style the owner expects
- Always deliver a complete, working zip with VERSION bumped. Never partial files.
- Use plain words in the UI, and write every error message so he knows what to do next.
- Test the render pipeline locally with ffmpeg before shipping.
