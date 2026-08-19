# JamQuote — Working Plan

**Last updated:** 2026-08-19
**Status:** audit closed, and the subscription billing lifecycle is built
(§4e–4f Phases A–C: payment ledger, derived standing, collected-vs-contracted,
renewal reminders, revert-to-free). Phase D (WiPay self-serve) is blocked on
credentials. **Still nothing has met a real contractor** — that remains the
largest risk and the highest-value next action. Mobile deliberately not
started.

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

The web app has now been walked end to end by its owner rather than only
tested. That changed the picture: the code was in better shape than the
experience, and most findings were not broken logic.

**The audit's real lesson, in one line:** of eleven substantive findings, four
were features working exactly as designed where the design did not match what
the word on the button means to the person clicking it, and three were a
correct, well-tested helper that some screen simply did not call. Only two were
ordinary bugs. Tests could not have caught most of this — which is why the
remaining plan leans on real use, not more unit tests.

Recently landed (all pushed):

- **Vocabulary unified** (0a–0d): `Job` = the reusable priced template,
  `Project` = client work, in schema, wire and UI. Four steps, zero SQL.
- **Kind-first line editor** with inline creation for every kind, equipment as
  a first-class component, and per-component units.
- **`Invoice.issueDate`** — an invoice now carries its own date and reports
  bucket revenue by it. Previously everything keyed off row-creation time, so
  a back-dated invoice was counted in the month it was typed.
- **Reports**: weekly period, custom date range, printing, and a range caption.
- **Hiding extended to library items** — materials, labour rates and equipment,
  not just the vocabulary behind them.
- **The staff console tells the truth.** It had been falling back to invented
  tenants, a hardcoded MRR and a fabricated revenue chart.
- Deposit as % or $, unit rendering unified, material unit round-trip fixed.

- **Audit findings closed** — see §3b. The last three landed in `4ce1a8d`.

**Not yet met by a real user:** everything above. No contractor has used any of
it. That is the single largest risk in this plan and the reason §4b exists.

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

## 3b. Tenant audit results (AUDIT.md, run by the owner 2026-08-16/17)

### Part 1 — Libraries

| Reported | Verdict | Resolution |
|---|---|---|
| Labour: new rate row not created, but typing a new trade saved it | Real | Trade "+ Add" prompt was `disabled`, so it invited a click and ignored it — now focuses the input |
| Material/Labour/Other is too narrow — transport, equipment don't fit | Real, by omission | EQUIPMENT is now a job component kind (`0a20681`) |
| Component rows had no unit of their own | Real | `JobComponent.unitLabel` added |
| "Didn't know how to apply coverage" | Not a defect | Coverage needs a material with coverage configured; the field is discoverable only from the material. **Still worth a hint on the line.** |

### Part 2 — New Quote

| Reported | Verdict | Resolution |
|---|---|---|
| Steel/rebar prints "1 unit" though linear foot was chosen | **Real, root cause found** | `create`/`update` on materials did not join `unitRef`, so a written material came back with no unit and the create response is piped straight onto the line. Read paths had the join; writes did not — which is why only fresh rows were affected and older rows with a legacy `unit` string ("Bag") kept theirs. Fixed `ee0ec0a` |
| Creating a job from the quote asks for the client again | Real | `defaultClientId` pre-fills the modal from the quote's client. Fixed `000e8e8` |
| Deposit should offer percent or dollars | Accepted | `depositCentsFrom` in core; $/% selector. Only resolved cents persist. Done `1168ff9` |
| Equipment "did not group" — 1 day and 10 days stayed separate | **Working as designed** | `groupJobComponents` consolidates the *component snapshot inside one job line*. Two equipment lines the contractor added separately are never merged — quote lines are theirs, and silently folding two into "11 days" would rewrite what they typed. If merging is wanted it belongs in the editor as an offer, like the job builder's duplicate notice. |
| Coverage did not calculate or show | Unconfirmed | Almost certainly no coverage configured on the material used. Needs a re-test with one that has it. |
| Custom unit under Job came back as "day" | Open | Not yet reproduced. Rate was correct, only the unit fell back. |
| Deposit/discount/GCT match panel vs PDF; reopen preserved every line; email + PDF good; status auto-SENT; accept offered | **Passed** | — |

### Part 3 — Projects, invoices, clients

| Reported | Verdict | Resolution |
|---|---|---|
| Quote screen shows "30 units" for a unit named M; the invoice screen shows "30 M" | **Real** | Not a data problem. `lineUnitLabel` was correct and well tested; the quote and invoice detail pages never called it, and the labour and equipment list pages each had their own copy of the cadence map. The invoice EDIT screen and both PDFs did use the helper — which is exactly why converting appeared to fix it. Fixed `437c235` |
| Quote converted to invoice, all lines carried over, units correct on the invoice | **Passed** | — |
| Quote generated and emailed with the logo | **Passed** | Note §5 still lists "quote email has no logo" — that row is now stale for the PDF; leave until confirmed which surface was meant |

**Lesson worth keeping:** three of the audit's findings so far have been a
correct, well-tested helper that some screen did not call. The type system
cannot see a bypass — `RATE_UNIT_LABEL[x]` is a valid lookup on a valid map —
and there are no DOM tests here. Where an invariant is "everyone must go
through this one function", enforce it by scanning the source
(`apps/web/lib/unit-label-usage.test.ts` is the pattern).

### Part 4 — The money seam

