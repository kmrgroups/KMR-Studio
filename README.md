# KMR Studio

Make videos automatically (script, voice-over in 70+ languages, visuals, music, subtitles), post your own videos, and publish to YouTube, Instagram, Facebook, LinkedIn and X for several people or brands. Everything is free except X (paid by X) and the optional Veo engine (paid by Google).

The full step-by-step setup guide is the separate "KMR Studio setup guide" document. This page is the short version.

## 1. Start it on your Windows PC (10 minutes, once)
1. Unzip `kmr-studio.zip` to `C:\KMR-Studio`.
2. Double-click **START.bat**. The first start downloads Node.js, FFmpeg and the voice engine into the `runtime` folder (5 to 10 minutes, once). Your browser then opens `http://localhost:3456`.
3. Set your password. Keep the black window open or minimised; closing it stops the studio.
4. Double-click **START-WITH-WINDOWS.bat** once, so the studio starts whenever you log in.
5. In Windows power settings, set **Sleep: Never** (when plugged in), so Autopilot and your phone access keep working.

## 2. Open it from anywhere: studio.kmr-groups.com (free, once)
Open **Settings, Online access** and follow the 4 steps on screen:
1. Install **Tailscale** (free app; the button links to the download).
2. **Sign in** to Tailscale with Google (the button opens the page).
3. Press **Go online**, and allow it once in Tailscale. You get a fixed https address like `https://kmr-pc.tail1234.ts.net`.
4. Press **Copy address**. In Vercel, open project **KMR-Studio**, go to **Settings, Environment Variables**, and add `KMR_STUDIO_URL` with that address. Then **Redeploy** and press **Test**.

The PC must stay on.

### The web door (this repo on Vercel, once)
This GitHub repo **KMR-Studio** is also a tiny Vercel project: `api/door.js` forwards every visit to the studio PC, and `vercel.json` sends all paths to it. The studio program itself never runs on Vercel.
1. vercel.com, **Add New, Project**, import **KMR-Studio**, press **Deploy** (no settings to change).
2. Project **Settings, Domains**, add `studio.kmr-groups.com`. Vercel shows one **CNAME** record (`studio` → `cname.vercel-dns.com`). Add it where the kmr-groups.com DNS is managed (Squarespace **Domains, DNS settings**; if Vercel says the domain already uses Vercel's nameservers, it is added automatically).
3. Add `KMR_STUDIO_URL` as in step 4 above.

It is completely separate from the company website repo.

## 3. Follow the Setup checklist
**Settings, Setup checklist** lists every remaining step with a button that opens the right place. That covers the logo, script writer, Telegram, app keys, profiles and accounts, default "Post to" and music.

## Updating
**Settings, Updates and help, Upload update zip.** Videos, profiles, keys and settings are kept.

## Where things are stored
- `data/` holds your database, videos, music and logo. Updates never touch it. Back it up if you move computers.
- `runtime/` holds the downloaded tools (Node.js, FFmpeg, voice engine).

## If something goes wrong
- The black window shows what the studio is doing. Closing and double-clicking START.bat restarts it.
- For a video problem, open it in the Library, then **Activity**. That text says exactly what failed.
- For an account problem, go to **Connections**, open the account and press **Check**.

## Advanced: a Linux server instead of the PC
`install.sh` installs KMR Studio as a service on Ubuntu. Tailscale works there too (`sudo tailscale up`, then Go online).
