# Phase 0 audit of the existing application

**Read-only. No code was changed to produce this document.** Rules cited (Rule 0): 1.2 audit
before rebuild, 2 readable code, 3 money and country, 4 tenant isolation, 5 security and
authentication, 6 data integrity, 8 testing, 9 independent review, 13 payment controls, 14
entitlements, 17 state the weaknesses.

Audited: the repository at `C:\dev\JamQuote` (`github.com/yattapang/Jam-Quote`, branch `main`
at `76c8309`) and the Vercel deployment. 40 Prisma models, 48 applied migrations, ~760
TypeScript source files, 2,028 unit tests passing (api 1,067, web 926, mobile 35) plus 39
cross-section flow tests against a real Postgres.

Two facts about the brief's assumptions, established before anything else:

1. **The code is not yet in `original-app/`.** The reorganisation described in section 4 of the
   brief has not happened, so this audit reads the app where it lives today: `apps/api`,
   `apps/web`, `apps/mobile`, `packages/*`. Nothing here depends on the move.
2. **There is no marketing website.** `apps/web/app/page.tsx` redirects `/` straight to
   `/dashboard`. The deployment at `https://jam-quote-web.vercel.app` is the application
   itself, behind a login, and it currently renders the name **Pryvis**. So the brief's
   "extract purpose, positioning, benefits and public pricing from the live website" cannot be
   satisfied as written — there is no such copy to extract. Section 6 below derives the same
   material from the only public surfaces that exist (the login page and the public
   quote/invoice pages) and from what the code actually does, and marks clearly what is
   therefore unverified.

---

## 1. Schema review

### Shape

Postgres via Prisma. 40 models in one schema, grouped by comment banner: the tenant record and
its users; clients; projects; quotes with sections, line items and variations; invoices with
sections, line items, payments, reminders and retention; the catalogs (suppliers, material
price entries, labour rates, equipment, units, categories, attributes, favourites, hidden
items); jobs (reusable priced recipes) and their components; purchases and labour entries;
platform tables (subscription, subscription payments, notices, sweep runs, pricing config, rule
pack config, audit log, regulatory updates).

There are **no database enums for state that grows** — `plan`, `status` and `interval` are
plain text on purpose (ADR 0002), so a new tier needs no migration. Fixed vocabularies
(`QuoteStatus`, `InvoiceStatus`, `PaymentMethod`, `LineCategory`, `UserRole`, …) are Prisma
enums. That split is deliberate and documented.

### Tenant isolation in the schema

`businessId` is present on every tenant-owned root: users, clients, projects, quotes,
invoices, jobs, every catalog table, purchases, labour entries, subscriptions, subscription
payments and notices, connections, logos. Child tables (quote sections and lines, invoice
sections and lines, payments, job components, attachments) carry **no** `businessId` and
inherit tenancy through a cascading parent. That is a normal, defensible design, but it has a
consequence worth naming: **a child row can only be reached safely by joining to its parent**,
and the correctness of that join is the only thing standing between tenants. Today it is
enforced by application code (`common/assert-owned.ts`) and proven by a flow test
(`integration/tenancy.flow.ts`).

**There is no row-level security anywhere.** No migration contains `ROW LEVEL SECURITY` or
`CREATE POLICY`; the application connects as the owning role and scopes every query itself.
Against Rule 4, which asks for `tenant_id` **plus** RLS **plus** application scoping, the
existing app has one of three layers. This is the single largest structural gap in the audit.

### Money, tax and currency

Correct, and better than the brief assumes:

- **All money is integer minor units** in `Int` columns named `…Cents`. There is no float
  anywhere in the money path.
- **Percentages are `Decimal(5,2)` or `Decimal(6,2)`** and named `…Pct`; quantities are
  `Decimal(12,3)`. Rates are never stored as floats either.
- **Currency is a per-tenant ISO 4217 code** on `Business.currency` (default `JMD`), separate
  from the platform billing currency on `PricingConfig.currency` and on each
  `SubscriptionPayment`. That separation already exists, which is what multi-country needs.
- Rounding is half-up, applied per line and then per document, in one place in
  `packages/core`.

Two real defects in this area:

- **Cents columns are 32-bit.** Postgres `Int` caps at 2,147,483,647, i.e. **$21,474,836.47**.
  For JMD that is a plausible ceiling for a large commercial contract, not an absurd one. A
  rebuild should use `BigInt` for money, or scale the currency's minor unit explicitly.
