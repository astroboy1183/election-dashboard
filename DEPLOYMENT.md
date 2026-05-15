# Deployment Guide

This project deploys to **Vercel** (frontend) + **Render** (backend FastAPI with persistent SQLite). CI runs on GitHub Actions on every push and PR. Scheduled ECI/MyNeta scrapers run weekly via GitHub Actions and auto-commit the refreshed DB back to `main`.

## Architecture
```
GitHub repo (main)
   │
   │ push                push
   ▼                        ▼
Vercel ◄───── API ─── Render
(frontend)  CORS allow (FastAPI + SQLite on disk)
```

The SQLite DB (`data/election.db`, ~1.4 MB) is committed to the repo. Every push to `main` redeploys both services. The scheduled scrape workflow re-runs the ECI ingest and commits the refreshed DB, which triggers a new Render deploy.

## One-time setup

### 1. Create the GitHub repo

```bash
# From the project root (already done locally if you ran `git init`).
git init -b main
git add .
git commit -m "Initial commit"
gh repo create election-dashboard --public --source=. --remote=origin --push
# Or manually: create a repo on github.com, then:
#   git remote add origin git@github.com:<you>/election-dashboard.git
#   git push -u origin main
```

CI will start running automatically once the repo is on GitHub.

### 2. Deploy the backend to Render

1. Sign in at [render.com](https://render.com) with GitHub.
2. Click **New +** → **Blueprint**.
3. Connect this repo. Render reads [render.yaml](render.yaml) and proposes the service.
4. Click **Apply**.
5. After the first deploy, go to **Environment** and set:
   - `CORS_ORIGINS`: set later (we don't know Vercel's URL yet). Leave blank for now — `localhost:5173` will work as the default for testing.
   - `ANTHROPIC_API_KEY` *(optional)*: only if you want the `/api/ai/ask` endpoint to work.
6. Copy the public URL Render gives you (e.g. `https://election-dashboard-api.onrender.com`). You'll paste it into Vercel next.

### 3. Deploy the frontend to Vercel

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. Click **Add New** → **Project**, import this repo.
3. **Root Directory**: `frontend`
4. **Framework Preset**: Vercel will auto-detect Vite. (If not, set it manually.)
5. Under **Environment Variables**, add:
   - `VITE_API_URL` = `https://election-dashboard-api.onrender.com` *(your Render URL from step 2.6)*
6. Click **Deploy**.
7. Once deployed, copy the Vercel URL (e.g. `https://election-dashboard.vercel.app`).

### 4. Tell the backend about the frontend (CORS)

1. Back in Render → your service → **Environment**:
2. Set `CORS_ORIGINS` to the Vercel URL: `https://election-dashboard.vercel.app`
   - Comma-separate if you want to allow preview deploys: `https://election-dashboard.vercel.app,https://election-dashboard-git-*.vercel.app`
3. Render will redeploy automatically.

### 5. Verify

- Visit `https://election-dashboard.vercel.app` — should load the dashboard.
- Open DevTools → Network → confirm API calls go to your Render URL.
- Visit `https://election-dashboard-api.onrender.com/api/states` — should return JSON for all 5 states.

## CI workflows

### `.github/workflows/ci.yml` — runs on every PR + push to main

| Job | What it does |
|---|---|
| `frontend` | `npm ci` → ESLint → `tsc --noEmit` → `vite build` |
| `backend` | `pip install` → import-check every module → boot `uvicorn` → curl `/api/states` |

If CI fails, the PR is blocked; if it passes on `main`, Render + Vercel auto-deploy.

### `.github/workflows/scrape.yml` — runs Sundays at 06:00 UTC (11:30 IST)

1. Snapshots row-counts on every DB table.
2. Runs `scripts/probe_eci.py` to detect ECI changes.
3. If `data/.eci_hashes.json` changed, runs `python -m backend.seed` (full re-seed).
4. Commits `data/election.db` + `data/.eci_hashes.json` back to `main` with a diff summary in the commit message.
5. Push triggers Render redeploy → users see fresh data.

You can also trigger it manually from GitHub → Actions → "Scheduled ECI scrape" → **Run workflow**.

## Operational notes

### Render free tier cold-starts
The free plan spins the FastAPI service down after 15 min idle. First request after that takes ~30 s. To kill this, upgrade to the $7/mo Starter plan, or hit `/api/states` with an uptime monitor every 10 minutes.

### SQLite on Render
The DB is read directly from the committed repo file, **not** from a persistent disk. Every deploy = fresh DB from `main`. This is intentional: it keeps the data flow auditable through git history (one commit per scrape) and avoids per-instance state divergence.

If you scale to multiple instances later, you'll need to move to managed Postgres — but for one instance reading mostly-static election results, this is fine.

### Local DB backups
`.gitignore` already excludes `data/election.db.backup-*` and `data/election.db.sandbox-*` so your local safety copies never accidentally land in the repo.

### Secrets policy
The only secret used in production is `ANTHROPIC_API_KEY` (optional). Never commit `.env`, `*.env`, or any file containing keys — the `.gitignore` covers the common patterns. If you ever paste a secret into a PR by mistake, **rotate it immediately**.

## Rollback

```bash
# Roll back one commit on main → Render + Vercel auto-deploy the previous version.
git revert HEAD
git push

# Or restore a specific DB snapshot from history:
git checkout <commit-sha> -- data/election.db
git commit -m "Revert DB to <commit-sha>"
git push
```
