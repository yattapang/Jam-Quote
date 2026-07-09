# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

JamQuote — estimating & invoicing for **Jamaican contractors**. Build itemized
construction quotes, price against real Jamaican suppliers, send branded PDFs
over WhatsApp/email. Android + Web, JMD-native, GCT-aware.

Turborepo + npm workspaces, all TypeScript, Node ≥ 20. `docs/ARCHITECTURE.md`
is the build contract — when code and that doc disagree, fix the code or raise
it, don't silently diverge. `docs/PRICING.md` is the supplier-scraper spec.

## Commands

Run from the repo root. Turbo fans tasks out across workspaces; target one with
`-w <name>` (workspace names are `@jamquote/{api,web,mobile,core,ui}`).

```bash
npm install                         # install all workspaces

npm run build                       # turbo build (respects ^build deps)
npm run typecheck                   # tsc --noEmit across all
npm run lint
npm run test

# packages/core — the money/tax logic; verify this first, it's load-bearing
npm run -w @jamquote/core test
npx -w @jamquote/core vitest run src/quote/totals.test.ts   # single test file
npx -w @jamquote/core vitest run -t "discount"              # single test by name

# apps/api (NestJS + Prisma)
cp apps/api/.env.example apps/api/.env      # then set DATABASE_URL etc.
npm run -w @jamquote/api prisma:generate    # REQUIRED before typecheck/build
npm run -w @jamquote/api prisma:migrate     # apply/create migrations (dev)
npm run -w @jamquote/api db:seed
npm run -w @jamquote/api dev                # http://localhost:3001/api/health
npm run -w @jamquote/api test               # vitest

# apps/web (Next.js, port 3000)
npm run -w @jamquote/web dev

# apps/mobile (Expo) — preview on a phone via Expo Go (scan the QR)
npm run -w @jamquote/mobile dev
```

Requires PostgreSQL 14+. `prisma generate` must run before anything typechecks
`apps/api`, because `@prisma/client` types don't exist until then.

## Architecture

Three surfaces (`apps/api`, `apps/web`, `apps/mobile`) over two shared packages.

**The golden rule:** all money math — quote/invoice totals, GCT, discounts,
markups — lives in `packages/core` and is imported by api, web, and mobile. It
is **never** re-implemented per surface. `computeTotals` in
[totals.ts](packages/core/src/quote/totals.ts) is the single source of truth;
every CRUD path and every UI preview must route through it.

- **`packages/core`** — framework-free TS: domain enums, Zod validators, and
  the tax/money/totals logic. Enums in [enums.ts](packages/core/src/types/enums.ts)
  mirror the Prisma schema **exactly** — change one, change both.
- **`packages/ui`** — design tokens (palette, type) derived from
  `extracted/JamQuote.dc.html`.
- **`apps/api`** — NestJS owns all business logic. Per-feature modules
  (`business`, `clients`, `jobs`, `quotes`, `catalogs`, `payments`, …), Prisma
  for persistence, Zod for request validation.
- **`apps/web`** — Next.js App Router; also hosts the internal `/admin` portal.
- **`apps/mobile`** — Expo Router (file-based routing under `app/`).

### Money is always integer JMD cents

Never do money math with plain floats in app code. Store and compute in integer
cents; format for display only via `formatJmd` in
[money.ts](packages/core/src/tax/money.ts). Rounding is half-up at the cent, done
inside core. Prisma money fields are `Int` cents (e.g. `unitPriceCents`,
`totalCents`); rates/percentages are `Decimal`. USD is display-only reference,
never used for billing.

### GCT (General Consumption Tax)

Rate is per-business (`Business.defaultGctRate`, default 15%) and centrally
overridable — never hardcode it in a component; read it from business settings.
Each line carries a `gctTreatment` of `STANDARD | ZERO_RATED | EXEMPT`. GCT
applies **only** to the post-discount share of `STANDARD` lines. TRN (9-digit
taxpayer number) prints on every quote & invoice. Clients/jobs use the 14
Jamaican parishes (`PARISHES` in core).

### QuoteLineItem is the load-bearing entity

Every line — material, labour, equipment, rental, subcontractor — shares one
shape (`category`, `rateUnit`, `quantity`, `unitPriceCents`, `priceSource`,
`gctTreatment`, optional `markupPct`, `overrideNote`). Manual entry/override is
**always** available and never blocked by a failed price lookup; an override of
a `LOOKUP`/`SCAN` price requires an `overrideNote`. Quotes have a status
lifecycle with enforced forward-only transitions (see `ALLOWED_TRANSITIONS` in
[quotes.service.ts](apps/api/src/quotes/quotes.service.ts)); revisions keep the
same `number`, bump `version`, and link via `parentQuoteId`.

### Multi-tenancy (temporary auth stand-in)

Every request is scoped to a `businessId`. Today that comes from an
`x-business-id` request header via the `@BusinessId()` param decorator
([business-id.decorator.ts](apps/api/src/common/business-id.decorator.ts)) —
this is an explicit placeholder until JWT auth lands. Every service query
filters by `businessId`; keep that pattern when adding endpoints.

### Payments — WiPay, not Stripe

Card payments use **WiPay hosted checkout** so raw card data never touches our
servers ([wipay.service.ts](apps/api/src/payments/wipay.service.ts)). Callbacks
must be hash-verified before an invoice is marked paid. Manual payments (cash,
bank transfer, Lynk) are recorded directly. Confirm exact WiPay field names /
hash recipe against current WiPay JM docs before going live.

## Conventions & gotchas

- **ESM `.js` import specifiers.** `apps/api` and `packages/core` are ESM;
  relative imports use explicit `.js` extensions even for `.ts` source
  (`import { computeTotals } from "@jamquote/core"`, `"./money.js"`). Match this
  or module resolution breaks.
- **Feature modules aren't all wired yet.** Several `apps/api` feature modules
  exist on disk but [app.module.ts](apps/api/src/app.module.ts) still lists them
  as TODOs rather than importing them. When finishing an endpoint, check it's
  actually registered in `AppModule` (and its module wired) before assuming a
  route is live.
- **Web/mobile currently render mock data.** `apps/web/lib/mock-data.ts` and
  `apps/mobile/src/state/mockData.ts` back the screens; the web
  [api-client.ts](apps/web/lib/api-client.ts) is the single chokepoint for
  swapping mock → real API. Wire screens through it, not raw `fetch`.
- **Expo v57 changed things.** Before writing mobile code, read the versioned
  docs at https://docs.expo.dev/versions/v57.0.0/ (per `apps/mobile/AGENTS.md`).
- **Enums live in two places on purpose.** `packages/core` enums and the Prisma
  schema enums must stay identical.

## Build phasing

- **Phase 1:** quote builder, clients/jobs, branded PDF, email + WhatsApp
  click-to-chat send.
- **Phase 2:** WhatsApp Business Cloud API, supplier price index,
  invoicing/payments, reporting.
- **Phase 3:** camera scan-to-price, regulatory feed, teams, subscriptions.