| Reported | Verdict | Resolution |
|---|---|---|
| Quote → invoice conversion kept every figure | **Passed** | — |
| A 1 July invoice showed overdue yet counted in August's "total invoiced" | **Real** | There was no invoice date. Reports bucketed on `createdAt`, so revenue was attributed to the day the row was typed. The 1 July set was the DUE date — confirmed on INV-0004 (due 2026-07-01, written 2026-08-16), a different fact that cannot stand in. `Invoice.issueDate` added, backfilled from createdAt and verified against live so no existing figure moved. Fixed `936b31b` |
| Sales-by-month chart had an August bar only | **Same cause** | The chart bucketed on `createdAt` too. Now keys off `issueDate` |
| Reports need a custom range and a weekly period | Accepted | Both added; week runs Mon–Sun. `6e4e2a9` |
| Reports need to print | Accepted | Prints the page itself, no separate print view, so no second copy of the figures can disagree. `6e4e2a9` |

**Why one bug produced four symptoms:** `createdAt` was doing duty as the
invoice's date everywhere, and nothing named that assumption. Removing
`createdAt` from `ReportInvoice` outright — rather than leaving it beside the
new field — turned every remaining use into a compile error, which is how the
dashboard's own mapping was caught.

### Part 5 — Settings

| Reported | Verdict | Resolution |
|---|---|---|
| Hid Cement (material + category) and Tiler (labour); all still in the dropdowns | **Real, but not where it looked** | The vocabulary hiding was correct — verified against live, Tiler and Cement were excluded from the trade and category lists. The saved rate "Tiler — Master" and the materials in the Cement category are DIFFERENT rows, built on that vocabulary rather than being it, and nothing could hide those. Hiding now covers the library items themselves. Fixed `16f75ed` |

**Decision recorded:** hiding does **not** cascade from vocabulary to items.
Hiding the word "Tiler" shortens the trade picker; hiding the rate
"Tiler — Master" removes it from the quote line. One click withdrawing several
priced items at once is not something to do silently, and restoring the word
would then have to guess which items to bring back. The owner chose this over
cascade and over a wording-only fix.

**Pattern, third instance:** a feature working exactly as designed, where the
design did not match what the word on the button means to the person clicking
it. Worth checking the remaining audit areas for the same shape rather than
only for broken code.

### Part 6 — Admin console

| Reported | Verdict | Resolution |
|---|---|---|
| No control over tenant payment status / account state / converting accounts | **Built, but unreachable** | Suspend, restore, delete and plan-change were all wired. They render only for a row with a real business id, and the mock rows carried `null` — so nothing reached them. Fixed by removing the mocks, `c57838b` |
| "Lots of different tenant test information" | **Real** | The console fell back to 9 invented tenant rows whenever the tenant fetch came back empty |
| Placeholder data in financials and the chart | **Real, and the worst of it** | MRR rendered a hardcoded `money(2418540)` with NO fallback guard — $24,185.40 shown as measured revenue on every load — beside a fabricated "+4.7% MoM", "+$108,420 net new" and "1.9% churn". The 12-month revenue series was typed in. Now real or "—" |
| Regulatory review is static | **Partly real** | The feed is real data (5 rows live) but fell back to 5 mock rows, and its stats fell back to "2 / 2 / 31". Mocks gone. There is still **no admin CRUD** for regulatory updates — genuinely not built |
| Rule-pack cannot be updated or verified | **Open** | `PATCH /admin/rulepack` exists and the console can publish an override, but there is no verify/check-for-updates flow, automated or manual. Genuinely not built |
| Tenant isolation | **Passed** | Owner reported no issues |

**The honesty problem, stated once:** in a console used to decide who to
suspend and what to bill, invented figures are worse than an outage — they are
actionable and they look authoritative. Every figure now comes from the API or
renders "—", `getAdminData` records which sections failed, and the console says
so, because with the mocks gone an empty table would otherwise read as an empty
platform. `admin-console-honesty.test.ts` pins it.

**Still to build (not defects — never started):**
- Regulatory updates: admin create/edit/mark-reviewed
- Rule-pack: a verify / check-for-updates flow
- Net new + churn: needs a subscription-history table; nothing records one

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

### Phase 2b — Inline creation everywhere. DONE

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

### Phase 2c — Unit vocabulary for labour and equipment. DONE

`RateUnit` is a closed Postgres enum of cadences, so its dropdown genuinely
cannot be extended by a tenant. But labour sold per sq ft, or scaffold per
lift, is real. Both models gained a free-text `unitLabel`, mirroring materials.
Migration applied. Pickers, quote-line plumbing and rendering all done — the
last piece was the screens that read `RATE_UNIT_LABEL` directly instead of
calling `lineUnitLabel`, which is why a line sold by the metre printed
"30 units" (`437c235`).

### Phase 3 — Hiding. DONE (d1bdab4, a3a2794, 2b7989c, 16f75ed)

Tenants can hide material categories, material units and trades — and, since
`16f75ed`, saved materials, labour rates and equipment themselves. Hiding is
not deleting: the row stays, still referenced by existing materials and by
documents already sent.

**Hiding does NOT cascade** from vocabulary to items, by decision. Hiding the
word "Tiler" shortens the trade picker; hiding the rate "Tiler — Master"
removes it from the quote line. One click withdrawing several priced items at
once is not something to do silently, and restoring the word would then have to
guess which items to bring back.

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

