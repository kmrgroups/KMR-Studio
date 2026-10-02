# KMR Studio (cloud)

Upload your Google Flow clips (or any video), join several into one longer video if you like, and post to YouTube, Instagram, Facebook, LinkedIn and X, for one profile or many at once. Runs completely in the cloud on Vercel's free plan: no PC, no card.

## AI title, caption, hashtags and thumbnail
With a free Gemini key (Settings), the AI watches the video (8 frames and the sound) as soon as it is uploaded, fills in the title, caption and hashtags, and offers three thumbnails with a short headline (English, Tamil or Hindi). Anything left empty is filled while posting. Thumbnails go to YouTube (channel must be verified for custom thumbnails), the Instagram Reel cover and Facebook.

## How it works
- **web/**: the app (phone and desktop). **api/main.js**: sign-in, profiles, settings, posts. **api/work.js**: background work (joining with FFmpeg, then one run per account).
- Videos go from your phone straight into a **private Vercel Blob** store (free: 1 GB). A video is deleted from storage once every account has posted it.
- Settings, profiles and post status live in **Upstash Redis** (free: 500,000 commands a month).
- Instagram and Facebook download the video through a short-lived signed link. YouTube, LinkedIn and X get it uploaded from the function.

## Set up on Vercel (once, about 10 minutes)
1. Import this repo in Vercel (**Add New, Project**, **KMR-Studio**, **Deploy**). Nothing to change.
2. Project **Storage**, **Create Database**, **Upstash for Redis**, Free, **Create**, connect it to this project.
3. Project **Storage**, **Create**, **Blob**, access **Private**, **Create**, connect it to this project.
4. Project **Settings, Environment Variables**: `KMR_PASSWORD` = the password you want to sign in with.
5. **Deployments**, three dots on the newest, **Redeploy**.

**Updating later:** in KMR Studio open **Settings, Update KMR Studio**, save a GitHub token once, then upload the update zip. It is sent to GitHub and Vercel publishes it by itself.
6. **Settings, Domains**: add `studio.kmr-groups.com` (one CNAME record `studio` -> `cname.vercel-dns.com` at Squarespace if Vercel asks).
7. Open studio.kmr-groups.com, sign in, then **Settings** (app keys) and **Profiles** (connect accounts).

LinkedIn and X apps need the return address `https://studio.kmr-groups.com/oauth/callback`.

## Limits of the free plan
- One background run lasts at most 5 minutes. Clips of the same size (like Flow clips) join instantly; different sizes are re-encoded at about a third of their length.
- Up to 600 MB per upload, 1 GB stored at a time (videos are removed after posting).
- X charges about US$0.02 per video post. YouTube allows about 6 uploads a day per Google project.

## Local test
`npm install`, then `npm run dev` (password `test1234`). Storage and database are simulated in `.devdata/`.

## The older PC version
`server.js`, `lib/`, `public/` and the `.bat` files are the Windows PC version (1.x) with AI video making and Autopilot. They are not deployed to Vercel.
