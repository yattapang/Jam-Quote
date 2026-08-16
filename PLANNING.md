# JamQuote — Working Plan

**Last updated:** 2026-08-15
**Status:** web app pre-launch hardening; mobile deliberately not started.

This file is the single source of truth for what we are building, in what
order, and why. Update it in the same commit as the work it describes — a plan
that lags the code is worse than no plan, because it is trusted and wrong.

---

## 1. Vocabulary — read this before touching anything

**DONE — step 0 landed in 687c29c (0a) and 74108b7 (0b).** Code and UI now
agree. What follows is the settled vocabulary.

| Concept | User sees | Prisma model | Physical table |
|---|---|---|---|
| Reusable priced service — "Interior wall painting, $1,500/sq ft", built from material + labour components. A **template**. | **Job** (Job Library) | `Job`, `JobComponent`, `JobComponentKind` | `Assembly`, `AssemblyComponent` (via `@@map`) |
| A specific piece of work for a specific client — "Retaining wall, Spanish Town". A **live engagement**. | **Project** | `Project`, `ProjectStage` | `Job` (via `@@map`) |

**The split was eliminated, not documented.** The first version of this plan
proposed keeping the DB names and living with the mismatch. That was the wrong
call: the failure mode is reading `prisma.job` and acting on the wrong
vocabulary, which produces code that compiles, runs, and touches the wrong
table. Silent and data-corrupting. A note in a planning file is not a control.

Physical names still differ from model names, but that mismatch is inert —
`@@map` is a single declared line per model, not something a reader can act on
by mistake. Only touch it when writing raw SQL, of which there is currently
none beyond `SELECT 1`.

`@@map` makes the rename nearly free — it decouples the model name in code
from the table name in Postgres, so the tables, columns, indexes and foreign
keys are untouched and **no data migration is generated**. Verify that:
`prisma migrate diff` must emit no SQL. If it wants to emit SQL, the `@@map`
is wrong — stop and fix it rather than accepting a table rename.

Rules:

- Variables and services follow the Prisma model name; translation to user
  wording happens at the render boundary only.
- **Wire contract: UNFROZEN as of 2026-08-15.** The deployed mobile client is
  being rebuilt, so backward compatibility with it is no longer a constraint,
  and the API field names get fixed properly in steps 0c/0d rather than
  carrying the old vocabulary forever. This was the right call to revisit:
  the only reason to keep `assemblyId` on a line item was a client we are
  about to replace.
- **Enum VALUES stay untouched regardless** (`QUOTED`, `MATERIAL`, …). Those
  are persisted in the database, not just sent over the wire — renaming them
  is a data migration and a corruption risk, which is a different question
  entirely from what a JSON key is called.
- Test mocks typed `as any` opt out of this protection entirely — the
  assemblies service test compiled fine against a renamed model and failed
  only at runtime. Prefer typed mocks where practical.

Other terms already settled:

- **Material** — a thing you buy (`MaterialFavourite`). Sold-by unit vs
  measured-in unit are different fields; see coverage below.
- **Labour rate** — a trade + skill tier + rate (`LabourRate`).
- **Trade** — the vocabulary behind labour rates (`Trade`), curated master
  list plus per-tenant additions.
- **Quote line "kind"** — material / labour / equipment / job. Introduced by
  Phase 2 below; not yet a DB concept.

---

## 2. Where we are

The web app is feature-complete for a first customer except for the items
below. Payments by card are blocked on WiPay credentials. Mobile is
intentionally untouched until the web app is solid.

Recently landed (all pushed):

- **Vocabulary unified** (0a–0d): `Job` = the reusable priced template,
  `Project` = client work, in schema, wire and UI. Four steps, zero SQL.
- **Phase 1 findability**: trade picker offers "+ Add" before you type; the
  quote line's category dropdown always renders and can create; routes and
  labels renamed (`/jobs` = Job Library, `/projects` = client work); Job
  Library empty state teaches the feature.