## 4b. Release checklist — DO THIS BEFORE MORE FEATURES

Still true, and now more so: a large amount of work is committed and none of it
has met a real user. The audit found eleven substantive issues in a single
pass, and the great majority were invisible to the test suite. More code is not
what reduces that number.

**1. The production build RUNS here now (`c20c64a`).**
The long-standing "next/font cannot reach fonts.googleapis.com" diagnosis was
wrong — fonts fetch fine. The build was failing on a CSS Module violation in
the print rules: a selector containing no local class ("Selector is not pure")
is a hard error, and `:global()` in a comma list does not help because it makes
the whole list impure. Element-level print rules now live in globals.css.

**Run it before every deploy** — it catches a class of error that typecheck and
tests do not:

```
npm run -w @jamquote/web build
```

Two harmless noises in the output: an `ENOWORKSPACES` npm warning and a
`TypeError: ... reading 'os'` from Next's lockfile patcher. Neither fails the
build; look for `✓ Compiled successfully` and `✓ Generating static pages`.

**2. Migrations: nothing to remember.**
Render runs `prisma migrate deploy` on boot, so a pushed migration applies
itself. The earlier "apply these two by hand" step was stale advice and has
been removed. `invoice_issue_date` was applied and verified against live —
every existing invoice backfilled to the date reports already used, so no
figure moved.

**Advisory-lock timeouts are usually just contention.** P1002 on
`pg_advisory_lock(72707369)` hit again while applying the regulatory migration,
on a DIRECT endpoint — the holder was Render running its own boot-time
`migrate deploy` after a push moments earlier. Retrying a minute later worked.
So: if you have just pushed, wait and retry before assuming the pooler.

**3. Deploy API and web TOGETHER.**
Non-negotiable. 0c/0d renamed JSON fields, Phase 1 moved routes, and
`issueDate` is now required on the reports invoice type. A new API with an old
web, or the reverse, fails real requests rather than degrading.

**4. Then USE it, on a phone.**
Every round of the owner actually using the app has found defects the tests did
not. That remains the highest-yield activity available.

Worth walking specifically, since these are new and unexercised:
- The **invoice date** field: back-date one to last month, confirm it moves in
  Reports and prints with the year on the PDF.
- **Reports**: custom range, "This week", and Print. Check the printed sheet
  names its period and has no sidebar.
- **Settings → hide a saved material and a labour rate**, confirm each leaves
  the quote-line picker and can be restored.
- **The admin console** against real tenants: suspend, restore, change plan.
  Confirm no figure looks invented and the plan-mix chart matches reality.
- A quote line of each kind, including creating one of each inline.

---

## 4c. What to do next — recommendation

**Start with §4b: deploy and use it.** Not because the backlog is empty, but
because six audit parts produced eleven findings and only one of them was
something a test would have caught. The cheapest defects to fix are the ones
found before more code is layered on top of them, and there are two contractors
waiting who will find a different set again.

Adding them needs no work: signup exists at `/login` → "New to JamQuote?" →
"Create one" (business name, email, password creates the tenant). It is simply
not signposted as its own route.

Then, in order:

1. ~~Regulatory admin CRUD~~ — **done** (`847c9dc`).
2. ~~Rule-pack verify~~ — **done** (`4f52af7`), manual by design.
3. ~~The small open audit items~~ — **done** (`4ce1a8d`).

**Every audit finding is now closed.** Twelve substantive issues across six
parts: nine fixed, two answered as working-as-designed with the reasoning
recorded (equipment lines not merging; hiding not cascading), and one
deliberately not built with its reason stated (automated rule-pack checking has
no machine-readable source to check against).

So the next action is no longer a code change. It is §4b: deploy, add the two
contractors, and use it.

**Explicitly not next:** Phase 4 (Job Library depth) and Phase 5 (mobile).
Neither is blocking a contractor from quoting, and mobile is a rebuild that
should not start until the web app has survived real use.

## 4d. Open work — raised 2026-08-18, recorded before starting

Written down first so none of it is lost mid-session.

