# JamQuote — Deploy from scratch

The code lives on GitHub (`yattapang/Jam-Quote`, branch `main`). This sets up
hosting from nothing. Recommended stack (all have free tiers):

- **Neon** — PostgreSQL database
- **Render** — the NestJS API (provisioned from `render.yaml`)
- **Vercel** — the Next.js web app

The dashboard/account/credential steps are yours (I can't create accounts or
enter secrets). Everything below is exact.

---

## 1. Database — Neon, provisioned THROUGH VERCEL

**This project's database was created via Vercel's Postgres integration, which
is Neon underneath.** That matters for finding it: it lives in the Vercel
account, NOT in a standalone Neon account. Signing in to neon.tech directly
shows an empty project list, which looks exactly like the database having
vanished. It has not.

To reach it: **Vercel → your project → Storage → the Postgres store.** From
there, "Open in Neon" reaches the Neon console (SQL editor, monitoring) when
you need it.

The store's settings expose both connection strings, and the distinction is
load-bearing:

| Variable | Host | Use |
|---|---|---|
| pooled (`POSTGRES_URL` / `DATABASE_URL`) | `ep-xxx-pooler...` | The app. Set as `DATABASE_URL` on Render. |
| unpooled (`POSTGRES_URL_NON_POOLING` / `DATABASE_URL_UNPOOLED`) | `ep-xxx...` (no `-pooler`) | **Migrations.** See below. |

### Migrations must not run through the pooler

`prisma migrate deploy` takes a SESSION-level advisory lock. Through pgbouncer
the connection is returned to the pool and reused for ordinary queries, so the
lock is never released — a new stranded lock on every boot, each one blocking
the next migration with `P1002: Timed out trying to acquire a postgres advisory
lock`.

That is an outage, not a slow deploy: `startCommand` is
`migrate deploy && node main.js`, so a timed-out migration means the API never
starts. On Render's free tier the service spins down and re-runs that command
on every cold start, so it does not take a deploy to trigger.

Two fixes, in order of preference:

1. **Give migrations a direct connection.** Set `DIRECT_URL` on Render to the
   UNPOOLED string, then add to `apps/api/prisma/schema.prisma`:

   ```prisma
   datasource db {
     provider  = "postgresql"
     url       = env("DATABASE_URL")
     directUrl = env("DIRECT_URL")
   }
   ```

   Set the env var FIRST: an unset `DIRECT_URL` fails Prisma schema validation
   and breaks the deploy outright.

2. **Disable the lock** (currently in effect, see `render.yaml`):
   `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`. Safe only because this service runs
   a single instance, so there is no concurrent migration for the lock to
   guard. Drop it once option 1 is in place.

To clear a lock that is already stranded, either restart the compute endpoint
from the Neon console, or run there:

    SELECT pg_terminate_backend(l.pid)
    FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
    WHERE l.locktype = 'advisory' AND a.state = 'idle';

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
