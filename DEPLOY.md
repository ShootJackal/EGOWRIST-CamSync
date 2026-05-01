# DEPLOY.md — Get EGO GoProSYNC live on Vercel today

Total time: ~10 minutes if your repo is already on GitHub.

This guide gets the **web build** live on Vercel. The Vercel-hosted page works
in **Mock mode** out of the box (great for sharing with collectors and
stakeholders). For real GoPro control you build the native app from the same
repo via EAS — that's documented separately in `TESTING.md` Stage 1.

---

## What you need before you start

- A GitHub account (the repo is already there).
- A Vercel account — free tier is fine. Sign up at https://vercel.com/signup
  using "Continue with GitHub" so the GitHub install happens automatically.
- About 10 minutes.

You do **not** need:
- The Mac bridge running.
- Any GoPro hardware.
- Any paid Vercel features.
- A custom domain (you can add one later).

---

## Step 1 — Push the latest branch to GitHub

If you haven't already, make sure the latest changes are on GitHub. From this
repo on the agent's working copy that's already done. To confirm from your own
machine:

```bash
git fetch origin
git log --oneline origin/cursor/verify-gopro-command-center-8353 -1
```

You should see a recent commit on the branch. Either merge that branch into
`main` (recommended for the production deploy) or deploy directly from the
branch — Vercel supports both.

---

## Step 2 — Import the repo into Vercel

1. Open https://vercel.com/new in your browser.
2. Under **Import Git Repository**, find `gopro-command-center-export` (or
   whatever you named the GitHub repo) and click **Import**.
   - If it doesn't show up, click **Adjust GitHub App Permissions** and
     grant Vercel access to that repo.
3. On the **Configure Project** page Vercel may auto-detect "Other". Override
   these explicitly:

   | Field | Value |
   |---|---|
   | **Framework Preset** | Other |
   | **Root Directory** | `.` (leave default) |
   | **Build Command** | `npm run vercel-build` |
   | **Output Directory** | `dist` |
   | **Install Command** | `npm install` (default) |
   | **Node.js Version** | 20.x |

4. Expand **Environment Variables**. Add **one** variable, optional:
   - Name: `EXPO_PUBLIC_DEFAULT_BRIDGE_URL`
   - Value: leave blank (only set this if you have a Mac bridge already
     reachable; for Mock-mode sharing you want it blank).
   - Environments: All.

   This is the only env var the web build cares about. The Direct BLE and
   Mock paths use no env vars at all.

5. Click **Deploy**. The build runs `npm install` then `npm run vercel-build`,
   which is `expo export --platform web`. You should see a green **Ready**
   in 2–4 minutes.

6. When it's done, Vercel hands you a URL like
   `https://ego-goprosync.vercel.app`. Open it on your phone — you should
   see the dashboard in **Mock mode** with three simulated cameras.

> **`vercel.json` already exists** in the repo with the right `buildCommand`,
> `outputDirectory`, and SPA rewrite rule, so even if Vercel's UI auto-fills
> something different, the file overrides it.

---

## Step 3 — Verify the deploy

On the deployed URL:

1. **Settings** tab → confirm the page loads with Mock / Local LAN / Tunnel
   options. **Direct BLE** will be greyed out with the explanation
   *"native app only"* — that's correct for the web build.
2. Pick **Mock**, hit **Save**.
3. **Capture** tab → you should see three simulated cameras (GoPro 1, 2, 3).
4. **Connect All** → cards turn green within a few seconds.
5. **Start All** → red recording banner with a live timer; cards say `● REC`.
6. **Stop All** → session lands in the **Logs** tab.

If all five steps work, the deploy is good.

---

## Step 4 — (Optional) Custom domain

If you want `gopros.yourcompany.com` instead of the `*.vercel.app` URL:

1. Vercel project → **Settings → Domains** → **Add**.
2. Enter your domain → Vercel shows you which DNS record to add.
3. In your DNS provider (Cloudflare, Namecheap, etc.) add the CNAME or A
   record exactly as shown.
4. Wait 1–60 minutes for propagation; Vercel auto-issues an SSL cert.

You can skip this entirely and use the `*.vercel.app` URL forever.

---

## Step 5 — (Optional but recommended) Get the native iOS app built

The Vercel URL alone gets you Mock mode and Bridge mode. To unlock **Direct
BLE** — phone talks to GoPros, nothing attached — build the native app:

```bash
npm install -g eas-cli
eas login                  # use your Expo account (free)
eas build:configure
npm run build:ios          # ~10–20 min in EAS cloud, no Mac required
```

EAS emails you an install link. The full walk-through (including iOS
permission prompts, pairing each camera, smoke-testing all three) is in
`TESTING.md` Stage 1.

You can do this in parallel with Vercel — they're independent.

---

## Pushing updates

Every time you `git push` to the branch that Vercel is tracking, Vercel
auto-deploys a new build. The first build of a PR / non-default branch is
served as a **Preview** at a unique URL (great for review); merging to the
production branch updates the main URL.

To roll back, in Vercel UI: **Deployments → … → Promote to Production** on
any earlier green build.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails with "Module not found: expo" | Make sure **Install Command** is `npm install` (not `npm ci --omit=dev`); dev deps are needed for the Expo CLI. |
| Build succeeds, page is blank | Check **Output Directory** is exactly `dist`. The `vercel.json` should override this; if you've removed `vercel.json`, set it manually. |
| Page loads, all routes 404 | The SPA rewrite is in `vercel.json` (`/(.*)` → `/index.html`). Don't remove that block. |
| Direct BLE option is missing | Expected — the web build cannot do BLE. Use the EAS-built native app for BLE. |
| Settings → Bridge connection test fails on the deployed URL | Bridge URL must be reachable from the phone. Use Cloudflare Tunnel (`cloudflared tunnel --url http://localhost:4000`) and paste the `https://…trycloudflare.com` URL into Settings. |

---

## What's actually live after step 3

- **iPhone Safari users** on your Vercel URL get a working Mock-mode demo and
  can experiment with the UI.
- **Anyone with the Mac bridge running** can paste the bridge URL in
  Settings → Local LAN and drive real cameras through the bridge.
- **Direct BLE** unlocks once you do step 5 and install the native app on the
  phone.

That's it — you're live.
