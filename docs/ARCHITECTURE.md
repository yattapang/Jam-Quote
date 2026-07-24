# JamQuote — Architecture & Build Spec

> This is the contract every build agent follows. When code and this doc disagree, fix the code or raise it — do not silently diverge.

## 1. Monorepo layout

```
jamquote/
├── apps/
│   ├── api/      NestJS + Prisma backend (owns all business logic)
│   ├── web/      Next.js (React) — client web app + internal Admin portal
│   └── mobile/   Expo / React Native — Android app
├── packages/
│   ├── core/     Shared TS: types + tax/GCT + quote math (NO framework deps)
│   └── ui/       Shared design tokens (palette, type, spacing) from the design file
└── docs/
```

**Golden rule:** money math (quote totals, GCT, discounts, markups) lives in `packages/core` and is imported by api, web, and mobile. It is never re-implemented per surface.

## 2. Tech stack (confirmed)

- **Backend:** NestJS, PostgreSQL, Prisma. REST + Zod validation. JWT auth (email + password; phone login is a later option). Tenancy is migrating from an `x-business-id` header to JWT-derived `businessId`.
- **Web:** Next.js App Router, React, TypeScript. Also hosts `/admin`.
- **Mobile:** Expo (React Native). Expo Go for live phone preview; EAS Build for APK.
- **Payments:** WiPay hosted checkout + signed webhook. Manual payments: cash / bank / Lynk.
- **PDF:** server-side HTML→PDF (Puppeteer) so web + mobile produce identical documents.
- **Messaging Phase 1:** WhatsApp click-to-chat share link + email (SMTP/OAuth). Phase 2: WhatsApp Business Cloud API.

## 3. Domain rules (Jamaica)

- **Currency:** JMD is the system currency. Store money as integer **cents** (`amountCents`), never floats. USD is display-only reference.
- **GCT:** General Consumption Tax. Current standard rate is configurable per-business and centrally overridable (see RegulatoryUpdate). Line items carry a `gctTreatment`: `STANDARD | ZERO_RATED | EXEMPT`. Never hardcode the rate in a component — read it from business settings / core.
- **TRN:** Taxpayer Registration Number, 9 digits, printed on every quote & invoice.
- **Parishes:** clients/jobs use Jamaican parishes.

### 3.1 Jurisdiction rule-pack seam (Caribbean expansion)

Jamaica is the first jurisdiction, not the only one. Every country-specific value —
currency, consumption-tax label/rate (JM `GCT` 15%; elsewhere `VAT` at 12.5–17.5%),
taxpayer-ID format, administrative regions, in-country payment rails (Lynk, GK One),
and payroll statutory contributions (NIS/NHT/Education Tax/HEART) — is resolved
through `getJurisdiction(countryCode)` in `packages/core`, keyed off
`Business.countryCode`/`currency`/`entityType`. **Nothing below this seam hardcodes a
jurisdiction value.** Today the table holds Jamaica only; the Phase 0 versioned,
human-verified, TAJ/Gazette-sourced rule-pack engine (with a regulatory-monitoring
feed) replaces the static table behind the identical interface — that verified-per-
country depth is the credibility differentiator versus a generic multi-country
template. Rates carry `verified`/`asOf`/`source` provenance. Money display is
currency-parameterised (`formatMoney`); sync-relevant tables carry `deletedAt` for the
offline-first layer.

## 4. The load-bearing entity: QuoteLineItem

Every line, regardless of type, shares one shape:

| Field | Meaning |
|---|---|
| `category` | `MATERIAL \| LABOUR \| EQUIPMENT \| RENTAL \| SUBCONTRACTOR \| OTHER` |
| `rateUnit` | `HOUR \| DAY \| WEEK \| MONTH \| JOB \| UNIT` — labour & rentals can be any cadence |
| `quantity` | decimal (hours, days, boxes, lengths…) |
| `unitPriceCents` | integer JMD cents |
| `priceSource` | `MANUAL \| LOOKUP \| SCAN` (+ optional `supplierId`) |
| `gctTreatment` | `STANDARD \| ZERO_RATED \| EXEMPT` |
| `markupPct` | optional per-line margin |
| `overrideNote` | required when a LOOKUP/SCAN price is manually replaced |

Manual entry / override is **always** available and never blocked by a failed lookup.

## 5. Quote totals algorithm (implemented in `packages/core`)

For each line: `base = round(quantity * unitPriceCents)`, `withMarkup = round(base * (1 + markupPct/100))`.
Subtotal = Σ withMarkup. Apply quote-level discount. GCT computed only on STANDARD lines' post-discount share. Deposit is informational. All rounding at cents, half-up.

## 5a. Offline-first sync (confirmed)

The Android app must be **fully usable offline** and sync on reconnect. Mobile holds a local
`expo-sqlite` replica with an outbox; the server is authoritative for money totals (always
recomputed via `@jamquote/core`) and the sync cursor. IDs are client-generated UUID v7.
Conflict handling is record-level LWW by server `updatedAt`, refined so **quotes merge at the
line-item level** and totals are never trusted from a client. Concurrency target is "small
team, rarely collide" — safe under occasional concurrent edits, no live collaboration in v1.
Full design and required schema deltas: **`docs/SYNC.md`**. Build order: **`docs/MILESTONES.md`**.

## 6. Modules (apps/api)

`auth`, `business`, `clients`, `jobs`, `quotes`, `catalogs` (labour rate book / material favourites / equipment / suppliers), `pricing` (scraper index + scan ingest), `invoicing`, `payments` (WiPay), `documents` (PDF), `messaging` (whatsapp/email), `regulatory`, `reports`, `sync`.

## 7. Pricing / scraper module

Jamaican suppliers that publish online prices (e.g. **H&L True Value**) are scraped on a schedule into `MaterialPriceEntry` rows with `source`, `sourceUrl`, `fetchedAt`. UI always shows source + freshness. Contractor corrections and camera scan-to-price also write entries. See `docs/PRICING.md`.

## 8. Design system

Tokens come from `extracted/JamQuote.dc.html` and are codified in `packages/ui`.
- Fonts: **Archivo** (headings/numerals), **Public Sans** (UI/body).
- Accent (worksite gold): `#9C6E1B` light / `#E0AA48` dark — primary actions & money-positive states only.
- Status colors (good/warn/critical/info) are separate from the accent.
- 33 screens; both light & dark themes are first-class.

## 9. Screen inventory (33)

splash, onboarding, auth, business-profile, dashboard, quotes-list, clients-list, jobs-list, quote-editor, add-material, scan-material, add-labour, add-equipment, totals-terms, quote-pdf, send-screen, status-tracker, revision-history, client-detail, job-detail, invoices-list, invoice-detail, record-payment, labour-rate-book, material-favourites, equipment-catalog, supplier-directory, regulatory-feed, regulatory-detail, reports-dashboard, settings-profile, settings-connections, settings-subscription. (+ web-only admin.)

## 10. Agent ownership

- **Opus (architect):** this spec, `packages/core`, Prisma schema, WiPay + security, final review.
- **Sonnet A1:** api CRUD modules + tests.
- **Sonnet A2:** web screens. **Sonnet A3:** mobile screens.
- **Haiku:** docs, config, formatting.