| # | Item | State |
|---|---|---|
| 1 | ~~MRR 100x too big on the overview~~ **DONE `2728003`** | `$400,000` on overview vs `$4,000` on Financials. MY regression: `money()` only formats, it does not convert cents, and when the hardcoded MRR was replaced with the real `mrrCents` the wrapper stayed. Financials uses `formatJmd`, which divides. **Fix: one helper for money everywhere in the console.** |
| 2 | ~~"Couldn't load 1 section"~~ | **DONE `fcfaea0`.** It was `/admin/suppliers` — removed from the API in #31, still called by the web on every admin load, result never consumed. Dead fetch, type and the "Suppliers added" tile all removed. |
| 3 | ~~Advisory lock / migrations~~ | **RESOLVED end-to-end `a7bb66c`.** The stranded session has gone and `prisma migrate deploy` now succeeds with the advisory lock ENABLED over the direct URL — the same command that timed out on P1002 an hour earlier. **Action for the owner: remove `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` from Render's environment**, so the lock resumes protecting concurrent migrations. `render.yaml` still declares it; drop it there in the same change. |
| 4 | **Tenant management options** | `/admin/me` was never the failing section, so capabilities were never the cause — that hypothesis is dead. The controls were present in the table but ACTIONS is the 7th column and scrolls off a narrow screen. `fcfaea0` adds plan/term, suspend/restore and delete to the tenant DRAWER, where clicking a business naturally leads. **Confirm on the deployed site.** |
| 5 | ~~Annual subscription with a long-term discount~~ | **DONE `2728003`.** `Subscription.interval` + `priceCents`; plan control is a select (Free / Pro monthly / Pro annual); MRR now sums each tenant's own monthly value instead of proCount x list price. |
| 6 | ~~Run the deployment~~ | **DONE.** Pushing IS deploying (both auto-deploy). Verified live: `/api/health` -> `{"status":"ok","db":true}`, `/api/admin/regulatory` -> 401 (today's code deployed), `/api/admin/suppliers` -> 404 (dead route confirmed gone). Free-tier cold start takes ~90s — a first-request timeout is not a failure. |
| 7 | **Database is Neon PROVISIONED VIA VERCEL** | Not a standalone Neon account — neon.tech shows an empty project list, which reads as the database having vanished. Vercel Storage is at TEAM level, not inside a project. Cost a diagnosis; now documented in `docs/DEPLOY.md`. |

---

## 4e. Subscription billing lifecycle — PROPOSED, not started

The ask, restated: see money actually received from tenants, warn them before a
subscription lapses, and have an account's standing follow from a recorded
payment instead of being kept by hand.

### What is actually there today (verified, not assumed)

| Fact | Consequence |
|---|---|
| `Subscription.status` is written ONCE, as the default `"active"`. Nothing ever updates it. | Every tenant reads "Active" forever. The console's Trial / Past due / Churned filters count a state nothing can set — permanently zero, the same defect as "Applied (YTD)" on the regulatory feed. |
| `renewsAt` is written and displayed, but nothing ever READS it to decide anything. | A subscription that lapsed a year ago is indistinguishable from one paid yesterday. |
| There is no record of platform revenue at all. | "Have they paid?" cannot be answered. MRR is contracted value — what tenants *should* pay — and was being read as income. |
| Quote creation is the ONLY thing the plan gates (`quotes.service.ts:121`). Invoicing, payments, clients, PDFs are all ungated. | Reverting to free is a reduced tier, not a lockout — a reverted tenant keeps trading and collecting. This is what makes automatic reversion at the cutoff reasonable (see 5). |
| A daily cron already exists (`QuoteExpiryService`, `@nestjs/schedule`). | The scheduling pattern is established; no new infrastructure needed. |
| Email is Resend, and the API already sends (password reset). | Transactional mail from the API is a known path. |

**The honest summary: there is no subscription lifecycle.** An admin sets a
plan and it stays that way forever. Everything below builds the missing loop.

### The design

**1. A ledger for platform revenue — `SubscriptionPayment`.**

`businessId, amountCents, currency, method, reference, paidAt, coversFrom,
coversUntil, recordedByUserId, note, voidedAt`.

This is NOT the existing `Payment` model. That one is a contractor's client
paying the contractor's invoice — tenant revenue. This is a tenant paying
JamQuote — platform revenue. Two different books of account that must never be
summed together; the naming has to make that impossible to confuse.

Void rather than delete, matching how invoice payments already work: a
mis-keyed receipt is history, not an accident to erase.

**2. Standing is DERIVED; only intent is stored.**

The existing invariant already says never model the same fact twice — it is why
`ProjectStage` has no `INVOICED` member. Same discipline here:

- **Stored** (decisions a human made): `plan`, `interval`, `priceCents`,
  `renewsAt`, `cancelledAt`, and suspension (already `Business.deletedAt`).
- **Derived** (a function of `renewsAt` + now + grace): `CURRENT`,
  `DUE_SOON`, `PAST_DUE`, `LAPSED`.

Deriving it kills the phantom filters and makes it impossible for the stored
status to drift from the dates. Pure function in `packages/core`, unit-tested
the way `rulePackVerification` is.

**3. Recording a payment IS the state change.**

One admin action, everything follows: extend `renewsAt` by one term from the
LATER of today or the current `renewsAt` (so paying early does not lose the
tenant days), write the ledger row, email a receipt, write an audit entry. The
admin never edits a date or a status by hand — which is the part being asked
for, and also the part that currently cannot be done at all.

**4. Reminders — and an honest problem with them.**

Schedule: 14 days, 3 days, on the day, and 7 days after lapse.

**The catch: a cron on a service that sleeps is not a scheduler.** Render's
free tier spins the API down when idle, so a midnight cron may simply never
fire. The existing quote-expiry cron has this same latent flaw and nobody has
noticed because nothing depended on it.

So the sweep must be idempotent and triggerable from several places rather than
trusted to fire once:
- a `SubscriptionNotice` ledger (`businessId, kind, periodEnd, sentAt`) with a
  uniqueness constraint, so a reminder can never be sent twice however often
  the sweep runs;
- run it on the daily cron, on boot, AND from an admin button;
- surface "last swept at" in the console so silence is visible rather than
  assumed to mean "nothing due".

**5. Non-payment reverts to FREE. It does not suspend.**

*Owner decision, 2026-08-18, and it changed my recommendation.*

I had argued against any automatic cutoff. That was overweighted, because I had
not checked what the plan actually gates: **quote creation is the only thing**
(`quotes.service.ts:121`). Invoicing, recording payments, clients, PDFs and
email are all ungated. So a reverted tenant keeps trading, keeps invoicing, and
keeps collecting money — they simply drop to 3 new quotes a month until they
pay. That is a fair, reversible consequence rather than an outage, so automatic
reversion at the cutoff is right.

The distinction to hold onto, because wiring these together would be a serious
mistake:

| Event | Trigger | Effect | Reversible by |
|---|---|---|---|
| **Revert to free** | Term ends unpaid | `plan = "free"`. All data kept. Still invoices, still collects payments. | Recording a payment |
| **Suspend** | **Breach of terms ONLY** | Access blocked | Admin restore |
| **Delete** | **Breach of terms ONLY** | Hard delete | Nothing |

Non-payment must NEVER suspend. Suspension and deletion are conduct sanctions,
never billing ones, and the code should read that way — the reversion path must
not touch `Business.deletedAt` at all.

The cutoff is `renewsAt` itself: reminders run before it, reversion happens on
it. No grace window, since the consequence is a reduced tier rather than a
lockout, and a tenant who pays late is restored the moment the payment is
recorded.

**6. Billing contact belongs to the subscriber.**

Renewal mail goes to a billing contact the tenant sets themselves — not to
whichever user happens to own the login. `Business.billingContactName` +
`billingContactEmail`, editable in the tenant's own Settings, falling back to
the owner's address while unset so a reminder is never silently undeliverable.
Staff can see it in the drawer but should not be the ones maintaining it.

**7. Payments cover a whole term.**

No partial credit. A recorded payment advances exactly one term, which keeps
the ledger and `renewsAt` trivially reconcilable — the alternative is
part-period arithmetic and a proration policy nobody has asked for. The form
should say so, and default the amount to the term price so the common case is
one click.

**8. No trial.** The free tier IS the trial: 3 quotes a month, indefinitely.
`freeQuotesPerMonth` currently defaults to 5 and must change to 3 (code default
AND the live pricing row). The console's phantom "Trial" filter goes at the
same time — it counts a state nothing sets.

### Decisions — ANSWERED (owner, 2026-08-18)

| Question | Answer |
|---|---|
| Grace period | None. Cutoff is `renewsAt`; reminders come before it. |
| Who receives email | A billing contact the subscriber provides. |
| Partial payments | Not allowed — whole terms only. |
| Trial | None. Free tier is 3 quotes/month. |

### Notification schedule — SETTLED (owner, 2026-08-18)

| Kind | When | Sent to |
|---|---|---|
| `RENEWAL_30` | 30 days before cutoff — **annual terms only** | billing contact |
| `RENEWAL_14` | 14 days before cutoff | billing contact |
| `RENEWAL_3` | 3 days before cutoff | billing contact |
| `RENEWAL_0` | on the cutoff date | billing contact |
| `REVERTED` | when the term ends unpaid and the plan drops | billing contact |
| `RECEIPT` | on every recorded payment | billing contact |

The 30-day notice is annual-only: a year's fee is a budgeting decision, and a
fortnight is not enough warning for it. Monthly terms start at 14 days, where a
30-day notice would arrive before the previous term had even been paid for.

`REVERTED` is deliberately its own message rather than a fifth reminder. The
reminders ask for something; this one reports a change that has already
happened, and the two must not read alike.

Each row is one `SubscriptionNotice` keyed `(businessId, kind, periodEnd)` with
a UNIQUE constraint. That is what makes the sweep safe to run repeatedly —
which it must be, because a cron on a service that sleeps cannot be trusted to
fire exactly once (see 4).

---

## 4f. Phase A — the build order, ready to start

Everything here is decided; no further input needed. Written as a checklist so
a fresh session can pick it up without re-deriving anything.

**1. Schema + migration — DONE (`4be35c7`)**
- `SubscriptionPayment`: `id, businessId, amountCents, currency, method,
  reference?, paidAt, coversFrom, coversUntil, recordedByUserId, note?,
  voidedAt?, createdAt`. Index `(businessId, paidAt)`.
- `SubscriptionNotice`: `id, businessId, kind, periodEnd, sentAt`.
  `@@unique([businessId, kind, periodEnd])`.
- `Business`: `billingContactName?`, `billingContactEmail?`.
- Both new tables need `onDelete: Cascade` on `businessId` — the #19 failure
  mode, and a tenant hard-delete must not strand billing rows.

**2. Core — DONE (`8cd50cb`)**
`packages/core/src/billing/subscription.ts`, 25 tests. Exports
`subscriptionStanding`, `nextTermEnd`, `dueNotices`, `shouldRevertToFree`,
`SubscriptionStanding`, `NoticeKind`, `DUE_SOON_DAYS`.

Everything else in Phase A can be built against these without re-deriving the
rules. One thing worth knowing when wiring the sweep: `dueNotices` returns at
most ONE notice and picks the window the tenant is actually in, so a sweep
missed for a week does not send a burst — call it per subscription per run and
persist whatever it returns.

**3. API — DONE (`4be35c7`)**
- `POST /admin/tenants/:id/subscription-payments` — record. Advances
  `renewsAt`, sets `plan = "pro"`, writes the ledger row, audits, queues
  `RECEIPT`. Amount defaults to the term price; whole terms only.
- `POST /admin/subscription-payments/:id/void` — void, never delete.
- `GET /admin/tenants/:id/subscription-payments` — history for the drawer.
- All gated on `MANAGE_TENANTS`.

**4. Free tier to 3 — DONE (`4be35c7`)**. Live row was already 3; the code default was 5.
- `pricing.service.ts` default 5 -> 3, AND update the live `PricingConfig` row
  (the default only applies when no row exists).

**5. Tenant-facing — DONE (`ce8e3f4`)**
- Billing contact fields in the tenant's own Settings, beside the business
  details. Falls back to the owner's email while unset, so a reminder is never
  silently undeliverable.

**PHASE A COMPLETE** (`4be35c7` backend, `ce8e3f4` UI). Staff can record a
payment and the account state follows: term extended, plan set, ledger written,
audited. Void retracts the term only when nothing has happened since.

**PHASE B COMPLETE** (`50d3547`). Financials shows *Collected this month* from
the ledger and a *Past due* count beside *MRR (contracted)*, with labels saying
which is which. The tenants pill and filters are derived from
`subscriptionStanding`, so Trial / Past due / Churned — which counted states
nothing could set and were permanently zero — are gone, replaced by
Current / Due soon / Past due / Free.

**PHASE C COMPLETE** (`a7d1f27`). Sweep service (boot + daily cron + admin
button), email templates, revert-to-free, and a last-swept indicator that warns
past 36 hours. The revert sets `plan = "free"` and nothing else; a test asserts
`deletedAt` is never in the write.

**Phase D remains: WiPay self-serve card renewal — still blocked on
credentials** (§5). Until then renewals are staff-recorded, which the ledger
already supports.

**Operational follow-ups from the Phase C dry run are closed** (`f62d3c2`),
except Blackwood's missing term, which is a business decision rather than a
fix. Two of the three turned out not to be what the plan said they were:
RESEND_API_KEY was already set, and the missing recipient was a role-filter bug
in the sweep rather than absent data. Worth remembering — the dry run reported
symptoms, and checking each one changed the diagnosis.

### Open after the Phase C dry run

- **Jamquote (the tenant) has NO reminder recipient** — no billing contact and
  no OWNER-role user with an email. Its reminder falls due around 2026-09-04
  and will be counted as a failure. Set a billing contact in that tenant's
  Settings.
- **Blackwood has no renewal date**, so it is skipped entirely — correct for
  the manual-upgrade path (never billed, so never chased), but it also means it
  will never revert. Record a payment against it to put it on a real term.
- **RESEND_API_KEY must be set on Render** or every notice logs an error and
  counts as a failure. `/api/health` reports `email: true` when it is present.

**Explicitly NOT in Phase A:** the sweep, the emails, and the revert
transition. Those are Phase C and depend on `dueNotices` existing first. Phase
A ends with a working money loop that staff drive by hand.

**Invariant to carry into Phase C:** the revert path sets `plan = "free"` and
NOTHING else. It must not touch `Business.deletedAt`. Suspension and deletion
are conduct sanctions, never billing ones.


---

## 4g. Tenant CSV exports for accountants — PROPOSED, later

A contractor should be able to hand their accountant a file instead of a login.
Requested 2026-08-18; not scheduled.

### What is already captured — and it is the valuable half

`gctTreatment` is stored **per line item** (STANDARD / ZERO_RATED / EXEMPT) on
both quotes and invoices, not just as a document-level rate. That is exactly
the shape a GCT return needs, and most small-business tools do not keep it.
Payments carry method, amount and date, so cash movement is reconstructable.
Invoice numbers are sequential, which is what makes an export auditable.

So the sales side is genuinely ready to report on.

### The gap that decides the scope

**There is no expense or purchase record anywhere in the schema.** No Expense,
Purchase or Bill model; materials carry a price they are SOLD at, never a cost
they were BOUGHT at with a supplier invoice behind it.

That matters more than it sounds. A GCT return nets output tax (charged on
sales) against input tax (paid on purchases). JamQuote can produce the output
side exactly and the input side not at all — so an export can support a return
without being able to produce one. Saying that plainly on the export is part of
the work; letting an accountant assume otherwise would be worse than shipping
nothing.

The real decision is therefore not "which CSVs" but **whether JamQuote starts
capturing purchases at all.** Options, in increasing order of commitment:

1. **Sales-side only.** Export what exists, labelled honestly. The accountant
   brings purchases from elsewhere. Smallest, useful immediately.
2. **Lightweight expense capture.** A contractor logs a supplier receipt:
   date, supplier, amount, GCT treatment, category, optional photo. Enough for
   input tax and a profit figure, not full bookkeeping.
3. **Cost tracking per job.** Purchases attach to a Project, so the app can
   answer "did this job make money?" — the question contractors actually ask.
   The largest, and the most valuable to the user rather than their accountant.

**DECIDED (owner, 2026-08-18): option 3 — purchases attach to a Project.**

I recommended 1 and was talked out of it, correctly. Option 3 is barely more
work than 2 *provided it is done now*: a nullable `projectId` on the purchase
ledger. Building 2 first and adding job attribution later means migrating rows
and reworking every report that reads them. And 3 answers the question the
contractor actually has — an accountant's file is a by-product of job costing,
not the other way round.

Three constraints it depends on:

**a. `Purchase.projectId` must be NULLABLE.** Fuel, phone, insurance and tools
are business costs with no job behind them. A required project would force
contractors to invent a fake one, which poisons every job-profit figure
afterwards. Unattached purchases still count towards input tax and overheads;
they just do not land on a job.

**b. `Invoice` needs its own `projectId` — it does NOT have one today.** Only
`Quote` carries it. So project REVENUE is currently reachable only via
invoice -> quote -> project, and an invoice raised from scratch (the #27
from-nothing path) has no route to a project at all. Costs would be
attributable and revenue would not, which makes "did this job make money?"
unanswerable for exactly the invoices most likely to be ad-hoc extras. Add a
nullable `Invoice.projectId`, backfilled from `quote.projectId` where a source
quote exists, and defaulted from the quote at convert time.

**c. Purchases are their own ledger, never a field on MaterialFavourite.** A
material is a price list entry; a purchase is an event with a date, a supplier,
an amount and a tax treatment. Conflating them is how a price list starts
lying about history.

### Design rules for the exports themselves

**Cash basis and accrual basis are different files, never one.** Invoiced (what
was billed) and collected (what arrived) are different numbers, and this app
already keeps them apart in Reports. An accountant given one column labelled
"revenue" will assume whichever basis they normally use and be wrong half the
time. Every export names its basis in the filename AND in a header row.

**A detail export must sum to its summary.** The line-level file and the
document-level file for the same period must reconcile exactly — that is a
testable invariant, and the money seam is where this project has already been
bitten twice.

**Excel is the target, not "CSV" in the abstract.** UTF-8 **with BOM**, or
Excel mangles accented names and long TRNs. Money as plain decimal strings with
a separate currency column, never cents and never pre-formatted with symbols.
Dates ISO-8601. TRN as text, so leading zeros survive.

**Exports exclude DRAFT documents** and say so. A draft is not a claim on
anyone. And because invoices stay editable, an export is a snapshot: note the
generation timestamp in the file so two exports of the same period that differ
can be explained rather than argued about.

### Candidate files (Phase 1, sales side)

| File | Grain | For |
|---|---|---|
| `invoices-issued` | one row per invoice | accrual revenue, receivables |
| `invoice-lines` | one row per line, with `gctTreatment` | GCT output tax by treatment |
| `payments-received` | one row per payment, with method | cash basis, bank reconciliation |
| `clients` | one row per client, with TRN | the customer listing an accountant asks for first |

Generated server-side and streamed, not built in the browser: a tenant with
three years of history should not be limited by a phone's memory, and the same
generator can later back a scheduled email to the accountant.


## 4h. Tenants table on narrow screens — small, worth doing

Confirmed working, but the ACTIONS column is the 7th of seven and needs
horizontal scrolling to reach.

**The problem is not the scroll, it is what scrolls away.** The business name
is column one, so by the time the buttons are visible the name is not. Deciding
to suspend or delete an account without its name on screen is the wrong thing
to ask of anyone.

Recommended fix, in order of value for effort:

1. **Sticky first column** — `position: sticky; left: 0` on the name cell, with
   a background so rows do not bleed through. The name stays put while the rest
   scrolls. Cheap, and it fixes the actual defect rather than the symptom.
2. **Drop ACTIONS below the tablet breakpoint.** The drawer now carries plan,
   term, suspend and delete with room to breathe, so on a phone the row should
   simply open it. Keeping both surfaces on a 390px screen is what forced the
   width in the first place.
3. **Keep the inline actions on desktop.** They are genuinely faster when
   working through several tenants, and there is space for them there.

Deliberately NOT a card layout: the table is scannable and staff compare rows
down a column (who is past due, who is on annual). Cards lose that.


## 4i. Sending quotes to a contractor's clients — BLOCKS TESTING

Raised 2026-08-19. Today a quote email goes out as
`QUOTE_FROM_EMAIL ?? "JamQuote <onboarding@resend.dev>"` with a single GLOBAL
`QUOTE_REPLY_TO`. Two separate faults:

1. **`onboarding@resend.dev` is Resend's shared test sender.** It delivers only
   to the account owner's own address. A contractor emailing their client sends
   into a void — and the UI reports success, because the send is accepted.
2. **Reply-to is global, not per-tenant.** Even once mail flows, a client
   pressing Reply reaches whatever that env var names, not the contractor.

Fault 2 is a code bug and is cheap. Fault 1 needs a verified domain and cannot
be coded around.

### The constraint everything else follows from

You cannot put an address in `From:` unless you are authorised to send for that
domain. SPF, DKIM and DMARC exist to stop exactly that, and the penalty is not
a rejection you can see — it is silent spam-foldering plus damage to the
sending reputation of every other tenant sharing the platform.

**This bites hardest in this market.** Most Jamaican contractors use
`@gmail.com`. Gmail publishes a DMARC policy, so `From: someone@gmail.com` sent
from our servers fails authentication outright. Per-tenant domain verification
therefore does NOT help the majority of tenants — they have no domain to
verify.

### Three approaches, in order of cost

**1. Send as JamQuote, reply as the contractor.** (Recommended now.)

```
From:     Blackwood Construction (via JamQuote) <quotes@jamquote.com>
Reply-To: owen@blackwoodconstruction.jm
```

One verified domain, SPF + DKIM + DMARC set once, works for every tenant with
no per-tenant setup — including gmail users. The contractor's name is what the
client reads; replies go to the contractor. Stripe, Xero and QuickBooks all
ship variants of this, so clients are used to it.

Needs: a verified domain in Resend, `QUOTE_FROM_EMAIL` set, and **reply-to
taken from the tenant record instead of the global env var** — which is worth
doing regardless of which approach wins.

**2. Per-tenant verified sending domains.** (Later, for the few who want it.)

The contractor adds DKIM/SPF records to their own DNS; Resend's domain API
verifies them; `From:` becomes genuinely theirs. Real benefit for an
established firm with `@theirfirm.com`, and useless for the gmail majority.
The hidden cost is support: talking a contractor through DNS records is not a
call this business wants to take often.

**3. Send from the contractor's own mailbox via OAuth.** (Best fit, biggest
build.)

