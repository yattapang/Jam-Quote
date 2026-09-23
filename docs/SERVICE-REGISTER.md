# Asset and service register

**What this is.** Every external service, piece of infrastructure and third party this product
depends on: what it does, **why it was chosen**, what data it holds, what it costs, and what we
would do if it disappeared or got too expensive.

In professional practice this is an **asset register** (ITIL keeps a formal version as a CMDB
of configuration items). It absorbs two related artefacts rather than letting them rot in
separate files:

- a **vendor / sub-processor register** — column *Holds personal data*, which is the list a
  Jamaican or Trinidadian tenant is entitled to ask for, and the basis of a Record of
  Processing Activities if one is ever required;
- a pointer to the **SBOM** (Software Bill of Materials) for code dependencies, which is a
  generated artefact and not a hand-maintained list.

**Why it exists.** Rule 10 requires portable technology and a written trigger for moving off
free tiers; Rule 17 requires our weaknesses stated plainly. Neither is answerable without
knowing what we actually run on. Added 2026-09-23 at the owner's request, and now Rule 18.

**How it stays true.** It is updated in the same change that adds, removes or repoints a
service — the same discipline as the module register. A service in production and absent here
is a defect, not a paperwork oversight.

**What it must never contain:** a credential, a connection string, a token or a key. It says
*where* a secret lives, never the secret (Rule 5).

---

## 1. Infrastructure and hosting