- **Timezone is Jamaica-wide, not per country.** Day boundaries (quote expiry, overdue,
  monthly quote counts) resolve against one assumed zone rather than the tenant's
  jurisdiction.

### Are quotes frozen snapshots?

**Yes, and this is the strongest part of the existing schema.** `QuoteLineItem` stores
`description`, `quantity`, `unitLabel`, `unitPriceCents`, `gctTreatment`, `markupPct` and the
whole job recipe (`jobName`, `jobUnit`, `jobComponents` as JSON) as values, and `jobId` /
`supplierId` are deliberately **not** foreign keys to the live catalog, with a comment saying
why: editing or deleting the source must never change a sent quote. The document also records
the `gctRate` and `discountPct` it was issued under. Invoices carry the same pattern.

Caveats: `sectionId` and `supplierId` *are* real relations, so a supplier delete is
constrained rather than snapshot-safe; and the freeze is by convention at write time, not
enforced by the database — nothing stops an `UPDATE` on an issued document. Rule 6 wants
immutability to be a property, not a habit.

### Indexing and normalisation

53 indexes and unique constraints. The hot paths are covered: `Quote` has
`@@unique([businessId, number, version])` and `@@index([businessId, status])`; the invoice
number counter increments atomically; the invoice-per-quote rule is a partial unique index
scoped to `deletedAt IS NULL`.

Problems found:

- **Child tables are indexed by parent only.** `Payment` has `@@index([invoiceId])` and no
  tenant-scoped index, so any platform-wide or cross-tenant reporting query over payments
  scans. Same for invoice and quote lines.
- **Soft deletes are everywhere but not in the indexes.** `deletedAt IS NULL` is in almost
  every query; only one index is partial on it. Every list query therefore filters rows the
  index still returns.
- **`jobComponents` as JSON** is right for a display snapshot and wrong to query. Nothing
  queries it today; a reporting feature would be tempted to.
- **Attachments have no tenant column and no size/type constraints in the schema.**

---

## 2. Architecture review

### Shape and communication

An npm-workspaces monorepo under Turborepo:

| Workspace | What it is |
|---|---|
| `apps/api` | NestJS + Prisma, modular by domain (one folder per module, its own controller, service, DTOs and tests) |
| `apps/web` | Next.js 14 App Router; server components read the API with the httpOnly cookie |
| `apps/mobile` | Expo / React Native; 12 screens, a local replica and a push/pull sync endpoint |
| `packages/core` | The shared rules: money, tax, totals, settlement, job cost, renewal, jurisdiction rule packs, wire contracts |
| `packages/ui` | Design tokens |
| `packages/test-ast` | The one TypeScript parser every guard test uses |

Both clients speak to one REST API. The web app proxies same-origin so the httpOnly cookie
applies and no token ever reaches client JavaScript — that part is well done.

**Where business logic lives.** Overwhelmingly in `packages/core` and the API services; almost
nothing in the database (no triggers, no computed columns) and nothing consequential on the
clients. Every money rule is spent, not restated, and a guard test
(`integration/core-rules-drift.test.ts`) fails when a rule is duplicated by hand. This is the
strongest architectural property the existing app has and it should be carried over verbatim.

**Coupling, and what would block change.**

- `packages/core` resolves at runtime through its built `dist`, so the api and web builds go
  stale until `npm run build -w @jamquote/core` runs. A real trip-hazard; a rebuild should
  consume core from source in development.
- One Prisma schema, one database, one deployable API. Appropriate at this size and matches
  the brief's modular monolith, but module boundaries are a convention: any service may
  import any other module's Prisma model, and several do.
- The web app keeps **hand-mirrored copies** of API response shapes. A guard proves a mirror
  type is used; **nothing proves its fields still match what the endpoint returns.** This is a
  live drift risk and is recorded as owed in `MODULE-SEAMS.md`.
- `plan` is a two-value string (`free` | `pro`) with exactly one limit
  (`PricingConfig.freeQuotesPerMonth`). **There is no entitlement layer**, so every feature
  gate would be a plan comparison at a call site — which is why Rule 14 exists and why the
  half-built entitlement work is parked on `wip/pre-brief-entitlements-and-rename`.

### Authentication, authorisation, roles

- JWT in an httpOnly, `sameSite=lax`, secure-in-production cookie. Login, password reset
  (single-use expiring tokens that do not reveal whether an address exists), and a separate
  admin login.
