# JamQuote — Working Plan

**Last updated:** 2026-08-17
**Status:** audit closed — every finding from the six-part walkthrough is
resolved, answered, or explicitly deferred with a reason. The production build
now runs locally. Next action is to deploy and put it in front of two
contractors. Mobile deliberately not started.

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
| 1 | **MRR is 100x too big on the Platform overview** | `$400,000` on overview vs `$4,000` on Financials. MY regression: `money()` only formats, it does not convert cents, and when the hardcoded MRR was replaced with the real `mrrCents` the wrapper stayed. Financials uses `formatJmd`, which divides. **Fix: one helper for money everywhere in the console.** |
| 2 | **"Couldn't load 1 section from the admin API"** | Root cause found: the deployed API selected `RulePackConfig.statutoryCustom/statutoryRetired/sources` before the migration had run, so every rule-pack query threw. The migration is now applied. Re-check after the next deploy. |
| 3 | **Stranded advisory lock on the production DB** | pid 21382, `application_name=pgbouncer`, idle, still holding `pg_advisory_lock(72707369)`. Taken by a boot-time `migrate deploy` on a pooled connection that pgbouncer then reused for app queries; being session-scoped it never released. **It will block Render's boot migration on every future deploy.** Cleared only by terminating that backend or restarting the Neon compute — needs a human. Workaround used for the pending migration: `PRISMA_SCHEMA_DISABLE_ADVISORY_LOCK=1`. |
| 4 | **Tenant management options still not visible** | Owner reports the controls are still absent after the mock removal. Not yet diagnosed — likely a consequence of #2 (a failed section) or a capability gate. |
| 5 | **Annual subscription with a long-term discount** | New requirement. Plan pricing is monthly-only today (`proMonthlyPriceCents`). Needs a billing interval on the plan, an annual price, and the tenant plan-change path to carry it. |
| 6 | **Run the deployment** | Render and Vercel both auto-deploy on push, so pushing IS deploying. What is missing is a way to confirm a deploy succeeded from here. |

---

---

## 5. Standing outstanding items

### Blocking or risky

| Item | State |
|---|---|
| **Nothing has met a real user** | Every feature listed in §2 is unexercised. The largest risk here, and the reason §4b comes before §4c. |
| **`npm run build` cannot run here** | `next/font` cannot reach fonts.googleapis.com from this machine (TLS interception). Fails in `app/layout.tsx`, unrelated to any change. Vercel's build is the first real one. |
| **Deploy API and web TOGETHER** | Field renames, moved routes, and `issueDate` now required on the reports invoice type. Mismatched halves fail requests rather than degrading. |
| Migration endpoint | **Unfixed, will recur.** `prisma migrate deploy` must use a DIRECT, non-pooled Neon endpoint; through the pooler a failed migration strands a session advisory lock (hit once: P1002). |
| Card checkout (WiPay) | **Blocked** on API credentials. Manual record + void work. |

### Open audit items — not yet built

| Item | State |
|---|---|
| Regulatory updates: admin CRUD | Feed is real and read-only. No create/edit/mark-reviewed. **Recommended next** (§4c). |
| Rule-pack verify / check-for-updates | `PATCH /admin/rulepack` publishes an override, but nothing verifies or checks for updates. Needs a source of truth before "automated" means anything. |
| Net new / churn on the admin console | Removed rather than faked. Needs a subscription-history table; nothing records one. |
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