| Service | What it does | Why this one | Tier and cost | Holds personal data | If it went away |
|---|---|---|---|---|---|
| **Vercel** | Hosts the Next.js web app; builds on push to `main` | First-class Next.js support, zero-config preview deploys, free tier sufficient for pre-launch. Root Directory points at `original-app/apps/web` (ADR 0010) | Free (Hobby) | In transit only; nothing stored | Any Node host or container runs Next.js. Migration cost is CI configuration, not code (Rule 10) |
| **Render** | Hosts the NestJS API (`jamquote-api`), configured by `render.yaml` (`rootDir: original-app`) | Blueprint-as-code in the repository, free tier, straightforward Docker/Node runtime | Free — **spins down after ~15 min idle**, so a cold start is ~40–90s | In transit; logs must contain none (Rule 5) | Any container host. The Dockerfile and blueprint are portable by design |
| **Neon Postgres** (provisioned through Vercel's Postgres integration) | The database | Standard Postgres, so nothing is provider-proprietary; branching is useful; free tier adequate pre-launch. **It is Neon underneath the Vercel dashboard** — which matters when you go looking for it | Free | **Yes — all tenant and customer data** | It is plain Postgres. `pg_dump`/restore to any provider. This is the single most important portability property we have, and it was a deliberate choice |
| **GitHub** | Source of truth for code; Actions runs the verify gate and the keep-warm ping | Already in use; Actions is free for this volume | Free | No | Any git host; CI would be rewritten |
| **GoDaddy** | Registrar for **pryvis.com** | The owner already holds the domain | Annual registration | Registrant contact details | Transferable to any registrar |

**Free-tier reality, stated honestly.** The Render free tier sleeping is not a nuisance to be
worked around, it is a launch blocker: a contractor tapping a share link and waiting 40 seconds
concludes the product is broken. The keep-warm workflow is a prototype-phase patch, and GitHub
disables scheduled workflows after 60 days of repository inactivity, so it is not a control we
can rely on. **The paid-tier trigger is the first paying tenant**, and it is owed its own ADR
(Rule 10).

## 2. Third-party services in the product

| Service | What it does | Why this one | Cost model | Holds personal data | If it went away |
|---|---|---|---|---|---|
| **Resend** | Transactional email: password reset, quote and invoice delivery, overdue reminders, subscription notices | Simple API, good deliverability, generous free tier | Free tier, then per-message | **Yes — tenant and customer email addresses, and document contents** | Behind the one messaging service after the rebuild (ADR 0012), so a swap is one adapter. Today each caller sends its own mail, so a swap touches several files — a real finding from the Phase 0 audit |
| **WiPay** | Card payment links for Jamaican and Caribbean contractors | One of the few gateways that actually serves JM/TT merchants; local settlement | Per-transaction | Payer name and email; **no card data ever touches us** | No like-for-like local substitute. This is a genuine single point of dependence and is recorded as such |
| **WhatsApp (click-to-chat)** | `wa.me` links the contractor taps to share a quote from their own phone | Costs nothing, needs no verification, and is how Jamaican contractors already work | Free | No — it opens the contractor's own WhatsApp; nothing passes through us | Nothing to replace; it is a URL |
| **Meta WhatsApp Business API** | *Not yet in use.* Server-sent templated quotes and receipts (Business tier) | The only sanctioned way to send WhatsApp programmatically | Per-conversation | Would hold customer phone numbers and message content | **Start the Meta verification early** — the lead time, not the code, is the long pole |
| **Expo / EAS** | Builds and ships the React Native Android app | Already in use; removes the Android toolchain from every developer's machine | Free tier, then per-build | No | Bare React Native builds locally; slower, not blocked |
| **Anthropic Claude API** | Claude-assisted maintenance: proposes pull requests, never touches production (Rule 15) | Already the development method | Pay-as-you-go, with budgets and caps | **Never** — redacted or synthetic data only, which is a hard rule, not a preference | Human development continues; nothing in the product depends on it at runtime |
| **Google Fonts** | Fetched by `next/font` **at build time** | Next.js default | Free | No | Self-host the font files. Worth doing: this is why the CI gate deliberately does not run `next build` — the fetch cannot complete on every network |
| **npm registry** | Every dependency | Standard | Free | No | A registry mirror or vendored dependencies |

## 3. Development and test only

| Thing | What it does | Why it is not in production |
|---|---|---|
| **PGlite** (`@electric-sql/pglite`) | Real Postgres compiled to WebAssembly, in process, so migrations, policies, roles and `current_setting` behave as they do in production | It is the test harness. A mock cannot disagree with a row-level-security policy, which is the whole reason the isolation tests are trustworthy |
| **Turborepo, Vitest, TypeScript, Prisma, ESLint, Prettier** | Build, test, typecheck, migrate, lint, format | Standard toolchain |
| **Docker Compose** (`new-app/infra/`) | Local Postgres for development, so RLS is exercised outside CI | RLS that is only enabled in production is a rule nobody tests |

## 4. Software Bill of Materials

Code dependencies are **not listed here by hand** — a hand-maintained dependency list is wrong
within a week. They belong in a generated **SBOM** (CycloneDX or SPDX) produced from the
lockfile in CI and attached to each build, which is also what makes a vulnerability advisory
answerable: "are we affected?" becomes a query rather than an investigation.

**This does not exist yet.** It sits with the two gaps the Phase 0 audit recorded — no
dependency-vulnerability check and no secret scan in the gate (Rule 17) — and the three should
land together, because an SBOM nobody scans is a file, not a control.

## 5. Where the secrets live

Named here so nobody hunts, and empty of values on purpose.

| Secret | Set in | Notes |
|---|---|---|
| `DATABASE_URL` | Render dashboard (`sync: false` in `render.yaml`) | The pooled Neon URL |
| `DIRECT_URL` | Render dashboard | The **unpooled** Neon host. Required: through the pooler, Prisma's migration advisory lock is recycled onto another connection and never released, which stranded a lock on every boot until the service stopped starting at all |
| `JWT_SECRET` | Render dashboard | The API refuses to boot in production without it, deliberately |
| `RESEND_API_KEY` | Render dashboard | |
| `WIPAY_API_KEY` | Render dashboard | Without it the callback hash is publicly computable, so the API rejects callbacks rather than trusting them |
| `WEB_ORIGIN` | Render dashboard | The Vercel URL |
| Vercel project settings | Vercel dashboard | Including **Root Directory**, which is a dashboard setting and therefore cannot be versioned — the one deploy-critical value not in this repository |

No secret is ever committed, logged, put in a migration, or placed in a fixture (Rule 5). Local
development uses `.env` files, which are git-ignored, from the checked-in `.env.example`.

## 6. What this register says about our exposure

Stated plainly, per Rule 17:

1. **WiPay has no local substitute.** If it withdrew, Jamaican card payments would stop until
   another gateway was integrated. Every other dependency here has a same-week replacement.
2. **Neon holds all tenant and customer data**, and **no restore has ever been tested**. A
   backup nobody has restored is a belief, not a backup (Rule 5).
3. **Two providers can break a deploy from their own dashboards**, outside version control —
   Vercel's Root Directory and every environment variable above.
4. **Free tiers are load-bearing.** The API sleeps, and the mitigation is a scheduled workflow
   that GitHub switches off after 60 idle days.
5. **Personal data leaves Jamaica.** Neon, Resend and Vercel all process tenant and customer
   data outside the country. That is normal and lawful, but it is a fact tenants may ask about,
   and this table is the answer.