- Three roles: `OWNER`, `STAFF`, `ADMIN` (platform staff). Tenant routes refuse admin-role
  users; a small number of legacy dual-role admins are grandfathered.
- Guards are per-controller and re-resolve the user from the database rather than trusting the
  token, so a suspension bites immediately. Admin routes check named capabilities. Public
  surfaces are share-token addressed and expose exactly one document; an unknown, draft or
  withdrawn token is indistinguishable from a bad one (proved in `public-surfaces.flow.ts`).

Gaps, all of them in Rule 5:

- **No multi-factor authentication anywhere**, including the platform admin console, which is
  the highest-value login in the system and can impersonate tenants.
- **A 30-day JWT with no rotation and no way to invalidate a live session** short of
  suspending the tenant. A session version on the user record would close this.
- Authorisation is **declared per controller, not default-deny**: a new controller written
  without a guard is simply unguarded. Nothing in the gate fails for that.
- **No dependency-vulnerability check and no secret scan** in CI.

---

## 3. Requirement-gap review

### Could one tenant's data, or its clients' data, be visible across tenants?

Not through any path currently tested, and the tests are real: `integration/tenancy.flow.ts`
drives a second tenant against a first tenant's ids through every module, against an actual
Postgres, and asserts a foreign id is answered exactly as a made-up one. Ownership checks live
in one place (`common/assert-owned.ts`).

But the honest answer is **the isolation is only as good as the application code, because
there is no second line of defence**. Specifically:

- No RLS: one forgotten `where: { businessId }` is a live cross-tenant read. There is no
  database rule that would refuse it.
- **`sync` has neither an independent review nor a seam test**, and it replays writes the
  server did not originate. It is the module most able to cross a tenant quietly.
- **One known open defect of this class:** a quote line's `jobId` is not ownership-checked, so
  a caller can reference another tenant's job recipe. It copies a *snapshot*, so the leak is
  of a recipe's name, unit and component prices — not catastrophic, but it is a cross-tenant
  read.
- Logs, exports and generated PDFs are tenant-scoped by construction rather than by a checked
  rule.

### Email and WhatsApp

- **Email exists** via Resend: password reset, quote send, invoice send, overdue reminders,
  subscription notices. Each caller builds and sends its own mail; there is **no single
  outbound messaging service** (Rule 11), no delivery-status record beyond `MessageLog`, and
  no consent or opt-out model.
- **WhatsApp is click-to-chat only** — a `wa.me` link the contractor taps, which opens their
  own WhatsApp with prefilled text. Nothing is sent by the server, so there is no delivery
  receipt, no templating, no cost model. WhatsApp Business API is unstarted, and its Meta
  verification lead time is the reason to begin the application early.

### Offline mobile use

Partial. There is a local replica and a `sync` push/pull endpoint with `updatedAt` cursors and
`deletedAt` soft deletes designed for delta sync. What is missing against Rule 12: explicit
per-entity conflict rules, an outbox with client-generated UUIDs proven idempotent, encrypted
local storage with remote sign-out and retention, visible sync status, and any test under a
poor or interrupted network. The mobile app is 12 screens and 35 tests — the thinnest part of
the product.

### Manual payments and account activation

`SubscriptionPayment` is well modelled for reconciliation: an amount, a currency, a method, a
bank/cheque `reference` so it can be matched to a statement, the exact term it bought
(`coversFrom`/`coversUntil`/`interval`), who recorded it, and a void rather than a delete.

Against Rule 13 the **controls are absent**: there is no submitter/approver/activator
separation, no approval state on the record, and no single-operator exception with compensating
controls. One platform admin records a payment and the account is active. Every action is
audited, which is a real mitigation, but detection is not prevention.

Separately, on tenant-facing payments: recording a manual payment against a **DRAFT** invoice
is still allowed, though the card path has that gate (open defect).

### Customer support and feedback

**Nothing exists.** No ticket model, no feedback capture, no in-app contact route. Section 15
of the brief is entirely greenfield.

---

## 4. Risk list

**Blocks multi-country (Rule 3)**

1. One assumed timezone; day boundaries are not per jurisdiction.
2. Platform prices are a single currency in `PricingConfig` — no price per country, which
   Trinidad & Tobago needs on day one.
3. Rule packs exist and are data (good), but taxpayer-id formats, regions and payment rails
   are code-owned in core and only Jamaica is populated.
4. No i18n layer at all: English strings are inline in components.

**Blocks tiered plans (Rule 14)**