Gmail/Microsoft OAuth, send through their account. The mail is genuinely from
them, lands in their Sent folder, and inherits their existing deliverability
with clients who already know them. Given how many contractors here are on
Gmail, this is the approach that actually matches the market — but it is OAuth
consent screens, token refresh, and scope review.

### Recommendation

Do **1** now: it unblocks contractor testing this week and is a day of work
plus DNS. Treat **3** as the commercial answer once there are enough tenants to
justify it, and **2** only if a specific tenant asks.

### Also required before real volume

- **Bounce and complaint handling.** Resend webhooks -> a suppression list. One
  contractor repeatedly emailing a dead address degrades delivery for every
  other tenant on the shared domain.
- **A verified-sender check in the UI.** If sending is not configured, the
  quote screen should say so BEFORE the contractor clicks send — today the send
  is accepted and appears to work.
- **PDF as attachment vs link.** Attachments raise spam scores and size limits;
  a signed link is lighter and gives a viewed-at signal. Worth deciding
  deliberately rather than by default.


---

## 5. Standing outstanding items

### Blocking or risky

| Item | State |
|---|---|
| **Nothing has met a real user** | Every feature listed in §2 is unexercised. The largest risk here, and the reason §4b comes before §4c. |
| ~~`npm run build` cannot run here~~ | **FIXED `c20c64a`.** The next/font diagnosis was wrong; the build was failing on a CSS-Module purity error in the print rules. `npm run -w @jamquote/web build` now passes locally — run it before every deploy. |
| **Deploy API and web TOGETHER** | Field renames, moved routes, and `issueDate` now required on the reports invoice type. Mismatched halves fail requests rather than degrading. |
| ~~Migration endpoint~~ | **CLOSED `a7bb66c` + `f62d3c2`.** `directUrl` + `DIRECT_URL` runs migrations unpooled; the stopgap is out of `render.yaml` and `DIRECT_URL` is now declared there (required — Prisma will NOT fall back to the pooled URL). **Last manual step: delete `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK` from the Render dashboard** if it was set there by hand. |
| Card checkout (WiPay) | **Blocked** on API credentials. Manual record + void work. |