- **Phase 2 kind-first line editor**: every line declares what it IS
  (Material / Labour / Equipment / Job) and the saved picker, units and price
  follow from that. Fixed a customer-facing bug on the way — job lines printed
  "12 unit" instead of "12 sq ft".
- **Equipment library**: the UI for an API that already existed.
- Reports, view-as-tenant, identity-keyed rate limiting, coverage math.

---

## 3. The four issues raised in tenant review (2026-08-15)

Findings first, because two of the four were **already built and simply not
findable**. That is still a real defect — an unusable feature and an absent
feature are the same thing to a contractor — but the fix is different.

| # | Reported | Reality | Work needed |
|---|---|---|---|
| A | Labour → add rate → Trade Type has no "add new" | `TradeSelectField` DOES create trades, but only reveals the option after you type a non-matching name. Every other picker in the app shows an explicit "+ Add new…" row. | Discoverability |
| B | Jobs tab should be a job library with priced, component-built job types | **Exists as "Job types" (`/assemblies`)** — builds from Material/Labour/Other components linked to saved materials and labour rates, computes unit cost + markup, editable override, and quotes as Summary or Detailed. This is the requested feature. | Rename, surface, close gaps |
| C | New Quote: category dropdown can't create a category | Correct. The per-line material-category filter is read-only. | Build |
| D | Line editor only offers "saved material"; should offer labour/equipment/job and then the right library, units and price | Correct. The editor is material-centric with separate "+ Add labour"/"+ Add job type" buttons bolted on. | Redesign |

---

## 4. Phases

Sequence chosen: **quick wins first, redesign second.** Working software
sooner, and a chance to correct direction before the expensive change.

### Phase 1 — Make what exists findable (small, independent)

**Step 0 — unify the vocabulary in the schema. DONE (687c29c, 74108b7).**

Two commits that never shared a name: 0a vacated `job` by renaming client
work to `Project`, 0b then gave `job` to the template. Every stale reference
was a compile error rather than a reference that still compiled while meaning
something else. Both verified to generate zero SQL.

**Steps 0c/0d — DONE (dc36f8a, 185e544, 67593f2).** The wire, the view types
and the template naming all follow the vocabulary now. Every step carried
`@map`, so no step generated SQL.

**The lesson worth carrying forward.** Vacate-then-occupy makes the compiler
enumerate stale references — but only for identifiers. It does NOT protect
STRING LITERALS crossing a renamed union: three `kind="job"` call sites stayed
valid after the swap while now pointing at the template's deleter, so a
project delete would have hit the wrong table. Found by reading the call sites,
not by a green typecheck. Whenever a rename touches a string-keyed union or a
discriminant, grep the literals by hand.

Same shape as the other hole found this round: `prisma/` scripts were never
type-checked at all, so the destructive cleanup scripts silently kept calling
a renamed accessor. Now covered by `tsconfig.scripts.json`.

Then, the findability work:

1. **Visible "+ Add new trade…"** in `TradeSelectField`, matching the
   `ClientSelectField` convention, shown before typing rather than only after
   a non-matching query.