5. `plan` is a two-value string with one numeric limit. No named entitlements, no tier ladder,
   no single resolver, so every feature shipped before this is built gets retrofitted. This is
   why tiers are feature 1.

**Security (Rule 5)**

6. No RLS — application scoping is the only barrier between tenants.
7. No MFA, including on the admin console, which can impersonate tenants.
8. 30-day sessions, no rotation, no live invalidation.
9. Authorisation is opt-in per controller rather than default-deny.
10. Uploads are not malware-scanned, and attachments have no tenant column.
11. No dependency-vulnerability check and no secret scan in the gate.

**Financial control (Rule 13)**

12. No approver/activator separation on manual subscription payments.
13. Manual payment permitted on a DRAFT invoice.

**Data integrity (Rule 6)**

14. Issued-document immutability is a convention, not a constraint.
15. 32-bit cents columns cap a document at $21,474,836.47.

**Performance**

16. Child tables indexed by parent only; no tenant-scoped index on payments or lines.
17. Soft-delete filters are not in the indexes.
18. The shared core resolves through `dist`, so builds go stale silently.

**Product completeness**

19. `sync` unreviewed and untested at its seam; the mobile app thin.
20. No outbound messaging service, no delivery status, no consent model.
21. No support or feedback capability whatsoever.
22. Web/API contract drift unguarded at field level.
23. Four defects open on the register: negative amount due in the CSV export; retention release
    not re-deriving invoice status; manual payment on a DRAFT invoice; quote-line `jobId` not
    ownership-checked. Plus one unproven claim: the `FOR UPDATE` lock in `convertFromQuote` has
    no test that fails without it.

---

## 5. Migration notes

### Worth keeping, and porting deliberately

1. **`packages/core` in full** — money as minor units, totals, tax, settlement, job cost,
   renewal, the jurisdiction rule packs. This is the most valuable asset in the repository and
   it is already framework-independent.
2. **`packages/test-ast` and the guard suite.** A binder-based parser every guard shares, and
   a discipline of proving each guard by planting its defect. Rebuilding this from scratch
   would cost weeks.
3. **The 39 cross-section flow tests** and their PGlite-behind-a-real-wire-protocol harness.
   Every expensive defect in this project lived at a seam, and these are what caught them.
4. **The snapshot design for issued documents,** including the reasoning comments.
5. **The domain knowledge in the schema**: Jamaican GCT treatment per line, retention,
   variations, job recipes, the material/labour/equipment split. This was learned, not
   guessed.
6. **The atomic per-tenant numbering** and the one-invoice-per-quote partial unique index.
7. **The audit log with redact-by-default details.**

### Should be rebuilt

1. **The tenancy enforcement layer** — as `tenant_id` plus RLS plus request-scoped
   application context, so a forgotten `where` cannot leak.
2. **The commercial layer** — plans, entitlements and limits as data behind one resolver.
3. **Outbound messaging** — one service, pluggable channels, delivery status, idempotency,
   consent.
4. **`sync`** — outbox, client UUIDs, explicit per-entity conflict rules, and tests under bad
   networks.
5. **Money columns** as `BigInt`, and time as per-jurisdiction day boundaries.
6. **The web/API contract** — generated from one definition rather than hand-mirrored.
7. **Authentication** — default-deny routes, MFA, short sessions with rotation and
   invalidation.
8. **Support and feedback** — greenfield.

### Migrating the data rather than discarding it

There are **no live tenants** (confirmed by the owner). That is the single most important fact
in this section: the migration is a schema and code migration, not a customer data migration,
and this window will not come again.

The proposed approach either way:

- Keep the 48 existing migrations intact and never edit them (Rule 6); corrections are new
  migrations.
- Write the export/import scripts now, from real demo data, because Rule 10 makes them the
  later hosting-migration path as well.
- If a rebuild proceeds in a new schema, move data with an explicit per-table mapping script
  that lands in `db/` and is tested against a restored copy — not by hand, and not by pointing
  the new code at the old tables.
- Reconcile after every migration run on totals, not row counts: a document's total, tax and
  balance recomputed from core must equal what was stored.

---

## 6. Product and feature review

**Method, and its limit.** The brief asks for this from the live website. There is no
marketing website: `/` redirects to `/dashboard`, and the Vercel deployment is the logged-in
application. So the product's purpose, positioning and benefits are **not stated anywhere
publicly**, and nothing below is corroborated by owner-written public copy — it is derived
from the login and public quote/invoice pages, the application's own screens, and the code.
**Positioning and pricing therefore remain unverified and need the owner's confirmation.**

