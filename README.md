# JamQuote

Estimating & invoicing for Jamaican contractors — build itemized construction
quotes, price against real Jamaican suppliers, and send branded PDFs over
WhatsApp or email. Android + Web, JMD-native, GCT-aware.

## Monorepo

| Path | What |
|---|---|
| `apps/api` | NestJS + Prisma backend (all business logic) |
| `apps/web` | Next.js web app + internal Admin portal |
| `apps/mobile` | Expo / React Native Android app |
| `packages/core` | Shared types + tax/GCT + quote math (framework-free) |
| `packages/ui` | Design tokens (palette, type) from the design source |
| `docs/` | `ARCHITECTURE.md` (build spec), `PRICING.md` (scraper spec) |

## Prerequisites

- Node ≥ 20 (this machine: v24), npm ≥ 10
- PostgreSQL 14+ (local or Docker)
- For mobile preview: the **Expo Go** app on your Android phone

## Getting started

```bash
npm install                       # install all workspaces
cp apps/api/.env.example apps/api/.env   # then fill in DATABASE_URL etc.

# backend
npm run -w @jamquote/api prisma:generate
npm run -w @jamquote/api prisma:migrate
npm run -w @jamquote/api dev       # http://localhost:3001/api/health

# verify shared logic
npm run -w @jamquote/core test
```

## Preview the mobile app on your phone

```bash
npm run -w @jamquote/mobile dev    # opens Expo; scan the QR with Expo Go
```

The **web app** previews at its dev URL in any browser. A real installable
`.apk` is produced later with EAS Build.

## Payments

Card (debit/credit) payments run through **WiPay** hosted checkout (JMD).
Raw card data never touches our servers. Manual payments (cash, bank, Lynk)
are also recorded. See `apps/api/.env.example` for keys.

## Build phasing

- **Phase 1:** quote builder, clients/jobs, branded PDF, email + WhatsApp *click-to-chat* send.
- **Phase 2:** WhatsApp Business Cloud API, supplier price index, invoicing/payments, reporting.
- **Phase 3:** camera scan-to-price, regulatory feed, teams, subscriptions.

See `docs/ARCHITECTURE.md` for the full spec.