2. **Create material category inline** from the quote line's category filter
   and from `MaterialForm`, reusing the tenant-extension pattern
   (`businessId` set = tenant's own; `businessId NULL` = curated).
3. **Rename Job/Project throughout the UI** per §1: `/assemblies` → `/jobs`
   (label "Jobs"), existing `/jobs` → `/projects` (label "Projects").
   Redirects from the old paths; no DB change.
4. **Job Library empty state** that teaches the feature — the painting
   example, in the contractor's own terms.

**Exit:** a contractor can find the Job Library, build a job type, add a
trade, and add a material category, without being told where to look.

### Phase 2 — Line editor redesign. DONE (d809180, 1eddd32)

Kind-first: pick Material / Labour / Equipment / Job, and the Saved picker,
Unit vocabulary and prefilled price follow. The old "+ Add labour" /
"+ Add job type" buttons are gone — any line can be any kind.

The structural change underneath: a line's `kind` says what it IS; its
`heading` only says where it PRINTS. Those were previously the same field, so
filing a bag of cement under a custom heading recorded it as OTHER. Category
now follows kind.

### Phase 2b — Inline creation everywhere (IN PROGRESS)

Reported: only Material lets you create a new entry from the Saved picker.
Labour, Equipment and Job say "none saved" with no way out except abandoning
the quote.

- Labour and Equipment open their full form inline — both are small.
- **Job opens a QUICK create**: name, unit, rate per unit. The full recipe
  builder stays on the Jobs page. Building a component recipe inside a modal
  stacked on a half-written quote is too much form for that moment.
  - **The trap**: `unitCostCents` is COMPUTED server-side from components, so
    a job created with none saves at $0 — the contractor types 1500 and gets a
    line priced at zero. Quick-create therefore writes the rate as a single
    OTHER component (quantityPerUnit 1, no markup), which computes to exactly
    the entered rate and opens on the Jobs page as an ordinary job to refine.

### Phase 2c — Unit vocabulary for labour and equipment (API DONE: 1fb09a2)

`RateUnit` is a closed Postgres enum of cadences, so its dropdown genuinely
cannot be extended by a tenant. But labour sold per sq ft, or scaffold per
lift, is real. Both models gained a free-text `unitLabel`, mirroring materials.
Migration written, NOT YET APPLIED. Pickers and quote-line plumbing still to do.

### Phase 3 — Hide vocabulary. DONE (d1bdab4, a3a2794, 2b7989c)

Tenants can hide material categories, material units and trades they never
use, from Settings -> "Catalog & vocabulary". Hiding is not deleting: the row
stays, still referenced by existing materials and by documents already sent.

**The schema decision, worth not relitigating.** Catalog rows use the
curated/tenant pattern where `businessId NULL` means a row EVERY tenant
shares. An `archived` flag on the row would hide curated "Cement" for the
whole platform — the #19 failure mode. So a hide is only expressible as
`(businessId, kind, rowId)` in `CatalogHidden`: the safe thing is the only
thing that can be written down.

`rowId` is not a foreign key — it points into a different table per `kind`.
An orphan hide after a row is deleted is harmless; four join tables would cost
more.

Filtering runs in the SERVICE, not the query, because no column on a shared
row could say "this contractor does not lay tile". Reads take
`?includeHidden=true` for the settings screen only.

NO SUPPLIER kind, deliberately: suppliers are wholly tenant-owned and already
delete, so a supplier hide would have been accepted by the API and filtered by
nothing — a hide that appears to work and does not.

Toggling invalidates the module-level material-schema cache, or the pickers
keep offering a category that was just hidden.

### Phase 4 — Job Library depth

1. Jobs composed of other jobs, if a general contractor needs it. **Open —
   do not build speculatively**; nesting brings cycle detection and recursive
   costing.
2. Per-category name templates.
3. Attribute-based filtering in the material picker.
4. `pg_trgm` GIN index on `searchText` — the btree only helps prefixes, not
   the infix `%term%` the picker issues. Irrelevant at current volume.
5. Admin editor for curated categories/attributes/units.
6. Curated price-feed ingestion.

### Phase 5 — Mobile

Only after the web app is solid. The client is being REBUILT, which is why the
wire contract was unfrozen in 0c/0d. `apps/mobile` still renders mock data in
the quote editor, add-material and invoice detail.

## 5. Standing outstanding items

| Item | State |
|---|---|
| **`npm run build` cannot run here** | `next/font` cannot reach fonts.googleapis.com from this machine (TLS interception). Fails in `app/layout.tsx`, unrelated to any change. **Run the build somewhere with clean egress before deploying.** |
| **Deploy API and web TOGETHER** | 0c/0d changed JSON field names and Phase 1 moved routes. A new API with an old web (or the reverse) fails those requests. |
| **Migration 20260816090000 not applied** | Adds `unitLabel` to LabourRate and EquipmentItem. Additive, nullable, non-destructive. |
| Render migration endpoint | **Unfixed, will recur.** `prisma migrate deploy` must use a DIRECT, non-pooled Neon endpoint. A session advisory lock taken through pgbouncer strands on any failed migration (hit once: P1002). |
| Card checkout (WiPay) | **Blocked** on API credentials. Manual record + void work. |
| Delete `seed-business-blackwood` | Deferred until Reports has been checked against it — the only tenant with enough data to render. NOT purely fixtures: 4 quotes hand-made 12 Jul, material edited 9 Aug. |
| MaterialFavourite FK drift (#40) | Live is `RESTRICT`, schema says `SET NULL`. Safe direction, but deleting an in-use unit errors instead of nulling. Shapes the Phase 3 archive design. |
| Quote email has no logo | Invoice email has one. |
| `Business.logoUrl` | Dead column, superseded by `BusinessLogo`. |
| Sidebar during view-as-tenant | Shows the admin's own business name; the banner names the tenant. Cosmetic. |
| Equipment not in mobile/sync | The equipment library is web + API only. |

---|---|
| Card checkout (WiPay) | **Blocked** on API credentials. Manual payment record + void already work. |
| Delete `seed-business-blackwood` | Deferred until Reports has been checked against it — it is the only tenant with enough data to render. NOT purely fixtures: 4 quotes hand-made 12 Jul, material edited 9 Aug. |
| Render migration endpoint | **Unfixed, will recur.** `prisma migrate deploy` must use a DIRECT, non-pooled Neon endpoint. A session-level advisory lock taken through the pooler strands on any failed migration (hit once: P1002, objid 72707369). |
| Quote email has no logo | Invoice email has one; quote email does not. |
| `Business.logoUrl` | Dead column, superseded by `BusinessLogo`. |
| Sidebar during view-as-tenant | Shows the admin's own business name; banner names the tenant. Cosmetic. |

---

## 6. Invariants — do not break these

These are settled decisions with real failure modes behind them. Changing one
requires a deliberate decision, not a refactor.

- **Money is integer cents, always.** `computeTotals` in `@jamquote/core` is
  the only place totals are calculated.
- **A quote line's `quantity` is in the BILLED unit.** `unitPriceCents` is per
  billed unit and totals multiply the two. Coverage converts measured → billed
  before the line is saved; storing 40 m² where 12 boxes belongs invoices
  forty boxes.
- **Curated vs tenant rows** are distinguished by `businessId NULL`. Every
  relation carrying that pattern uses `ON DELETE CASCADE` — `SET NULL` would
  promote a tenant's private row to a platform-curated one visible to all.
- **`req.businessId` comes from `TenantAuthGuard` only**, never from a token
  claim, with the single audited exception of view-as-tenant.
- **Rate limiting keys on identity**, not IP: all web traffic reaches the API
  from Vercel's addresses.
- **Never trust a caller-supplied client IP header.** A tracker the attacker
  chooses reports as protection while providing none.
- Reporting semantics: `INVOICED` quotes count as won; cash collected comes
  from `Payment.paidAt` and never `Invoice.paidCents`; receivables are
  as-of-now and ignore the reporting window.

---

## 7. How we work

**Multi-agent, to control token spend.** The pattern that has worked:

1. The lead does the design and the security-sensitive work directly —
   anything touching auth, tenancy, money, or migrations.
2. Mechanical breadth (UI wiring, CSS, form plumbing) goes to a subagent with
   a brief that states the traps explicitly, not just the goal.
3. Subagents never commit. The lead verifies — typecheck, lint, tests, build,
   and a targeted read of the risky part — then commits.
4. Split large work so the riskiest step is not last. A single agent run
   doing extraction *and* migration failed once for exactly that reason.

**Verification before every commit:** `npm run typecheck && npm run lint &&
npm test && npm run build` from the repo root. For anything that changes app
wiring, also boot the API — a DI failure in a global guard is a total outage
that no unit test catches.

**Commit protection:** commit and push in increments. Session limits and one
disk-full incident have both cost work here.