### What the product is, as built

A multi-tenant quoting and invoicing tool for Jamaican construction contractors. A contractor
prices a job from their own catalog of materials, labour and equipment — or from a reusable
"job recipe" — sends the client a branded PDF quote through a public share link or WhatsApp,
and the client accepts or declines on that page. An accepted quote becomes a project and,
separately, one invoice; payments, retention and overdue reminders are tracked to settlement;
project costing shows job profit against purchases and labour actually incurred.

No public pricing or plan information exists anywhere on the deployment. Internally: a free
plan limited to 3 new jobs quoted a month, and a `pro` plan whose monthly and annual prices
live in admin-editable `PricingConfig`.

### Feature inventory

Marked *keep* (port as-is), *change* (port with named changes), *drop*.

| # | Feature, as the user meets it | Verdict | Note |
|---|---|---|---|
| 1 | Sign up / log in, one business per account | **change** | Add MFA, default-deny routes, short rotating sessions |
| 2 | Business profile: country, currency, GCT registration, logo, numbering | **keep** | Country/currency separation is already right |
| 3 | Client book with soft delete | **keep** | |
| 4 | Material catalog with suppliers, units, categories, attributes, favourites, hide | **change** | Keep the model; the attribute/option layer is elaborate and should be justified against use |
| 5 | Labour rate book | **keep** | |
| 6 | Equipment list | **keep** | |
| 7 | Job recipes (price a job once, reuse it) | **keep** | The product's real differentiator |
| 8 | Quote builder: sections, lines, per-line GCT treatment, markup, discount | **keep** | |
| 9 | Quote detail levels (summary vs itemised for the client) | **keep** | |
| 10 | Branded PDF quote | **keep** | |
| 11 | Public share link, client accept/decline | **change** | Add typed name, timestamp and a PDF record of acceptance |
| 12 | WhatsApp click-to-chat share | **change** | Keep on every tier; add server-side WhatsApp Business later |
| 13 | Quote versions and variations | **change** | Promote variations to first-class, client-signable change orders |
| 14 | Quote expiry | **keep** | Day boundary must become per jurisdiction |
| 15 | Quote → invoice conversion, one invoice per quote | **keep** | |
| 16 | Invoices, payments, voids, settlement | **change** | Gate manual payment behind a non-DRAFT status |
| 17 | Retention tracking and release | **change** | Release must re-derive invoice status (open defect) |
| 18 | Overdue reminders and digest | **change** | Move behind the one messaging service |
| 19 | Card payment links (WiPay) | **keep** | |
| 20 | Projects, purchases, labour entries, job profit | **keep** | |
| 21 | Dashboard and reports | **change** | Never independently reviewed; rebuild with its own tests |
| 22 | Accountant CSV export | **change** | Fix negative amount due (open defect) |
| 23 | Mobile app: quotes, clients, projects, invoice view, add material | **change** | Real offline model, or cut scope until one exists |
| 24 | Mobile sync (push/pull replica) | **rebuild** | Unreviewed, untested at its seam, highest quiet-corruption risk |
| 25 | Platform admin console: tenants, plans, pricing, audit, impersonation | **change** | Add MFA and approver separation |
| 26 | Manual subscription payment recording | **change** | Add submitter/approver/activator separation (Rule 13) |
| 27 | Subscription notices and renewal sweep | **keep** | Idempotency is well designed |
| 28 | Country rule pack overrides (admin, audited) | **keep** | The multi-country foundation |
| 29 | Admin-curated regulatory feed | **drop for v1** | Content-maintenance cost with no revenue attached; revisit as a Business-tier nicety |
| 30 | Trade master list | **keep** | |
| 31 | Demo/seed data banner and demo content | **change** | Useful for trials; make it an explicit trial mode |
| 32 | Free-tier quota (3 quoted jobs a month) | **change** | Becomes one entitlement among many |
| 33 | Support / feedback | **absent** | Build (brief section 15) |
| 34 | Deposit and progress invoicing | **absent** | The top-ranked missing feature for this trade |

### Product-scope recommendation

The brief asks whether the findings support one product as scoped, a second product with a
different feature set, or integrating everything into one. On the evidence in **this**
repository the answer is clear: **one product, as currently scoped, with the commercial layer
added.** The feature set is coherent — a contractor prices work, sends it, gets paid, and sees
whether the job made money — and every advanced item in the inventory serves that one story.
Nothing here justifies a second product, and there is no second feature set hiding in the
code.

