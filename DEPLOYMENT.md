# Deployment runbook

Target topology (all free tiers):

- **Web** → Vercel (Next.js, `apps/web`)
- **API** → Render (NestJS, `apps/api`, via `render.yaml`)
- **Database** → Neon Postgres (already provisioned — the connection string
  lives in `apps/api/.env`, which is gitignored and never committed)
- **Mobile** → EAS Build (Android APK, `apps/mobile`)

Follow the steps in order. Steps marked **manual — needs your account** require
you to act in a dashboard/CLI under your own GitHub/Vercel/Render/Expo
credentials; nothing here can or should do those for you.

---

## 0) Prerequisites

- A GitHub account with this repo pushed to it (see step 1).
- A Neon Postgres project (you said this is already provisioned).
- Accounts on [Vercel](https://vercel.com), [Render](https://render.com), and
  [Expo](https://expo.dev) (all have free tiers).
- Locally: Node ≥ 20, `npm`, and (for mobile builds) `npx eas-cli`.

---

## 1) Push the repo to GitHub — **manual, needs your account**

Render and Vercel both deploy from a GitHub repo.

```bash
# from the repo root, if it isn't already on GitHub
git remote add origin https://github.com/<you>/jamquote.git
git push -u origin main
```

---

## 2) Neon: connection string + migrate + seed

**2a. Get the connection string — manual, needs your account.** In the Neon
console, open your project → **Connection Details** → copy the pooled
connection string (`postgresql://<user>:<password>@<host>/<db>?sslmode=require`).
Put it in `apps/api/.env` as `DATABASE_URL` for local use, and keep a copy —
you'll paste it into Render in step 3.

**2b. Apply migrations against Neon** (run once, from your machine, with
`DATABASE_URL` in `apps/api/.env` pointed at Neon):

```bash
npm install
npm run -w @jamquote/api prisma:generate
# Production-safe migration apply (does not create new migrations, just
# applies the ones already committed under apps/api/prisma/migrations):
npx -w @jamquote/api prisma migrate deploy
```

**2c. Seed reference/demo data:**

```bash
npm run -w @jamquote/api db:seed
```

This seeds the business the app expects by default
(`NEXT_PUBLIC_BUSINESS_ID=seed-business-blackwood`, matching
`apps/web/lib/api-client.ts`).

---

## 3) Deploy the API to Render — **manual, needs your account**

The repo root has `render.yaml`, a Render Blueprint. In the Render dashboard:

1. **New +** → **Blueprint** → connect your GitHub account/repo (JamQuote) →
   Render reads `render.yaml` and proposes a `jamquote-api` web service.
2. Before the first deploy, set the env vars it left blank
   (`sync: false` in the blueprint means "set this yourself, don't commit it"):
   - `DATABASE_URL` = the Neon connection string from step 2a
   - `WEB_ORIGIN` = leave blank for now (or set to `*`-equivalent by leaving
     unset) — you'll set it to the real Vercel URL in step 5
   - `NODE_ENV` is already set to `production` by the blueprint
3. Deploy. Render runs:
   `npm ci && npm run -w @jamquote/api prisma:generate && npx turbo run build --filter=@jamquote/api`
   then starts `node apps/api/dist/main.js`, listening on Render's assigned
   `PORT`. It health-checks `GET /api/health`.
4. Once live, note the service URL, e.g. `https://jamquote-api.onrender.com`.
   The API base is `https://jamquote-api.onrender.com/api`.

**Alternative — Docker.** If you'd rather deploy as a container (Render
"Web Service" from a Dockerfile, or any other container host), use
`apps/api/Dockerfile` instead of the Node runtime path above:

```bash
docker build -f apps/api/Dockerfile -t jamquote-api .
docker run -p 3001:3001 --env-file apps/api/.env jamquote-api
```

Pick **one** of render.yaml (Node runtime) or Dockerfile — both build the same
app, render.yaml is the simpler/default path on Render itself.

---

## 4) Deploy the Web app to Vercel — **manual, needs your account**

No `vercel.json` is needed — this is a standard npm-workspaces monorepo and
Vercel's Next.js framework preset handles it once you set the Root Directory.

1. **New Project** → import the same GitHub repo.
2. Project settings:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command** / **Install Command**: leave as framework defaults
     (Vercel runs the root `npm install` for the workspace automatically, then
     `next build` inside `apps/web`).
3. Environment variables (Project Settings → Environment Variables):
   - `NEXT_PUBLIC_API_BASE_URL` = `https://jamquote-api.onrender.com/api`
     (the Render URL from step 3, with `/api` appended)
   - `NEXT_PUBLIC_BUSINESS_ID` = `seed-business-blackwood`
4. Deploy. Note the resulting URL, e.g. `https://jamquote.vercel.app`.

The web build consumes `@jamquote/core` from TypeScript source via tsconfig
paths, so Vercel does **not** need `packages/core` prebuilt — no extra step
needed there.

---

## 5) Lock down CORS — **manual, needs your account**

Now that you have the real Vercel URL, go back to the Render service (step 3)
and set:

- `WEB_ORIGIN` = `https://jamquote.vercel.app` (comma-separate multiple
  origins if you have a preview + production URL, e.g.
  `https://jamquote.vercel.app,https://jamquote-git-main-you.vercel.app`)

Then **redeploy** the Render service (Manual Deploy → Deploy latest commit, or
it redeploys automatically if you just pushed). `apps/api/src/main.ts` reads
`WEB_ORIGIN` at boot: unset → CORS allows all origins (dev default); set → CORS
is restricted to that allow-list.

---

## 6) Build the Android APK via EAS — **manual, needs your account**

```bash
cd apps/mobile
npx eas-cli login          # your Expo account
npx eas-cli build:configure  # first time only, links this project to an EAS project
```

Before building, edit `apps/mobile/eas.json` and replace the placeholder
`EXPO_PUBLIC_API_BASE_URL` in the `preview` (and/or `production`) profile with
your real Render URL — EAS bakes `EXPO_PUBLIC_*` vars in at build time, so this
must be the actual deployed API:

```json
"env": {
  "EXPO_PUBLIC_API_BASE_URL": "https://jamquote-api.onrender.com/api"
}
```

Then build:

```bash
npx eas-cli build -p android --profile preview
```

This produces an installable `.apk` (internal distribution — no Play Store
needed). When the build finishes, EAS prints a download link/QR code; download
the APK to a device and install it (enable "install unknown apps" for the
browser/file manager you use). Use the `production` profile
(`android.buildType: app-bundle`) later if/when you submit to Google Play.

---

## Reference — env vars at a glance

| Where | Var | Example |
|---|---|---|
| Render (API) | `DATABASE_URL` | `postgresql://user:pass@ep-xxx.neon.tech/jamquote?sslmode=require` |
| Render (API) | `WEB_ORIGIN` | `https://jamquote.vercel.app` |
| Render (API) | `NODE_ENV` | `production` |
| Vercel (Web) | `NEXT_PUBLIC_API_BASE_URL` | `https://jamquote-api.onrender.com/api` |
| Vercel (Web) | `NEXT_PUBLIC_BUSINESS_ID` | `seed-business-blackwood` |
| EAS (Mobile) | `EXPO_PUBLIC_API_BASE_URL` | `https://jamquote-api.onrender.com/api` |

## Files added for this runbook

- `apps/api/src/main.ts` — CORS now reads `WEB_ORIGIN` (comma-separated
  allow-list) instead of allowing all origins unconditionally.
- `render.yaml` — Render Blueprint for the API (Node runtime path).
- `apps/api/Dockerfile`, `apps/api/.dockerignore` — container alternative.
- `apps/mobile/eas.json` — `preview` (APK) and `production` (AAB) build
  profiles.
- `DEPLOYMENT.md` — this file.
