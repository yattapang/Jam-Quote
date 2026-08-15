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

- Reports: win rate, invoiced vs collected, receivables by client, sales by
  month, jobs by stage, top clients.
- Admin view-as-tenant: read-only, 30 minutes, audited.
- Rate limiting keyed by caller identity rather than source IP.
- Coverage math: quote in m², bill in boxes.
- Invoice bill-to client editable; admin console fits a phone.
- Production cleaned of seven empty demo tenants.

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

**Steps 0c/0d — finish the rename through the wire and the view types.**

Now unblocked: the deployed mobile client is being rebuilt, so the API field
names are no longer pinned by a client we cannot change. Same two-step
vacate-then-occupy discipline, for the same reason — `jobId` is about to
change meaning, and a swap done in one pass would leave code that compiles
while referring to the wrong thing.

- **0c — vacate `job` in the wire and the view types.** `Quote.jobId` /
  `Attachment.jobId` → `projectId` (Prisma field with `@map("jobId")` so the
  column is untouched and no SQL is generated), the matching API DTO and
  JSON keys, the sync payload's `jobs` table key → `projects`, and the view
  types that mean client work: `ReportJob` → `ReportProject`, `JobsSummary`,
  `jobsByStage`, `ClientJobCount`, `DemoJob`/`demoJobs`, and web's `JobForm`,
  `JobRow`, `JobSummary`, `JobDetail`, `jobStagePill`.
- **0d — give `job` to the template.** Line-item snapshot fields
  `assemblyId` / `assemblyName` / `assemblyUnit` / `assemblyComponents` →
  `jobId` / `jobName` / `jobUnit` / `jobComponents`; `JobComponent.assemblyId`
  → `jobId` (again `@map`, no SQL); web's `Assembly`/`AssemblyComponent` view
  types → `Job`/`JobComponent`; `AssemblyForm` → `JobForm` (the name freed by
  0c).

**Deployment note.** These change the JSON contract, so the API and web must
ship together. During any window where one is new and the other is old,
affected requests fail. Acceptable here — three tenants, one of them ours,
pre-launch — but it is a real window and should not be assumed away. Deploy
API and web in the same push and check a quote round-trips afterwards.

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

### Phase 2 — Line editor redesign (the substantial one)

Replace the material-centric line row with a **kind-first** flow:

1. Pick the line **kind**: Material / Labour / Equipment / Job.
2. The "Saved" picker then offers rows from the matching library
   (`MaterialFavourite` / `LabourRate` / equipment / `Assembly`).
3. Unit options come from that kind (material → sold-by units; labour →
   hour/day/week; job → the assembly's own unit).
4. Unit price prefills from the saved record and stays editable — the saved
   price is a default, never a lock.

Constraints carried from existing behaviour:
- `LineCategory` already exists in core (MATERIAL/LABOUR/EQUIPMENT/…). The
  line "kind" should map onto it rather than inventing a parallel enum.
- The saved line quantity must remain in the **billed** unit; see the
  coverage rule below.
- The editor is shared by the quote and invoice builders
  (`app/(app)/LineItemsEditor.tsx`) — both must keep working.
- Pure logic goes in `lib/line-editor.ts` and is unit-tested there. There is
  no DOM testing setup in this repo; keep logic out of components.

### Phase 3 — Job Library depth

1. Job types composed of other job types, if a general contractor needs it.
   **Open question — not yet decided.** Nesting brings cycle detection and
   recursive costing; do not build it speculatively.
2. Per-category name templates.
3. Attribute-based filtering in the material picker.
4. `pg_trgm` GIN index on `searchText` — the btree only helps prefixes, not
   the infix `%term%` the picker issues. Irrelevant at current volume;
   needed once the curated catalog grows.
5. Admin editor for curated categories/attributes/units (capability
   mirroring `MANAGE_RULEPACK`).
6. Curated price-feed ingestion — curated `MaterialPriceEntry` rows are still
   only written by `prisma/seed.ts`.

### Phase 4 — Mobile

Only after the web app is solid. `apps/mobile` quote editor, add-material and
invoice-detail still render mock data. The APIs they need exist. Mobile needs
a relative-time helper (web has one at `apps/web/lib/relative-time.ts`)
because the API returns ISO `fetchedAt` where the mock pre-rendered a string.

---

## 5. Standing outstanding items

| Item | State |
|---|---|
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