Effect on tiers: none of the above changes the ladder already approved in `TIERS.md`.
Invoicing remains the Pro line; Business remains team, roles, approvals, crews and
consolidated reporting. Dropping the regulatory feed (#29) removes nothing a tier depends on.

**One finding I cannot resolve alone.** While looking for the deployment I found
`https://jam-quote.vercel.app`, live and returning a complete, polished product: *"JAM Quote —
Instant HVAC Quotation for UAE Villas"*, priced in AED, branded **Al Arabia Electromechanical
L.L.C.**, with instant tonnage sizing and a paid AED 150 branded PDF quotation. It is a
different market, currency and trade from this repository, and it is not built from this code.
If that deployment is yours, then the product-scope question in the brief has a second input
this audit could not see, and the answer may well change — two vertical quoting products with
a shared engine is a genuinely different strategy from one. **I have not assumed either way and
have made no contact with it beyond reading its public page.** Please confirm whether it is
yours before Phase 1 begins.

---

## 7. Rebuild, evolve, or rebuild selectively

The brief presumes a rebuild in `new-app/`. Rule 1.5 says state the options, so here they are
honestly, because this decision is worth more than any other in Phase 1.

**Option A — rebuild in `new-app/`.** *For:* every structural gap (RLS, entitlements,
default-deny auth, `BigInt` money, generated contracts, offline done properly) is cheapest
when designed in from the first commit, and there are **no live tenants**, so the usual reason
a rebuild fails does not apply. *Against:* it discards a working product with 2,028 passing
tests and 48 migrations of learned domain detail. Rebuilds routinely take two to three times
the estimate and the second system is rarely as correct as the one it replaces, because the
defects this one has already survived get re-learned.

**Option B — evolve in place.** *For:* the foundations the multi-country goal needs are
already right — rules as data, money as minor units, tenancy on every row, one shared core,
seam tests against a real database. *Against:* RLS and default-deny authorisation are
retrofits that touch every table and every controller, and the entitlement layer has to be
threaded through features that already exist. Retrofitted isolation is exactly the kind of
change that is 95% done and therefore not done.

**Option C — rebuild the layers the audit condemns, keep the rest.** Keep `packages/core`,
the guard suite, the flow-test harness, the snapshot design and the schema's domain knowledge.
Rebuild, as their own scoped changes: the tenancy enforcement layer (RLS + request-scoped
context), the commercial layer (entitlements), authentication (default-deny, MFA, sessions),
outbound messaging, `sync`, and the web/API contract. Money columns and per-country time move
in a migration each.

**My recommendation: Option C**, with the folder reorganisation still done as the brief
describes, so `new-app/` is where the rebuilt layers land and the ported assets arrive by
deliberate review rather than by copy. The audit found the *commercial* and *defensive* layers
missing or thin, and the *domain* layer sound and well tested. Rebuilding the sound part buys
nothing and costs the tests that make it trustworthy. I hold this as a recommendation, not a
decision, and will follow the brief as written if you prefer Option A.

---

## 8. What this audit does not prove

- It did not execute the application against a live database; the behavioural claims rest on
  the existing test suite, which I have run, and on reading the code.
- It did not review the deployed environment's configuration — Vercel and Render settings,
  environment variables, database backups or whether a restore has ever been tested.
- It did not scan dependencies for known vulnerabilities, because no such check exists yet.
- It read `apps/mobile` less closely than the api and web, and `sync` remains the module I am
  least confident about — which is also the finding.
- Positioning and pricing in section 6 are derived, not quoted from owner-written copy,
  because none exists publicly.

## 9. Inputs needed before Phase 1

1. **Is `https://jam-quote.vercel.app` (the UAE HVAC product) yours?** It changes the
   product-scope answer.
2. **Option A, B or C** in section 7.
3. **Confirmation to reorganise the repository** into `original-app/`, `new-app/`, `docs/`.
   It must update `package.json` workspaces, `turbo.json`, `render.yaml`, the tsconfig paths
   and any Vercel, Render or CI path reference in the same commit. I propose doing it on a
   branch first, as one commit of tracked moves.
4. **Tier prices** per country, when you are ready — the model holds them as data, so this
   does not block the build.
5. **Brand assets** (Pryvis logo and wordmark, SVG plus a square icon) to finish the
   user-visible rename, which is parked.
