# JamQuote — Build Sequence (vertical slices)

> Decision (2026-07-24): build **step by step as vertical slices**. Each milestone is one
> capability working end-to-end across `core → api → web → mobile → sync`, proven green
> before the next begins. This plan is **rebased on an audit of the real deployed repo**
> (github.com/yattapang/Jam-Quote, live on Render + Neon) — it is NOT a greenfield build.

## Current state (audited 2026-07-24)

- **Web app:** substantially complete for Phase 1 — live dashboard, clients & jobs CRUD,
  quote editor (draft edit / sections / headings / validity / Send / Revise), PDF download,
  WhatsApp click-to-chat, email via Resend, editable settings, materials catalog, admin
  Staff Console. Online-first with a demo-data fallback.
- **API:** modules `auth` (new, email+password+JWT, ~complete, not yet adopted by clients),
  `business, clients, jobs, quotes, catalogs, payments (WiPay), admin`. Deployed via
  render.yaml. Tenancy still via `x-business-id` header.
- **Mobile:** Expo Router screens; `apiClient` does GET lists + DELETE only against one seed
  business; quote editing is local/in-memory; no local DB, no write path, not using auth.
- **Shared:** `packages/core` (money/GCT/quote math, tested), `packages/ui` (tokens).
- **Not built yet:** `sync`, `invoicing`, `pricing/scraper`, `messaging`-as-API,
  `regulatory`, `reports`; mobile offline-first; `updatedAt` on child tables (see SYNC.md).

## M1 — Finish auth + adopt JWT everywhere  ← next
- Complete the in-flight `apps/api/src/auth` (email+password, JWT, guard, middleware, tests).
- Replace `x-business-id` with JWT-derived `businessId` across all API modules.
- Adopt the token in `apps/web/lib/api-client.ts` and `apps/mobile/src/state/apiClient.ts`;
  add login/register on web + mobile. Prerequisite for per-user sync.

## M2 — Sync foundation (API + schema)
- Apply SYNC.md schema deltas: add `updatedAt` to QuoteLineItem, QuoteSection, Supplier,
  LabourRate, MaterialFavourite, EquipmentItem, Payment; migrate.
- Accept client-supplied UUID v7 `id` on create across modules (offline-safe).
- Build `apps/api/src/sync` — `POST /sync/pull` + `POST /sync/push`, tenant-scoped,
  idempotent, server recomputes totals via core. Prove on clients/jobs first.

## M3 — Mobile offline-first
- Local replica: `expo-sqlite` + Drizzle; outbox of unsynced mutations.
- Sync engine: pull/push on app-open, foreground, reconnect, pull-to-refresh.
- Give mobile a real write path (create/update, not just read/delete).
- Acceptance: create a client offline on Android → reconnect → it appears on web.

## M4 — Offline quote editor (the hard sync case)
- Wire mobile quote-editor + add-material to real persistence + sync.
- Line-item-level merge (per SYNC.md); server recomputes subtotal/gct/total via core.

## M5 — Invoicing + payments on mobile
- Add `invoicing` module; convert quote → invoice; record-payment; wire the existing WiPay
  module + webhook; wire mobile invoice-detail.

## M6 — Pricing / catalogs
- H&L True Value scraper (see PRICING.md); material favourites, labour rate book, equipment,
  supplier directory; lookup + scan-to-price on add-material.

## M7 — Messaging-as-API, regulatory, reports, subscription
- Consolidate WhatsApp/email into an API `messaging` module; regulatory feed + detail;
  reports dashboard; subscription.

## Definition of done (every milestone)
core tests green · api typecheck + module tests · web + mobile typecheck · a real
click-through on both surfaces · sync round-trip verified where the slice touches synced data.
