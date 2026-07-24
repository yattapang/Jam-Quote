# JamQuote — Deploy from scratch

The code lives on GitHub (`yattapang/Jam-Quote`, branch `main`). This sets up
hosting from nothing. Recommended stack (all have free tiers):

- **Neon** — PostgreSQL database
- **Render** — the NestJS API (provisioned from `render.yaml`)
- **Vercel** — the Next.js web app

The dashboard/account/credential steps are yours (I can't create accounts or
enter secrets). Everything below is exact.

---

## 1. Database — Neon

1. Create a Neon account → **New Project** (name it `jamquote`, region near JM
   e.g. US East).
2. Copy the **pooled** connection string (Dashboard → Connection Details →
   "Pooled connection"). It looks like
   `postgresql://USER:PASSWORD@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`.
   Keep it — this is `DATABASE_URL`.

## 2. API — Render (from the blueprint)

1. Render → **New +** → **Blueprint** → connect the GitHub repo
   `yattapang/Jam-Quote`. Render reads `render.yaml` and creates the
   `jamquote-api` web service.
2. Set these environment variables on the service (Dashboard → Environment):
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Neon pooled string from step 1 |
   | `JWT_SECRET` | a long random string (e.g. `openssl rand -base64 48`) — **required, the API won't boot without it** |
   | `WEB_ORIGIN` | your web URL from step 3 (set after Vercel; e.g. `https://jamquote.vercel.app`) |
   *(WiPay / SMTP / S3 keys from `apps/api/.env.example` are optional — those
   features degrade gracefully without them.)*
3. Deploy. The blueprint's `preDeployCommand` runs `prisma migrate deploy`
   automatically, so the Neon schema is created on first deploy.
4. Health check: `https://<your-api>.onrender.com/api/health` should return ok.
5. **Seed demo data (optional, once):** from a local checkout with `DATABASE_URL`
   pointed at Neon, run `npm run -w @jamquote/api db:seed`. Creates the demo
   tenant + login `owner@blackwood.jm` / `Blackwood123!`. Skip for a clean prod.

## 3. Web — Vercel

1. Vercel → **New Project** → import `yattapang/Jam-Quote`.
2. **Root Directory:** `apps/web`. Framework preset: Next.js (auto).
3. Environment variables:
   | Key | Value |
   |---|---|
   | `API_BASE_URL` | `https://<your-api>.onrender.com/api` (server-side; used by the proxy + reads) |
   | `NEXT_PUBLIC_API_BASE_URL` | same value (build-time fallback) |
4. Deploy. Then copy the Vercel URL back into Render's `WEB_ORIGIN` (step 2) and
   redeploy the API.

## 4. Verify

- Visit the Vercel URL → **/login** → sign in with the seeded owner (if seeded).
- The browser talks only to the same-origin `/api/proxy`; the JWT rides in an
  httpOnly cookie. Signed out, the app shows the demo business.

## 5. Mobile (later)

The Expo app points at the API via `EXPO_PUBLIC_API_BASE_URL` (see
`apps/mobile/src/state/apiClient.ts`). A real APK comes from **EAS Build**
(`npx eas build -p android`); for now Expo Go + `npm run -w @jamquote/mobile dev`
previews on a phone.

---

## Run locally first (recommended before cloud)

```bash
npm install
# Postgres: either local (Docker) or point DATABASE_URL at Neon
cp apps/api/.env.example apps/api/.env      # fill DATABASE_URL + JWT_SECRET
npm run -w @jamquote/api prisma:migrate     # create schema
npm run -w @jamquote/api db:seed            # demo data + login
npm run -w @jamquote/api dev                # http://localhost:3001/api/health
npm run -w @jamquote/web dev                # http://localhost:3000
```
