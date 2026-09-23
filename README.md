# Pryvis

Estimating & invoicing for Jamaican contractors — build itemized construction
quotes, price against real Jamaican suppliers, and send branded PDFs over
WhatsApp or email. Android + Web, JMD-native, GCT-aware.

## Repository layout

Reorganised on 2026-09-23 (ADR 0010). Two applications, each its own npm-workspace root:

| Path | What |
|---|---|
| `original-app/` | **The existing application, read-only.** Its own workspace root. See [`original-app/README.md`](original-app/README.md) |
| `new-app/` | **The rebuild.** Empty until Phase 1 approves its structure. See [`new-app/README.md`](new-app/README.md) |
| `docs/` | The rules, the ADR log, the development brief, the Phase 0 audit, the tier design, the module register |

Inside `original-app/`: `apps/api` (NestJS + Prisma, all business logic), `apps/web` (Next.js
web app plus the internal admin portal), `apps/mobile` (Expo / React Native),
`packages/core` (shared types, tax/GCT and quote math, framework-free), `packages/ui`
(design tokens), `packages/test-ast` (the parser every guard test uses).

**Start here:** [`docs/RULES.md`](docs/RULES.md) - read before any task (Rule 0) -
then [`docs/PHASE-0-AUDIT.md`](docs/PHASE-0-AUDIT.md) and [`docs/adr/`](docs/adr/README.md).

Commands run from `original-app/`, not from here.

## Prerequisites

- Node ≥ 20 (this machine: v24), npm ≥ 10
- PostgreSQL 14+ (local or Docker)
- For mobile preview: the **Expo Go** app on your Android phone

## Getting started

```bash
cd original-app
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