### Open audit items — not yet built

| Item | State |
|---|---|
| ~~Regulatory updates: admin CRUD~~ | **DONE `847c9dc`.** Create/edit/review/reopen/delete behind MANAGE_RULEPACK, every mutation audited. |
| ~~Rule-pack verify~~ | **DONE `4f52af7`.** Staleness, source links, "Mark verified today". Manual by design — see the automated-check row below. |
| ~~Rule-pack maintainable without a release~~ | **DONE `9cf52c3`.** Statutory contributions can be added, renamed and retired, and the source list edited, from the console. |
| Net new / churn on the admin console | Removed rather than faked. Needs a subscription-history table — though `SubscriptionPayment` is now most of one, so this got cheaper. |
| ~~Jamquote has no reminder recipient~~ | **FIXED `f62d3c2` — and it was a code bug, not missing data.** The fallback queried role=OWNER only, and that tenant's sole account holder is an ADMIN. Now: billing contact -> OWNER -> any addressable user. All three live tenants resolve. |
| ~~`RESEND_API_KEY` on Render~~ | **Already set.** `/api/health` reports `email: true`. The row was wrong. |
| **Blackwood has no renewal term** | Still open, and now VISIBLE: the tenants table shows "no term set" in warn colour (`f62d3c2`). A pro plan with no term is a silent free ride — never reminded, never reverts. Needs a decision: record a real payment, or leave it as a deliberate comp. |
| Automated rule-pack update check | **Deliberately not built.** Needs a machine-readable feed of Jamaican tax/statutory rates; none exists (TAJ publishes prose). A scraper over a page that can be reworded would give confident wrong answers about tax rates — worse than an honest "last checked 14 months ago". Revisit only if a real feed appears. |
| ~~Coverage hint~~ | **DONE `4ce1a8d`.** A material line with no coverage configured now says where coverage comes from. |
| ~~Job custom unit shows "day"~~ | **DONE `4ce1a8d`.** Root cause found: JobForm's equipment picker set `rateUnit.toLowerCase()`, stamping the literal "day" over a typed unit. All three component pickers now agree and none invents a unit. |
| ~~Weekly bars on the sales chart~~ | **DONE `4ce1a8d`.** Bucket size now follows the range: daily / weekly / monthly. |

### Known, low priority

| Item | State |
|---|---|
| Delete `seed-business-blackwood` | Reports have now been checked against it. NOT purely fixtures: 4 quotes hand-made 12 Jul, material edited 9 Aug — read before deleting. |
| MaterialFavourite FK drift (#40) | Live is `RESTRICT`, schema says `SET NULL`. Safe direction, but deleting an in-use unit errors instead of nulling. |
| Quote email logo | Listed as missing, but the owner sent a quote WITH the logo during audit part 3. Stale row — confirm which surface was meant before acting. |
| `Business.logoUrl` | Dead column, superseded by `BusinessLogo`. |
| Sidebar during view-as-tenant | Shows the admin's own business name; the banner names the tenant. Cosmetic. |
| Equipment not in mobile/sync | The equipment library is web + API only. |

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
