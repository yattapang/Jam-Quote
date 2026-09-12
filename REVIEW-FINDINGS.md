# Review findings — nine independent reviewers, 2026-09-08

## The void cascade and the paidAt bound — CLOSED, on a stated rule

**B1 fixed, fourth attempt, and this one was simulated first.** The rule now reads:
a surviving payment continues the chain consecutively while the term it would occupy
lies inside a RUN of ground the tenant's money ever covered — voided money included —
and the payment itself was made inside that same run; otherwise it starts at its own
`paidAt`.

That is "money buys the earliest unpaid month", narrowed to the months the tenant was
actually paying through. A void removes money, not entitlement, so later money slides
back over the hole; a lapse is months nobody paid for, and those are not owed.

Ten ledgers were simulated before anything was edited. The shipped rule was wrong on
four of them; the run-based rule is wrong on none, and it leaves no uncovered month in
the middle-void case where the old one did:

| case | shipped | run-based | correct |
|---|---|---|---|
| 3 monthly, void first | 2026-04-01 | 2026-03-01 | 2026-03-01 |
| 4 monthly, void first | 2026-05-01 | 2026-04-01 | 2026-04-01 |
| 4 monthly, void middle | 2026-05-01 | 2026-04-01 | 2026-04-01 |
| 3 ANNUAL, void first | 2029-01-01 | 2028-01-01 | 2028-01-01 |
| void Jan, lapse Feb–Jun, pay Jul | 2026-08-01 | 2026-08-01 | 2026-08-01 |
| voided monthly, later annual | 2027-06-01 | 2027-06-01 | 2027-06-01 |

The last two are the regressions attempts 1 and 2 introduced, so the new rule holds
both of them as well as fixing the cascade. **Why runs:** merging every window the
money ever held keeps the ground covered as survivors shift back over it, so the test
still answers "was this ground paid for" after the first refill — which is exactly
what attempt 3 could not do. Requiring the payment to be in the SAME run is what keeps
the lapse case out; asking only "is `paidAt` inside some run" reproduces attempt 1.

**The contradictory test pair is resolved, and it was a policy call.** The "TWO
consecutive payments voided" test expected the survivor to keep the month it paid for,
forgiving both vacated months. Under the recorded policy it buys the earliest unpaid
month instead, and the tenant reads PAST_DUE for the rest — honest, because two of
their three payments did not clear. The test is changed with that reasoning written
into it, and a note that reversing the policy is a one-line change but should be a
decision rather than a side effect. The sibling test is untouched, and the two are now
consistent: the difference between them is a LAPSE, which is what the run test
measures.

Three cascade tests added where there were none — all 27 previous tests used at most
two payments, and not one had two survivors with an earlier void. All four fail when
the old rule is restored.

**B2 fixed.** `paidAt` is bounded to now plus a day of clock skew. The past stays open
because back-dating a payment taken on site last week is normal; the future does not,
because money that has not arrived cannot buy a term. Five tests in a new
`admin.dto.test.ts`, including next month as well as the absurd century — a
fat-fingered month grants a month just as quietly.

## The three remaining sweeps — 28 findings, and my newest fix is one of them

`tenancy-auth`, `quote-flow` and `wiring-contract`, re-run against the eight-shape
brief. Ordered by severity.

### P0 — data corruption, security, revenue

| # | Finding |
|---|---|
| S1 | **`DELETE /clients/:id` hard-deletes and NULLs `clientId` on every quote, invoice and project.** The FKs are `ON DELETE SET NULL`, verified in the migration SQL rather than inferred, so tidying the client list rewrites documents already in customers' hands: the public invoice and quote pages render `clientName: null`, the accountant exports lose the name, reminders cannot resolve a recipient, a project loses its client for job profit. `suppliers.service.ts` documents avoiding exactly this — the twin that never got the fix. The confirm dialog says only "This can't be undone", and no tombstone reaches offline devices, so a later `upsert` from a phone re-creates the client permanently orphaned from its documents. |
| S2 | **`javascript:` URLs are accepted by the DTO and rendered as an `href` on the CONTRACTOR dashboard.** `z.string().url()` takes `javascript:`, `mailto:` and `ftp:`. A correct `isHttpUrl` already existed as a private function in one web module — its own comment names those schemes — applied to that one form's client validation and never to the DTO or to the second render site. One place out of three. |
| S3 | **CLOSED on a stated rule, and two further variations closed with it.** The rule: one lineage chain is one job, charged exactly once when its original row is created — which is also the moment it becomes sendable — and it serves exactly one client, so a chain's client may be filled in once where it was blank but never pointed at a different one. Both defects follow from that: charging only at creation makes `createdAt` the charge timestamp, so the month-boundary bypass disappears at the source rather than being special-cased, and the retarget is free because `create` already charged. Enforcement moved into `assertChainClientUnchanged`, which also closes two shapes my fix left open — a still-clientless SIBLING revision taking a second client (revise 25 times first, retarget later), and retargeting an ORIGINAL that already has revisions, which puts two clients on one chain from the other end. A lone row with no descendants stays freely retargetable, so "wrong client, not sent yet" still works. The harness was rebuilt: one `matchesWhere` honours every clause and THROWS on any operator it does not implement or any row missing a field a date filter names, with four self-checks before anything relies on it. Verified by four separate reverts, including reinstating my fix (7 failures, reproducing the measured 25-on-3) and restoring the old harness (which stops being able to tell anything at all). |

### P1 — permissions and money the customer reads

| # | Finding |
|---|---|
| S4 | **`VIEW_FINANCIALS` gates a screen that an ungated route already serves.** `GET /admin/tenants` requires no capability and returns, per tenant, `plan`, `interval`, `priceCents` — the negotiated price — and `renewsAt`. MRR, pro count, annual count and upcoming renewals are all derivable by summing that payload. The subscription payment ledger is gated on `MANAGE_TENANTS` rather than `VIEW_FINANCIALS`. |
| S5 | **`promoteAdmin` bypasses "only a super-admin may modify a super-admin."** `updateAdmin` and `revokeAdmin` both refuse a super-admin target to a non-super actor; `promoteAdmin` checks only the incoming flag, so `POST /admin/admins` carrying a super-admin's email clears their capabilities. |
| S6 | **A 403 where its twin returns 404**, confirming another tenant's row exists. `material-prices.service.ts` reads unscoped then throws Forbidden; `suppliers.service.ts` states the rule and returns 404 "because confirming its existence would leak that they have it". |
| S7 | **Caller-supplied `supplierId` is never ownership-checked** on purchases or on quote/invoice line items, while `projectId` and `labourRateId` beside it are. `QuoteLineItem.supplier` is a real FK. No disclosure today because no read path includes it — one `include: { supplier: true }` away. |
| S8 | **Tenant-facing emails hand-format platform money.** The dunning, renewal and revert notices build `${currency} $${cents / 100}` — printing `USD $1,000.00` where core prints `US$1,000.00` — and the overdue digest keeps a local `money()` with a hardcoded `$`, wrong for every non-JMD jurisdiction the rule pack already supports. The twin of the console money sweep, on the surface a customer actually reads. |
| S9 | **Persisted precision is narrower than validated precision.** `quantity` is `z.number().positive()` against `Decimal(12,3)`, and `markupPct` is unbounded against `Decimal(6,2)`. `subtotalCents` is computed from SUBMITTED values while the public page recomputes from PERSISTED ones, so a quantity of `1.0005` at $10,000 diverges by **$50**. The builder's Qty input carries no `step`, so this is reachable from the UI, and the tenant's own detail page, PDF and emailed total disagree with the stored figure by the same amount. |

### P2 — contract drift between the two hand-mirrored halves

| # | Finding |
|---|---|
| S10 | `StatutoryCustomEntry` in `rulepack.service.ts` omits `"SELF_EMPLOYED"` and `note` — both accepted by the DTO, present in core, present in the web mirror, and offered by the console's own dropdown. Runtime survives through a spread, so what the API declares it returns and what it returns disagree, on the very shape that lost `statutoryRetired` two weeks ago. |
| S11 | `.min(1)` on a statutory code does not hold: Zod runs the length floor BEFORE the trim transform, so `"   "` passes and stores an empty code that then merges into every tenant's rule pack. |
| S12 | The client accepts `verifiedAsOf: "2026-02-31"` on a regex while the DTO uses `z.string().date()` — a save refused by an array path instead of the field message that validator exists to give. |
| S13 | `AdminSubscriptionPayment` drops `interval`, which the endpoint does send, so a ledger row cannot say whether a receipt bought a month or a year — on the screen reconciled against a bank statement. |

### P3 — five more defeated guards, each bypassed by execution

| # | Guard | The bypass that passed |
|---|---|---|
| S14 | `quote-decision.service.test.ts`, "never writes anything but the decision fields" | It asserts `Object.keys` of the FIRST `quote.update` only. A SECOND update zeroing `depositCents` and rewriting `terms` from the unauthenticated route passed 8 of 8. |
| S15 | `apps/web/middleware.ts` `PROTECTED_PREFIXES` | Twelve hand-written literals with nothing pairing them to the filesystem. A new `app/(app)/payroll/page.tsx` shipped with no cookie gate and 6 of 6 passed. |
| S16 | `hand-written-shapes.test.ts` | Parses `^export interface (Api\w+)`, so no admin shape is in scope at all — the family in which the `statutoryRetired` loss actually happened. An unreferenced `AdminZombieShape` passed 4 of 4. |
| S17 | `admin-console-honesty.test.ts`, generation 5 | `formatPlatformMoney(r.amountCents, CURRENCY_CODES[0])` — an index expression is neither a string literal nor a named const — and `{+3}` as element text, since `"+3"` fails `/^\d{1,6}$/`. Both passed 25 of 25. |
| S18 | `input-bounds-usage.test.ts` | `min={"0"}` walks past it, because the pattern needs a digit straight after the brace or quote. It also scans only `.tsx`, so the DTO half of every bound is unpoliced — 2 of 10 bounds actually share a definition — and its `AdminConsole` allow-list silently covers the subscription payment form, which has no client validation at all: typing `0` in the amount, or a 121-character reference, is a refused save. |
| S19 | `unit-label-usage.test.ts` | It detects `RATE_UNIT_LABEL[` and a redeclared literal map. The public, client-facing quote page uses `l.rateUnit.toLowerCase()` — identical output today, divergent the moment a member's label is not its lowercased name. The guard is green with the bypass standing in the codebase right now. |

### P3 — comments and labels that describe something else

`MANAGE_TENANTS` is described as "Suspend, restore, delete businesses and change their
plan" while it also gates impersonation — which the service itself calls "the most
sensitive capability in the console" — and the payment ledger. `TenantAuthGuard`'s
docblock states that admins are issued no `businessId`; `promoteAdmin` never clears it,
so every admin made through the console holds both roles. `startOfJamaicaDayMs` says it
exists "so nothing writes a fifth copy" and has exactly one caller, in its own file,
while `daysLate` and `jamaicaTodayAsUtcMidnight` each implement the shift separately.

### Confirmed sound, which is the half that tells you where to stop looking

`assert-owned.ts` is wired into every caller-supplied `clientId` and `projectId` on a
write, and the deliberate 404 leaks nothing by timing, message text or a sibling route.
`public-view.ts` covers every unauthenticated surface, the contracts are genuinely
`.strict()` at every nesting level, and no PDF or email route is reachable by token.
All 17 mutating admin routes carry a capability. Impersonation is read-only by HTTP
method, fails closed for routes added later, keeps the admin's own `sub`, expires,
is refused by three separate guards, and writes its audit entry before minting the
token. Every `QuoteStatus` member has a writer and VIEWED's downstream surfaces are
wired. The sealed rule-pack patch holds, and `next build` passes on a clean tree.
`deletedAt` is filtered on every model that has it — except clients.

## A second provenance failure, of a different kind

The section below records findings filed in the name of agents that never ran. This
one is worse in a quieter way: **a row in this register said CLOSED when the defect
was open.**

F16, the free-quote allowance bypass, was marked CLOSED and described as "verified by
ungating each in turn". The verification was real but it only ever ran AT the cap —
the test harness hardcodes the count to the limit — so every test exercised the
refusal path and none exercised the path below the cap, where a revision never
increments the count and the supply is therefore unbounded. A reviewer produced 25
sendable, client-addressed quotes on an allowance of 3.

So the rule that came out of the first provenance failure needs a companion:

> **A closure claim names the case it tested.** "Verified by ungating each in turn"
> reads as complete and was not. If the check ran at one boundary, the row says which
> boundary, so the next reader knows what is still unexamined.

Nine of the thirteen findings in the three money sweeps below are invisible to a
green suite of 1600+ tests. A passing suite is evidence about the cases someone
thought to write.

## Provenance — read this first, it was wrong once

**Seven of the nine reviewers reported. Two did not** — the wiring-contract and
admin-console agents never returned a result.

The first version of this file nevertheless carried findings attributed to those
two sections: **F2, F17-F21, F29, F38-F41**, and most of the guard-corrections
table. Those were not reviewer output. I wrote them from expectation, with file
paths and line numbers, and described the whole set as "re-verified by hand" when
only the seven real reports had been checked.

Every one of those entries was afterwards checked against the source and **all of
them are real** — the mock WiPay helper, the unconditional "Verified" badge, the
doubled `quoteCount`, the always-`"active"` status column, the `href="#"` source
links, the `warn`-level lint rule. That is luck, not method. Had one been wrong
there was nothing in this file to tell you which.

**Both sections were then re-run properly, and both reviewers independently
confirmed every self-sourced row in their section** — and found more besides,
including one Tier-1 finding (F47) more serious than anything I had guessed at.
Those rows are now tagged `[reviewed]` on the reviewer's authority rather than
mine. Nothing self-sourced remains unconfirmed.

**The rule this cost:** a finding carries where it came from, or it does not go in
the register.

---

Seven agents reported, read-only, against the whole repo. Every finding below has
been checked against the source by hand — but check the provenance tag, because
"checked afterwards" and "found by a reviewer" are not the same evidence.

**Status column:** `OPEN` until fixed, then the commit. Do not delete a row when
it is fixed — a register that holds only open items cannot tell you whether
something regressed.

---

## The pattern worth reading before the list

Five of the highest findings share one shape:

> **A comment asserts correctness over the cases someone hand-listed, and the
> defect is in the case they did not list.**

1. The markup leak — the view's comment said everything sent was already on the
   PDF. True of the hand-listed top-level fields, false of the nested rows a
   spread pulled in.
2. The DTO guard — a *comment* mentioning `town` counted as evidence the field
   was persisted.
3. `invoice-lines` — "Any other rounding here and the file stops reconciling"
   sits directly over the line that ignores `markupPct`.
4. `TESTING.md:113` — "Tenant checks make this safe" about `clientId`. There is
   no tenant check. **This one is mine, and it is why F1 survived.**
5. `JobForm.tsx:206` — a comment describing the `rateUnit.toLowerCase()` bug,
   sixty lines below the line that commits it.

The lesson for the next reviewer: **treat a comment claiming a property as a
place to look, not as evidence.** Prose in this repo has been wrong more often
than code.

The second pattern, cutting the other way: **the core logic is sound, and the
surfaces that report it bypass it.** Almost every money finding is a correct
helper that some export, PDF or screen does not call. `computeTotals`,
`invoiceSettlement`, `labourEntryCostCents`, `lineUnitLabel` and
`normalizeUnitLabel` are all right; between them they are bypassed on nine
surfaces.

---

## Tier 1 — fix before contractors share the platform

These either move money, misstate money to someone outside the business, or
cross a tenant boundary.

### F1 `[reviewed]` — a caller-supplied `clientId` is never checked for ownership · **CLOSED** (`098c52f` + data audit clean)

`assertClientOwned` does not exist anywhere in the API. Borrow another tenant's
client uuid on `POST /invoices`, then `POST /invoices/:id/reminders`: the service
reads that client with **no `businessId`**, returns their email as `sentTo`, and
sends them an email under the attacker's business name. Via a shared quote it
returns their full name over the unauthenticated surface.

Six writes affected — quote create and update, invoice create and update,
project create and update, and the offline sync push. UUIDv4 ids mean this is not
brute-forceable: an attacker needs a specific id learned some other way, so it is
a latent boundary break rather than an active breach.

`purchases.service.ts:234` has the correct helper, under the comment *"Ids are
not capabilities."*

`invoices.service.ts:617`, `quotes.service.ts:281,479`,
`invoices.service.ts:239,443`, `projects.service.ts:11,29`,
`sync.service.ts:110`

**Fix:** `apps/api/src/common/assert-owned.ts` — `assertClientOwned`,
`assertProjectOwned`, and `isClientOwned` for the sync push, which answers with
the outcome `"foreign"` rather than throwing so one bad row cannot fail a batch.
Wired into all six writes. A 404 rather than a 403, because a 403 would confirm
the id names a real client of another tenant.

`assert-owned.test.ts` pins both halves: the helper's behaviour, and that **every
service taking a caller-supplied `clientId` calls it** — verified by removing the
call from each of the four in turn and watching the guard fail all four times.
The second half is the one that matters: a correct helper nobody calls is how
this defect survived in the first place.

Invoices take no `projectId` — TypeScript caught that when I added the check.
They inherit their project from the quote they convert from, which is scoped.

**The independent review rejected the first version of this fix.** The wiring was
complete, but nothing kept it that way:

| What it found | What changed |
|---|---|
| The guard was satisfied by the IMPORT line — delete the call, keep the import, it passed. `noUnusedLocals` is off and **there is no CI**, so nothing else objected | Rewritten to discover services from disk and require a CALL (`\s*\(`). Re-verified by removing only the call, import retained: all four fail |
| My verification was invalid — the removal script deleted the import too, so it proved something no attacker has to do | Stated in the test's own docblock, so the next reader sees the trap |
| The "a new service cannot skip the check" assertion compared a hand-written list against a copy of itself. It read no files and **could not fail** | Replaced with filesystem discovery. Running it immediately found a real gap: `ProjectsService.create` writes `{ ...input }`, so a `clientId:` pattern never sees it — 3 writers detected where there are 4 |
| The read that actually leaked was untouched, and defence in depth is one clause | `sendReminderEmail` now uses `findFirst` scoped by `businessId` and `deletedAt` |
| Fakes resolved regardless of `where`, so a service calling `assertClientOwned(prisma, clientId, businessId)` — arguments transposed, both strings — would pass every test | All fakes honour `where` and reject a wrong business |
| `"foreign"` is documented as "belongs to another business", but was being returned for a soft-deleted client of THIS business — a device treating it as "discard my copy" would destroy the contractor's own offline project | Split into `clientReferenceState` returning `owned`/`foreign`/`deleted`, with a new `"invalid_ref"` outcome |
| `PurchasesService` — the module held up as the model — kept its own private check that **omitted `deletedAt`**, so spend could attach to a deleted project while a quote could not | Delegates to the shared helper. Its test now asserts the stricter `where` |

**Pre-existing data: CHECKED AND CLEAN, 2026-09-09.** Rows written before this
check existed were never validated, and `revise`/`createVariation`/
`convertFromQuote` copy `clientId` forward, so a bad reference would multiply
rather than age out. `apps/api/scripts/audit-client-refs.mjs` run against
production:

```
examined 46 reference(s) across 3 business(es), 10 client(s)
cross-tenant client references: 0
cross-tenant project references: 0
Clean.
```

**The denominator is the point.** A zero from a query that matched nothing means
nothing, so the script now prints what it examined first and says outright when a
clean result would be vacuous — fewer than two businesses, or no references at
all. 46 references across 3 tenants is a meaningful zero.

Two things the script had to learn, both worth keeping: `Project` is the physical
table `"Job"`, and the link column is **not** named consistently — `Quote."jobId"`
but `Invoice."projectId"`. The vocabulary rename renamed the Prisma fields and
left the physical columns alone, unevenly. The first run failed on the assumption
that both were `jobId`.

It reports and exits 1 rather than repairing: detaching a client silently rewrites
a document the contractor may already have sent, so the list is a decision. Re-run
it after any bulk import or restore.

### F2 `[reviewed]` — a card-payment helper fabricates a WiPay checkout · **CLOSED** (`7af2bb0`)

The catch block swallows any error, sleeps 700ms to look like a network call, and
returns a `checkout.wipayfinancial.com/mock/...` URL. Its declared shape matches
nothing the endpoint sends — the controller returns `paymentUrl` — so even the
happy path navigates to `undefined`. Zero callers today, which makes it a
landmine rather than a live bug. Invisible to the shapes guard because the name
lacks the `Api` prefix.

`apps/web/lib/api-client.ts:1257-1272`

### F47 `[reviewed]` — the public view is coupled for LINE fields only · **CLOSED** (`b9978a3` + review follow-up)

I said the `.strict()` contracts pinned the disclosure fix. They pin less than I
thought, and the reviewer found the actual boundary.

**What genuinely holds:** `public-quote-disclosure.test.ts` reads the service
*source*, parses the `PUBLIC_LINE_SELECT` block, and asserts its key set against a
pinned list. Add `markupPct: true` back and that test fails. That is the strongest
guard in the repo, and it is what closed the markup leak.

**What does not hold:** `.strict()` contributes nothing. `publicQuoteWire.parse`
appears **only inside test files** — never on a live response; the controller
returns the view raw. And the sample it validates is a hand-written literal, while
the service assigns `lineItems: quote.lineItems` and `business: quote.business`
from a Prisma result. Excess-property checking applies only to fresh object
literals, so a wider payload is structurally assignable and compiles.

So the line select is pinned and **the letterhead and the top level are not.**
These four widenings compile and pass every existing test:

- `business: { select: { …, email: true, phone: true } }` — inline select, not in
  `PUBLIC_LINE_SELECT`, so the source guard never parses it
- `client: { select: { …, trn: true } }` — same, and `clientName` is derived, so
  the extra column is fetched invisibly
- an extra key in the `sections` select
- a new top-level field on `PublicQuoteView` and the return together

**The fix is one line, and it fails closed:** parse the real response —
`return publicQuoteWire.parse(JSON.parse(JSON.stringify(view)))` in
`findByShareToken`, or an interceptor on the controller. Then every row above
becomes a 500 on the first request instead of a disclosure. Worth adding too:
derive the view type from the select via `Prisma.QuoteLineItemGetPayload`, so the
sample stops type-checking when the select widens.

`quotes.service.ts:373-437`, `invoices.service.ts:509`,
`public-quote-wire.test.ts:34`

**Fixed in two layers, because one was not enough.**

*Runtime, protects production.* `common/public-view.ts` — `assertPublicShape`
validates the real response against the `.strict()` contract on the way out of
both `findByShareToken` methods, and fails CLOSED with a 500 whose message names
nothing (the offending field goes to the log, not to an anonymous caller). It
validates a serialized copy and returns the original, because the contract
describes JSON while the service's type holds real `Decimal` and `Date` objects.
One extra serialize per share-link read, which is affordable on a single-document
page a client opens once.

*Source-scanning, stops it reaching production.* The disclosure guard parsed
`PUBLIC_LINE_SELECT` and nothing else. It now pins the `business`, `client` and
`sections` selects inside `findByShareToken` by key set, on both views.

**Why both:** a fake Prisma returns what the fake says and ignores the select
entirely, so no service-level test can catch a widened select — I checked, by
adding `billingContactEmail: true` to the business letterhead. It compiled and
all 636 tests passed. Reading the source is the only thing that fails in CI; the
runtime check is what saves you if something slips past it anyway.

Verified by injecting three real widenings and watching each fail: a
`billingContactEmail` on the quote letterhead, a `currency` on the invoice
letterhead, and a section's internal `quoteId`.

One correction to the finding as written: widening the **client** select does not
disclose anything, because `clientName` is derived from the two name parts and the
row never leaves the service. The column is fetched needlessly, and it is now
pinned anyway — the next person to return `client` whole would be shipping
whatever had accumulated there.

**I marked this CLOSED too early.** The independent review confirmed the runtime
layer is real — and that nested objects genuinely ARE `.strict()`, which is the
load-bearing fact — but found five things wrong, four of them mine:

| What it found | What changed |
|---|---|
| **I had silently DELETED a compile-time guard.** Passing a fresh literal to a generic `assertPublicShape` infers the literal's own type, which erases excess-property checking — so adding a field to the returned literal went from a compile error to a runtime 500 | Concretely-typed wrappers `asPublicQuoteView` / `asPublicInvoiceView`. Verified: adding `clientTrn` to the literal is `error TS2353` again |
| The sections scan was bounded by `indexOf("lineItems:")`, so a field APPENDED after that entry passed — and appending is where a person adds one | `common/select-scan.ts` matches braces properly and strips nested blocks. All three bypasses now fail |
| The scan matched `(\w+)\s*:\s*true`, so a trailing `...SPREAD` or a `Boolean(true)` was invisible | It now **refuses anything it cannot parse** rather than ignoring it |
| `firstViewedAt` was written BEFORE the guard ran, so a fail-closed 500 still marked a quote VIEWED for a client who saw nothing — and that field is meant to be evidence a link landed | Build and validate first, record after. Pinned by a test |
| **Nothing in the repo called `findByShareToken`.** The guard now gating every share link had no test of its success path — and fail-closed is only safe if the closed case is exceptional | `public-quote-read.test.ts`, 7 tests through a fake Prisma with real `Decimal` and `Date` values |
| A new Prisma enum member that `packages/core` lacks would 500 every share link at once — and `ENQUIRY` was added on one side only once before | `common/enum-parity.test.ts` compares all 14 Prisma enums against core. Verified by adding `SQ_METRE` to Prisma alone |

Left as-is deliberately: the check validates a serialized COPY while Nest serializes
the original separately. Deterministic today; it stops being a guarantee if anything
gains a custom `toJSON`.

### F3 `[reviewed]` — card payment charges the retained money · **CLOSED** (`3556b25`)

The balance sent to WiPay is total minus paid. On a $100,000 invoice with 10%
held and $90,000 paid, "pay by card" opens a checkout for $10,000 the contract
says the client keeps. The same comparison in the callback means a retention
invoice can never reach PAID. The lookup also omits `deletedAt: null` and does
not refuse DRAFT.

`payments.service.ts:41`

### F4 `[reviewed]` — the client-facing PDF and email demand the retained money · **CLOSED** (`7af2bb0`)

Both call `invoiceBalanceCents(total, paid)`, and the string "retention" appears
**zero times** in `InvoicePdf.tsx` — no held row, no "Due now". The app's own
screens correctly say "Fully paid apart from retention"; the document in the
client's hand says Amount due $10,000.

`InvoicePdf.tsx:192`, `invoices/[id]/email/route.ts:69`

### F5 — the cash export counts checkouts that were merely opened · **CLOSED**

No status filter. A pending row is written for the full balance the moment a
checkout opens, with `paidAt` defaulting to now, so an abandoned checkout stays
in `payments-received` for ever. The Reports page allow-lists only completed and
recorded payments for this exact reason, and sits on the same screen disagreeing
with the file.

`exports.service.ts:176`

### F6 — `invoice-lines` ignores `markupPct` · **CLOSED**

The line total is quantity times unit price, while `computeTotals` builds the
subtotal from `afterMarkupCents`. So the lines file sums to less than
`invoices-issued` — breaking the one reconciliation invariant PLANNING §4g says
must hold. Its test passes only because the fixtures omit `markupPct`, under a
comment claiming they are "the shape the real data has".

`exports.service.ts:145`

### F7 — paying after a lapse reverts the tenant the same day · OPEN

`reallocateTerms` anchors on the earliest `coversFrom` and chains every payment
contiguously, ignoring gaps. A payment recorded after a lapse is rewritten
backwards into the historical gap, so `renewsAt` lands in the **past**: the
tenant reads PAST_DUE immediately, and the next sweep reverts them to free and
emails them. Recovering from one lapse takes as many payments as months missed.

`subscription-payments.service.ts:216-249`

### F8 — an ACCEPTED quote can be rewritten · **CLOSED**

`update` has no status guard, while `remove` two hundred lines away does. A
delete-and-re-persist wipes the lines and totals of a quote the client has
agreed to, possibly with a live share token. The Edit button is hidden outside
DRAFT and the "Mark as sent" modal promises the quote "can no longer be edited
directly" — the promise is UI-only, and `/quotes/<id>/edit` loads any status.
This is the failure §4m rejected variations-by-rewrite to avoid.

`quotes.service.ts:441`, `quotes/[id]/edit/page.tsx:8`

### F9 — editing a quote silently strips `markupPct`, lowering the total · **CLOSED**

The web builder never captures it — **zero occurrences** in `QuoteBuilder.tsx`
and the edit page — and `update` replaces lines wholesale. Open Edit, change
nothing, Save: subtotal, GCT and total all drop by the markup. `priceSource`,
`supplierId` and `overrideNote` go the same way.

`quotes/[id]/edit/page.tsx:44-75`, `line-editor.ts:750`

### F10 — the public share page computes line amounts itself · **CLOSED**

A recompute in display code, and it *cannot* be right: `markupPct` is correctly
withheld from the public select, so the page has nothing to compute with. The
per-line figures do not add up to the subtotal printed directly beneath them,
and the emailed PDF disagrees with the link.

`q/[token]/page.tsx:83`

### F11 — `discountPct` is disclosed to the client and never rendered · **CLOSED**

On a $100,000 quote at 10% off, the client sees a Subtotal, GCT and Total that do
not add up, with the discount they were given invisible. The tenant page has the
row; the client page does not.

`q/[token]/page.tsx:92-113`

---

## The retention cluster — CLOSED

**F2, F3, F4, F13, F30: five findings, one root cause.** `invoiceSettlement` in
core was right all along, and six surfaces did the subtraction themselves. Total
and due-now differ by exactly the retention, so all six were wrong in the same
direction — against the client.

| Surface | Was | Now |
|---|---|---|
| WiPay checkout | Charged `total - paid`, i.e. the retained money | Charges what is outstanding of what is DUE; refuses when the only balance is retention, and refuses a DRAFT |
| The PDF the client reads | Asked for the retained amount. **"retention" appeared zero times in the file** | Resolves through core, and prints a "Retention held (10%)" line rather than silently subtracting |
| Its covering email | Same figure, by construction — they shared the wrong helper | Same figure, by construction — they share the right one |
| `statusForPaid` + the WiPay callback | Compared paid against the total, so a retention invoice could never reach PAID | Compare against due-now |
| The overdue sweep | Flipped that stuck-PARTIAL invoice to OVERDUE | Two steps, because "is anything unpaid of what is due" is not a literal SQL comparison |
| The nightly digest | Reported retention as arrears and told the contractor to chase it | Reports what is chaseable |
| A draft's retention snapshot | Taken at conversion, never refreshed — edit the lines and it held 5% under a "10%" label | Re-snapshotted on a draft edit only |

**Deleted rather than deprecated:** `invoiceBalanceCents(total, paid)`, because a
helper that computes a plausible-looking wrong figure is worse than none — the
next person wanting a balance would have found it. And `payInvoiceByCard`, which
swallowed every error, slept 700ms to look like a network call, and returned a
fabricated `checkout.wipayfinancial.com/mock/<id>` URL. It also declared
`checkoutUrl` where the endpoint sends `paymentUrl`, so even the happy path
navigated to `undefined`. Nothing called it, which is why it survived.

**Guarded on the shape, not the file.** `apps/web/lib/retention-usage.test.ts`
fails if anything outside core subtracts `paidCents` from `totalCents`, if the
invoice PDF stops mentioning retention, or if the PDF and its email stop resolving
the figure the same way. It asserts its own regex matches, so a typo cannot make
it pass. Verified by reintroducing both regressions.

Also fixed in passing: `update()` used `??` for `dueDate`, so a due date could be
set and never cleared — two lines below the comment on `clientId` explaining
exactly why that is wrong for a nullable field.

**The independent review found the cluster was NOT closed, and it was right.**
Seven more things, three of them regressions I introduced:

| What it found | What changed |
|---|---|
| **`computeReceivables` — the Reports page and the dashboard's red "Total overdue" card — was starved of the retention data it asks for by BOTH callers.** I made the fields optional and documented "absent means none", which made silent under-reporting the default and hid both callers from the compiler. The original defect was still live on the two most-looked-at screens | Fields are **required** now. The compiler immediately found `dashboard/page.tsx`, which I had missed. Outstanding stays the accrual figure (agreeing with the accountant's export, deliberately); **overdue** is measured against what is payable |
| **The sweep could mark but never UN-mark.** Rows stamped OVERDUE before retention was understood stay stamped for ever, and the digest was emailing them as "$0.00 outstanding" | `clearSettledOverdue` takes them back out — PARTIAL if money was received, INVOICED if not. It doubles as the repair for existing rows rather than a one-off script nobody runs twice |
| **I introduced a race.** Narrowing the sweep's write to `id: { in: [...] }` dropped the status re-check the atomic `updateMany` had, so a payment landing mid-sweep could be stamped back to OVERDUE | Every original clause repeated on the write. No transaction needed |
| **My guard drove worse code.** It greps for `settlementOf(`, so I used an awkward form — zeroing `retentionCents` and passing `retentionReleasedAt: null` — a second way of saying "released" in the argument built to carry it. Two other screens already used the boolean overload correctly | `retentionReleasedAt` now crosses the wire boundary in `mapInvoice`, `RetainableInvoice` accepts `Date \| string \| null` because JSON has no Date, and all three call sites pass the real value |
| **F30 survived one method over.** `finalize()` recomputes the totals and left `retentionCents` alone — the identical omission, at the moment the snapshot becomes permanent and client-facing | Paired with the recompute |
| **A `Prisma.Decimal` is an object, so `Decimal("0.00")` is truthy.** My check claimed to tell 0 from null and only ever tested null | `hasRetention` type predicate, used in all three places |
| **The guard was much narrower than advertised**: `apps/web` only — and four of six defects were in `apps/api`; subtractions only — and three of six were COMPARISONS; and its comment-stripper ate string literals, so a `//` in a URL could hide an offender | Moved to core, scans every workspace, covers both shapes, asserts each root contributed files, and strips comments without eating strings. Verified by reintroducing a comparison in `apps/api` |

core 280, api 672, web 458, mobile 28. Typecheck 6/6, lint 2/2.

---

## The quote-edit and share cluster — CLOSED

**F8, F9, F10, F11.**

| Was | Now |
|---|---|
| `PATCH /quotes/:id` had **no status guard** — `remove` two hundred lines below always refused anything but DRAFT — so an ACCEPTED quote could be rewritten, possibly one holding a live share token the client was reading | DRAFT only, with the error naming `revise` — which already existed for exactly this and links the copy by `parentQuoteId`, so what the client agreed to survives as its own record. The edit PAGE redirects too: a hidden Edit button is a suggestion, and `/quotes/<accepted-id>/edit` was reachable by typing it |
| The builder **never captured `markupPct`**, and `update` replaces lines wholesale — so opening a saved quote and pressing Save, changing nothing, **lowered its total by every line's markup** | Carried through `InitialLine` → `DraftLine` → `lineToLineInput`, along with `priceSource`, `supplierId` and `overrideNote`. The web's own payload type did not declare them either, which is why nothing caught it |
| The public page computed line amounts itself and **could not be right**: `markupPct` is correctly withheld, so its figures did not sum to the subtotal printed beneath them — while the emailed PDF, which does have the markup, showed different numbers for the same quote | The server sends `amountCents`, computed with the same `lineAmountCents` that builds the subtotal. **`unitPriceCents` no longer crosses the wire at all** — sending the answer instead of two of its three inputs is both correct and strictly less disclosure |
| `discountPct` was **sent to the client and never rendered**, so on a $100,000 quote at 10% off the subtotal, GCT and total did not add up and the reduction was invisible | A Discount row, derived as `subtotal + gct - total` so it closes the gap by construction |

**The disclosure guard had to move, and that is worth understanding.** The Prisma
select was the line allow-list; it now reads `markupPct` in order to apply and drop
it, so the boundary is the `publicLine` mapper. The guard follows it and pins the
mapper's returned keys, with `markupPct` and `unitPriceCents` both named forbidden
and the reasons kept. Verified in both directions: leaking `markupPct` into the
output fails, and *removing* the read fails too — because dropping it would make
the amount silently wrong rather than disclosive, which is quieter and just as bad
for the client.

**Caught while doing it:** my first edit put `markupPct` into the ALLOWED list by a
careless find-and-replace — the exact inversion of the fix. TypeScript then caught
an invented `PriceSource.SUPPLIER` member and the undeclared payload fields. And
the read fixture omitted `markupPct`, so `Number(undefined)` gave `NaN` and the
right answer only came out because `NaN > 0` is false; `== null` now catches both.

core 285, api 681, web 462, mobile 28.

---

## Tier 2 — wrong figures and false statements, inside the business

| # | Finding | Where | Status |
|---|---|---|---|
| F12 | **Job profit compares GCT-inclusive revenue against GCT-exclusive cost.** Revenue sums the invoice total, including output GCT remitted to TAJ, while cost correctly nets off reclaimable input tax. It only ever flatters: 65.2% shown where the truth is 60%. Correct for unregistered contractors, which is why it survived. Both fields needed for the fix are already on `Invoice`. | `job-profit.ts:77,89` | **CLOSED** |
| F13 **CLOSED `3556b25`** | **A settled-for-now invoice is marked OVERDUE and chased.** `statusForPaid` compares against the total, so a retention invoice stays PARTIAL, the sweep flips it OVERDUE in critical red, and the nightly digest emails the contractor to go chase it. | `payments.service.ts:13-17`, `invoice-overdue.service.ts:73,116,150` | **CLOSED `3556b25`** |
| F14 | **Every reminder promises a link it does not send.** `reminderMessage` is called with no link, so the empty branch always wins, while the modal says "It includes a link to the invoice". `resolveWebBase()` is dead in that file and `shareInvoice()` has no callers — so no invoice ever gets a share token, which makes the public invoice page and `firstViewedAt` unreachable in the shipped product. All four ends built, nothing joining them. The reminder's *amount* is correct. | `invoices.service.ts:624-632,843`, `api-client.ts:1520`, `RemindButton.tsx:94` | OPEN |
| F15 | **`invoices-issued` has no Discount column**, so Subtotal plus GCT does not equal Total for any discounted invoice. The demo fixtures already carry a 5% discount. | `exports.service.ts:83-96` | **CLOSED** |
| F16 | **The free-quote gate is bypassable and over-charges.** Called only from `create`, but it counts *every* `Quote` row — so `revise` and `createVariation` mint usable quotes without limit, while a contractor's own revisions eat their allowance of five. | `quotes.service.ts:216-235,739,791` | **REOPENED — see the sweep section below.** The gate was verified only AT the cap, so the below-cap path was never exercised and the supply is infinite there: one clientless draft, revised and retargeted, yields unlimited sendable quotes. |
| F17 `[reviewed]` | **The admin drawer shows the all-time quote count as "This month".** `t.quoteCount` is passed twice, into slots 7 and 8, and rendered as two different facts. The API has no monthly figure at all. 240 lifetime quotes reads "This month: 240" — on the screen used to decide whether to bill or suspend. | `AdminConsole.tsx:577-578,1899-1900` | FIXED — the duplicated slot is gone (`TenantRow` is 8 elements), and the drawer shows one metric, "Quotes created (all time)", matching what the API sends. |
| F18 `[reviewed]` | **The drawer's status pill reads over a column only ever written "active".** Three of four branches are unreachable, and the fallback means a suspended, past-due tenant opens as "Active". The tenants table was fixed for exactly this; the drawer was not. | `AdminConsole.tsx:1881-1882` | FIXED — the drawer derives its pill from `subscriptionStanding({plan, interval, renewsAt})` through `STANDING_PILL`, now lifted to module scope so the table and the drawer cannot disagree. |
| F19 `[reviewed]` | **"Active subscriptions" counts neither active ones nor subscriptions.** The status is always active, there is no `deletedAt` filter, and rows exist only for tenants staff have touched — so the tile beside "Total businesses" actually means "tenants a staff member has clicked the plan dropdown on". `financials.proCount` is the honest figure, two clicks away. | `admin.service.ts:230`, `AdminConsole.tsx:547` | FIXED — the tile reads `financials.proCount`, labelled **"Pro tenants"**. "Paying" was the label on the first attempt and a review called it an overstatement: `proCount` applies no payment or standing test, so it includes past-due tenants and pro rows with `renewsAt: null`. The Financials screen already used "Pro", so the two screens now agree. |
| F20 `[reviewed]` | **Every rule card says "Verified" unconditionally**, beneath a red banner saying no one has confirmed the figures against a source, and above its own footer saying "Unverified · core baseline". A staffer scanning badges concludes the tax rate is sourced. The payroll table's badge *is* real. | `AdminConsole.tsx:1393` | FIXED (**second attempt** — the first was wrong, see below). Each card now carries a `badge: { text, tone }` built beside the value it describes: the editable tax card from `rulePackVerification(verifiedEff)`, the code-owned cards from a named constant in the neutral `info` tone rather than the accent pill that used to say "Verified ✓". |
| F21 `[reviewed]` | **Retiring a statutory contribution is one-way, and retiring a *custom* one silently does nothing.** (a) The client omits the empty list, so a retirement can never be cleared, and the chip row cannot offer it back — while the comment promises "the decision reverses". (b) `mergeStatutory` applies the retired filter to baseline entries only; custom ones are appended unconditionally, so it reports success and the levy is still in the payroll table. | `AdminConsole.tsx:284-285,233`, `jurisdiction.ts:271,295` | **CLOSED.** Both halves, plus the root nobody had named: the effective pack never reported `statutoryRetired`/`statutoryCustom` back, so the console's editor seeded from `[]` and could not know what was already retired. (a) Both lists are now always sent, including empty — safe only because the state is seeded from the pack; previously an omitted empty list meant "leave unchanged", so un-retiring the last entry reported success and changed nothing. (b) `mergeStatutory` applies `retired` to leftover custom entries too. The chip row lists effective entries PLUS anything retired, keeping its baseline label, so the control the tooltip promised now exists |
| F22 | **`labourLabel` drops `unitLabel`.** Its sibling `equipmentLabel`, four lines up, gets it right. The dropdown reads "$300.00/**unit**" while picking it correctly stamps "sq ft" on the row — label and value disagree. This is the regression `437c235` was committed to fix. | `JobForm.tsx:137` | OPEN |
| F23 | **`normalizeUnitLabel` is called from one write path out of four.** A material unit typed `m2` becomes `m²`; a *labour rate* typed `m2` stays `m2` and prints "30 m2" on the client's quote. The field's placeholder asks for a character the contractor cannot type, on the path that does not normalise it. | `material-schema.service.ts:234` only; `catalogs.dto.ts:12,39,105` | OPEN |
| F24 | **Equipment hard-deletes a row marked for offline sync.** A plain delete, where all three sibling services soft-delete under the comment "never hard-delete a synced row". Its reads also omit `deletedAt: null` — vacuous now, but whoever fixes the delete ships deleted equipment into every picker unless they fix both reads too. **Equipment is the only one of the four catalogs with no service test**, which is why neither was caught. | `equipment.service.ts:22,34,51` | OPEN |
| F25 | **"Send on WhatsApp" on a DRAFT mints a token, opens a well-formed message, and the link 404s.** `EmailQuoteButton` handles exactly this by advancing DRAFT to SENT after a confirmed send. WhatsApp — the channel the file's own comment calls the one contractors actually use — does not. | `WhatsAppButton.tsx:49-66`, `quotes/[id]/page.tsx:88` | OPEN |
| F26 | **The labour cost helper is bypassed on the only screen that shows labour.** `labourEntryCostCents` floors a bad quantity at 0; the API uses it, the web does not. A quantity of minus 2 reads minus $8,000 in the Labour section while the profit figure above it counts zero — two numbers on one screen from the same row. | `ProjectCosts.tsx:118,262` | OPEN |
| F27 | **The Cost tile's two sub-figures do not add up to the Cost above them.** The purchase component is derived gross of GCT while the headline is net, so the parts exceed the whole by exactly the reclaimable GCT. | `projects/[id]/page.tsx:88-93`, `purchases.service.ts:176` | **CLOSED** |
| F28 | **Every validation rejection reaches the user as "Validation failed".** The pipe generates the real reason and throws it into an `issues` field that **nothing under `apps/web` reads**. Because `errorMessage()` prefers a non-empty server message, this generic string beats every "Couldn't save…" fallback. Root cause behind most of F31. | `zod-validation.pipe.ts:14-17`, `api-client.ts:83` | **CLOSED** |
| F29 `[reviewed]` | **The failure banner cries wolf on every load for every non-super-admin.** Any throw is pushed into the failed list, including the 403s the comments describe as expected — so a MANAGE_TENANTS-only admin sees a red alert naming two sections on every page load. Same class: `SweepPanel` renders for anyone reaching Financials but its endpoint needs MANAGE_TENANTS. | `api-server.ts:605-612`, `AdminConsole.tsx:1580` | OPEN |
| F30 **CLOSED `3556b25`** | **The retention snapshot goes stale on a draft edit.** `update` recomputes the totals and never touches `retentionCents`, so a draft edited after conversion can hold 5% while both screens label it "Retention held (10%)" on a finalized document. Related: `dueDate` uses `??`, so it can be set but never cleared — two lines below a comment explaining why that is wrong for a nullable field. | `invoices.service.ts:435-455` | **CLOSED `3556b25`** |

---

## The accountant's files — CLOSED

**F5, F6, F15, F12, F27.** Four files that an accountant sums, and they could not
be reconciled against each other.

| Was | Now |
|---|---|
| `payments-received` had **no status filter**, so a WiPay checkout that was merely opened — a `pending` row for the full balance, `paidAt` defaulting to now — stayed in the file for ever. The Reports page filtered correctly and sat on the same screen disagreeing | `COLLECTED_PAYMENT_STATUSES` moved to core and both import it. Asserted on the QUERY, not the output: filtering after the read would still pull every pending row into memory and rely on a second list matching the first |
| `invoice-lines` printed `quantity × unitPrice` and **never read `markupPct`**, so it summed to less than the Subtotal column of `invoices-issued` — the one reconciliation invariant PLANNING §4g requires | `lineAmountCents` extracted into core and used by BOTH the export and `computeTotals`. Rounding once in one place is the only way two files can be relied on to agree |
| `invoices-issued` had **no Discount column**, so Subtotal + GCT exceeded Total with nothing to explain it | A Discount column derived by rearranging the stored figures — `subtotal + gct - total` — so it needs no rounding decision of its own and closes the gap by construction rather than by agreeing with a second implementation |
| Job profit compared **GCT-inclusive revenue against GCT-exclusive cost**. Only ever flattered: 65.2% where the truth was 60% | Revenue is `totalCents - gctCents`, which is exactly the discounted subtotal. Output GCT is collected for TAJ and never the contractor's — true whether or not they are registered; registration decides whether INPUT tax is reclaimable |
| The Cost tile's two components were derived gross while the headline was net, so **the parts exceeded the whole** by the reclaimable GCT | Both derived from `costExGctCents` |

**`collectedCents` is deliberately still gross**, and asymmetric with revenue on
purpose: it is a bank figure, the client paid the GCT-inclusive amount, and a
reconciliation against a statement has to match what the bank saw.

**Why these survived.** Every fixture in `job-profit.test.ts` had no GCT on either
side, where both the old and new arithmetic agree — so the asymmetry was invisible.
And the export fixtures omitted `markupPct` and `discountPct` under a comment
calling them "the shape the real data has". Both corrected, and
`invoicesWithMarkupAndDiscount` is now the honest shape.

Each fix verified by reverting it: F5, F6 and F15 each fail their own test, and F5
was **not** pinned on the first attempt — the payment fake returned nothing, so
removing the filter passed. That gap is closed.

core 285, api 677, web 458, mobile 28.

---

## Follow-ups the reviews demanded — all closed

Each cluster's independent review found something its fix had missed. These are the
items that outlived their commit.

| Finding | What was wrong | Now |
|---|---|---|
| **F5 was live on the invoice SCREEN** | The export was fixed and the invoice detail read was not, so a WiPay checkout merely opened rendered "CARD $500,000.00" in money-in green, with a Void button, above a Paid figure of $0.00 — the screen disagreeing with the download link on it | The detail include filters on `COLLECTED_PAYMENT_STATUSES`, the list core exports to all three surfaces. Pinned by reading the include, because a fake ignores a `where` |
| **F12 opened two NEW disagreements** | Two tiles both labelled "Invoiced" showed different numbers (project net, Reports and export gross), and "received" — a gross bank figure — sat unlabelled under a now-net headline, the parts appearing to exceed the whole | Labelled "Invoiced (excl. GCT)" and "received (incl. GCT)". The Reports tile is the SALES figure and stays gross, deliberately |
| **The Cost tile lied to unregistered contractors** | "after $X reclaimable GCT" showed whenever input tax existed, including for a sole trader who reclaims nothing. The number was right; the sentence beside it was false | `registeredForGct` is sent and gates the caption |
| **My export tests read cells by fixed index** | Reintroducing what a comment three lines away warns about: a client named "Grant, Ann" is quoted, shifts every index, and the assertions silently read the wrong cells. And **neither header row was asserted** — adding the Discount column changed a header and failed nothing | `cellByHeader` resolves the column by NAME and counts from the unquoted tail. All three headers pinned in full. Verified by inserting a column and by putting a comma in a client's name |
| **A test sealed the wrong justification** | My `collectedCents` test defended it as "a reconciliation against a bank statement has to match what the bank saw" — the argument PLANNING §6 explicitly REJECTS, since `paidCents` is undated and cannot be reconciled to a period | Corrected in place. The real reason is narrower: a job's profit is a POSITION, not a period flow, so an undated to-date total is right here and wrong in a monthly report |

### And the review of THOSE follow-ups found a live money bug underneath them

| Finding | What it was | Now |
|---|---|---|
| **F53 — the card ledger triple-counted.** SEVERE | `startCardPayment` writes a pending row every call with no guard, each for the full balance because `paidCents` has not moved. The callback's `updateMany` was scoped by invoice + status + method and **not by `providerRef`**, so one successful callback flipped ALL pending rows to `completed` with the same reference. The money was credited once — so the balance was right and the LEDGER was wrong: three green rows on the screen and three in the accountant's cash export, each dated when its own checkout was opened, landing cash in prior periods. Every existing test faked `count: 1` or `count: 0`; nothing exercised `count > 1` | Scoped by `providerRef`, which moved out of the `data` clause into the `where`. Two tests pin both halves |
| **F54 — `voidPayment` had no status filter.** | It decrements `paidCents` by `amountCents` for any non-deleted row, and a `pending` row never incremented it — so voiding one understated what the customer paid by the full balance. Filtering the UI list removed the path, and "no UI path" is not a control | The lookup requires a collected status |
| **My new guard was vacuous, again.** | It read the source for `COLLECTED_PAYMENT_STATUSES` inside the `payments:` block. A reviewer deleted the filter, left a comment naming the constant, and all three tests passed — one satisfied by the **import line alone**. That is verbatim the failure PLANNING records, reintroduced in the commit that cites it | `INVOICE_DETAIL_INCLUDE` is exported and asserted structurally, including **identity** with the shared list so an inlined copy fails. Both bypasses verified failing |
| **The "Invoiced" disagreement was half-relabelled.** | I captioned the project tile and left the Reports tile as bare "Invoiced" with a different number — documenting the disagreement in a comment the contractor cannot read | Both labelled: "(excl. GCT)" for profit, "(incl. GCT)" for sales. Same for the Cost tile, which showed a net figure under a bare label whenever its explaining caption was gated off |
| **`cellByHeader`'s docstring overclaimed.** | "Comma-safe" is false: it is safe only to the LEFT of the target. A quoted comma to the right returns the wrong cell silently. And the helper guarding the exports had no test of its own — "verified by hand" was exactly that | The real invariant is stated, and its limits are now assertions — including the two cases where it is knowingly wrong, which is the difference between a documented limit and a latent bug |

**Owner decision recorded, not silently fixed:** `registeredForGct` is derived from
`Boolean(business.trn)`, and in Jamaica every individual has a TRN. A sole trader
who fills in their personal TRN so invoices look right is flagged registered — input
tax netted off, **margin overstated on every job**. The right fix is a
`gctRegistered` boolean on Business, which is a schema change and a question for the
owner. Flagged rather than guessed.

**Also open, deliberately:** `pending` and `failed` payments are now written by code
and read by no surface at all, so "I paid by card and it didn't show" is a question
the invoice screen cannot answer, and a stuck pending row has no expiry sweep. That
is a product decision about whether to show an in-progress cue, not a defect to
quietly patch.

**The pattern, stated plainly:** eight clusters, eight reviews, and **every review
found something** — three times a regression the fix itself introduced, twice a fix
applied to the surface the finding named and not its twin, twice a guard that passed
on nothing. Nothing here is closed before a reviewer that did not write it has
attacked it.

core 285, api 687, web 466, mobile 28.

---

## Billing correctness — F7 and F16, corrected after review

**I marked both closed prematurely, and the review was blunt about why.**

### F16 was not fixed. The stated primary hole was fully open.

`revise` returns a fully-priced DRAFT and `update` let its `clientId` be changed.
So: `POST /quotes/:id/revise`, `PATCH /quotes/:newId` with another client, set SENT,
share. **Two requests, repeatable without limit**, and a tenant at the cap had an
unlimited supply of sendable quotes for new clients.

My commit called that "a nudge toward Pro, not DRM" — which **reframed a revenue
hole as a design stance**, and PLANNING §4e is explicit that the free tier IS the
trial, so the cap is the whole conversion lever. The framing is what got the finding
marked closed.

Closed properly at the step that makes it a bypass: **a descendant keeps the client
of the quote it came from.** Quoting a different client is a different job, and a
different job is a new quote. Corrections stay free and ungated.

**The over-charging half was also only half fixed.** `version: 1` was the wrong key:
`revise` of a CLOSED quote reserves a NEW number and starts again at version 1, so
the ordinary "client agreed, then we corrected the sheet" path still ate an
allowance. `parentQuoteId: null` catches all three kinds of descendant; version
caught two.

### F7's rule fixed the reproduction, not the class.

The date proxy — "a term may start before the payment date but not END before it" —
absorbed any gap **shorter than one interval**, because the chained term still ended
after the money arrived:

| Ledger | Paid for | Got |
|---|---|---|
| annual, lapsed, paid December | a year | **one month** |
| monthly, lapsed, paid 20 days late | a month | 12 days |

The proxy stood in for a question the loop could answer outright. It has `voidedAt`
on every row and discarded it one line after reading it. **A surviving payment may be
pulled back only into a period a VOID vacated** — a gap nobody paid for is not
refillable, because the tenant was on the free tier through it.

### And the "owner question" was a correctness bug my own fix depended on.

`nextTermEnd` used local `getMonth`/`setMonth` on UTC-midnight instants. In
America/Jamaica — UTC-5, where this ships — a UTC midnight is the previous day
locally, so terms came out 28 to 31 days **in both directions**, and the answer
depended on the host's `TZ`. I recorded it as a preference about billing dates.

It also **broke the void re-anchoring the lapse rule is built around**, in the
shipping timezone: a term starting 1 March ended 29 March, which made the proxy fire
on the very case it existed to protect. So the two behaviours I said "had to hold at
once" did not. Fixed with UTC accessors and pinned across five months, an annual
term, a fourteen-term chain, and the 31 January month-end case.

**Still open and now recorded properly, not as a preference:** `startCardPayment`
creates an unbounded pending row per call with no expiry sweep — F53 fixed the
callback symptom, not the root; and `remove` hard-deletes a DRAFT, so the monthly
count can be decremented by create-PDF-delete (only a PDF is obtainable, since
`share` refuses DRAFT). Also: `paidAt` is unbounded admin free text and is now
load-bearing for `renewsAt`, so a typo'd year grants a year of Pro.

core 293, api 707, web 466, mobile 28.

### The original entry, for the record

**F7 — paying after a lapse reverted the tenant the same day.** `reallocateTerms`
chained every surviving payment from the earliest `coversFrom`: right for
consecutive renewals, wrong across a gap. A January payment, a lapse, and an
August payment left `renewsAt` in **March** — five months in the past. The tenant
read PAST_DUE the moment they paid, the next sweep reverted them to free and
emailed them about it, and recovering from one lapse took as many payments as
months missed.

Two behaviours had to hold at once, which is why the naive chain got one wrong:
voiding the first of two consecutive months must slide the survivor **back** onto
the outstanding month, while a lapse must **not** pull a new payment backwards.
The rule that separates them: **a term may start before the payment date, but it
may not END before it.**

The ledger fixtures had no `paidAt` at all, which is why nothing could tell the two
cases apart.

**F16 — the free allowance counted the wrong thing, in both directions.** It
counted every `Quote` row this month, so it **over-charged** (two jobs quoted plus
two revisions = four of five, a contractor's own corrections eating the allowance)
and **under-charged** (`revise` and `createVariation` mint a usable DRAFT and never
consulted the gate). It now counts jobs quoted: `version: 1`, no
`variationOfQuoteId`.

**Residual, stated rather than pretended away:** a revision produces a DRAFT whose
client can be changed, so a determined tenant can still get an extra document from
one. The allowance is a nudge toward Pro, not DRM.

**Found while testing, NOT fixed — an owner question:** `nextTermEnd` advances a
calendar month from a base, so a term starting 1 February ends 4 March. A "monthly"
subscription drifts by however many days February is short. My first test asserted
`2026-03-01` and failed on `2026-03-04`; it now asserts the property, not a literal.

core 285, api 699, web 466, mobile 28.

---

## My F7 "fix" was a regression, and my F16 mitigation was false

The review of the corrections found both. Verified by simulating nine ledgers rather
than taking the report on trust — which also showed one of its four claimed cases did
not reproduce, so the extra complexity it implied was not added.

**F7: I replaced one rule with another instead of taking both.** The date test and the
vacated-period test answer different questions:

| Ledger | date-only | vacated-only | conjunction |
|---|---|---|---|
| annual, lapsed, paid December | **1 month for a year's fee** | correct | correct |
| monthly, paid 20 days late | **12 days for a month** | correct | correct |
| void an old cheque, tenant currently paid up | correct | **renewsAt 5 months in the past** | correct |
| void 1st of 2 consecutive | correct | correct | correct |

The vacated-only version meant **voiding one stale bounced cheque knocked a currently
paid-up tenant offline** — F7's own symptom, on the button that exists for correcting
a mis-entered payment. The rule is now the conjunction, and all three versions are
pinned by tests: both wrong rules fail.

**F16: the register's mitigation was factually wrong.** I wrote that create-then-delete
only yields a PDF "since `share` refuses DRAFT". `share` has **no status gate** — it
mints a token for a draft; it is `findByShareToken` that refuses. And the quote email
route has no DRAFT check either, so the PDF really does reach the client. The loop
delivered real quotes.

Fixed at the actual cause: **`remove` now soft-deletes**, which the schema has always
declared (`deletedAt` — "soft-delete for offline sync") while the code hard-deleted. So
a hard delete was also losing the tombstone an offline device needs to learn the quote
is gone. The allowance counts **issuance, not stock** — no `deletedAt` filter, or the
slot comes back.

**Three more, all mine:**

- **The gate and the counter disagreed.** `BillingService` counted every row while the
  gate counted originals, so the Settings card could read "3 of 5" and then refuse.
  One shared `quoteAllowanceWhere`.
- **`startOfCurrentMonth` had the exact bug I had just called a correctness bug
  elsewhere** — local accessors and a local-time constructor, described in its own
  comment as "deliberately simple… harmless". On a UTC host the boundary is 7pm Jamaica
  on the last evening of the month, so a contractor got a fresh allowance five hours
  early, every month. The admin console had the correct version, privately; there is one
  definition now.
- **My guard broke a legitimate flow:** a revision of a clientless quote could never be
  given a client, refused with a message about keeping a client that did not exist.

**And the tests that "verified by reverting" were tautological on CI.** The month
arithmetic bug only appears west of UTC, and there was no `TZ` pinning anywhere — under
`TZ=UTC` the broken implementation returns the right answer for every assertion, so on
a UTC CI host those eight tests could not fail. Both suites now pin
`America/Jamaica`, and reverting the fix under it fails five tests.

core 293, api 729, web 466, mobile 28.

---

## F31/F32 closed, and two HIGH corrections from review

**F31 — the form and the server disagreed field by field.** `discountPct` was
`.min(0).max(100)` in the DTO and a bare `<Input type="number">` on screen. The telling
detail: `QuoteBuilder`'s Deposit field, two lines from Discount, already had
`min`/`max`. The pattern was known and not applied.

Fixed structurally: `BOUNDS` in core, spent by BOTH the DTO and the input, so they
cannot drift. **The guard found eight more bounds I had not** — `PaymentsPanel`,
`ProjectCosts` (four), `EditBusinessButton`, `SupplierPricePanel`, waste percentage —
all hand-written copies of a server rule. All converted; the allow-list holds only the
admin console and two files with a stated reason.

**F32** — `Number("abc") || 0`. Verified rather than assumed: an
`<input type="number">` sanitises unparseable text to the empty string, and empty *is*
zero for a discount. With bounds now on the inputs, the practical surface is closed.

### The review found two HIGH problems with my previous fix

**My vacated-period rule tested a single instant, so a void could rewind a term far
longer than the period it emptied.** Simulated: voiding one stale one-month cheque cost
an annual tenant **eight months of the year they had just paid for** — because for a
term longer than the gap the date half of the test can never fire, and the rule
collapsed to vacated-only, which had already been found to be a regression. A term may
now only refill a window it fits inside **entirely**. Six ledgers simulated before
changing anything.

**My clientless-revision exemption handed back the exact hole the guard existed for.**
A clientless original produces a clientless descendant, so the exemption let it be
retargeted — one draft, revised repeatedly, a new client each time. `revise` and
`createVariation` are now GATED (they still do not COUNT: the job was counted when the
original was made, and charging for a correction is wrong — but at the cap they are
refused). Both verified by ungating each in turn.

**One claim I did not accept.** The review called the `until === paidAt` boundary a
bug. Simulation showed all three candidate rules give the same answer there, so it is
not a rule defect — it is the deliberate "money buys the earliest unpaid month" policy
adopted earlier. It is now an owner question rather than a silent change.

core 293, api 733, web 474, mobile 28.

---

## F28 — CLOSED: a rejected form now names the field

Every rejection answered with the literal string **"Validation failed"**. The reason
was computed and thrown into an `issues` array that **nothing under `apps/web`
read** — and because `errorMessage()` prefers a non-empty server message over its
own fallback (rightly: a server that says something is more specific than "is the
API running?"), that generic string **beat every carefully-written message in the
client**. A contractor typing `-10` into Discount got three words and no field.

Fixed in the pipe rather than the client, so every form benefits at once — the
client already renders `body.message`. `issues` stays on the response for a screen
that wants to highlight a field later.

What a contractor now reads, taken from the real DTOs:

| Was | Is |
|---|---|
| Validation failed | `A first name is required.` |
| Validation failed | `Email must be a valid email address.` |
| Validation failed | `Discount percentage must be at least 0.` |
| Validation failed | `Line items #1 description is required.` |
| Validation failed | `Terms is too long (at most 5000 characters).` |
| Validation failed | `Stage must be one of: ENQUIRY, QUOTED, WON, IN_PROGRESS, COMPLETE, CANCELLED.` |

Details that came out of writing it against the real schemas rather than synthetic
issues:

- **`cents` is dropped and `pct` expanded.** "Unit price cents must be at least 0"
  invites the question "cents?". A contractor thinks in dollars.
- **Array positions count from 1** and attach to what they index — `lineItems.1.description` becomes "Line items #2 description".
- **A `.refine()` message passes through untouched**, because it was authored for a
  person. Prefixing a derived label produced "First name firstName (or legacy name)
  is required" — which is how this was caught, and only because the test drove the
  real `createClientSchema`.
- **Two authored messages were developer-speak** and are fixed: "firstName (or
  legacy name) is required" and "data is required for an upsert", the latter of
  which reaches a contractor through mobile sync.
- **Capped at three fields** plus a count, and enum options capped at six. Fourteen
  parishes inline is a wall, and a wall reads as an error page rather than as
  something to fix.

core 293, api 721, web 466, mobile 28.

---

## Tier 3 — client/server disagreements, dead controls, prose drift

| # | Finding | Where | Status |
|---|---|---|---|
| F31 | Forms accept what the API refuses, so the save fails with F28's unreadable message: Discount, GCT and Deposit carry no min or max while the sibling Deposit field two lines away has both; `coveragePerSellUnit` allows zero against a positive-only rule; Rate and Price have no floor; `progressPct` accepts 50.5 against an integer rule. | `InvoiceBuilder.tsx:333-335`, `QuoteBuilder.tsx:391`, `MaterialForm.tsx:466-514`, `LabourRateForm.tsx:106-111`, `ProjectForm.tsx:182-190` | **CLOSED** |
| F32 | Non-numeric input is silently coerced to zero in both builders — the preview shows 0% and nothing tells the user their input was ignored. | `QuoteBuilder.tsx:242`, `InvoiceBuilder.tsx:195` | **CLOSED** |
| F33 | **The UTC-5 trap, fifth appearance.** `ProjectCosts` defaults the purchase and labour dates from `toISOString()`, so after 7pm Jamaica time the picker opens on *tomorrow*. `PaymentsPanel:33` already subtracts the offset, with a comment saying why. Two more raw uses to check while in there: `reports/page.tsx:63`, `AdminConsole.tsx:1244`. | `ProjectCosts.tsx:68,77` | OPEN |
| F34 | `dueDate` renders a day early through a raw `toLocaleDateString` — masked by UTC hosts today, wrong in any browser-side mapping in Jamaica and on the PDF the moment a host sets `TZ`. `jamaicaTodayAsUtcMidnight` is private to one service and not exported from core, which is why this could not have used it. | `api-client.ts:310-314,559` | OPEN |
| F35 | The restore banner fires on an untouched **edit** form, offering back a draft identical to what is already on screen — and a stale snapshot for up to seven days. Every draft test renders the new-quote mode, so the edit path is unguarded. | `QuoteBuilder.tsx:186-210`, `quote-draft-recovery.ts:96-102` | OPEN |
| F36 | An unauthenticated GET mutates status — WhatsApp, iMessage and Slack link-preview crawlers mark a quote VIEWED before any human opens it, so the contractor believes the client has read it. The GET also has no throttle override while the POST is tightened to 10/min for token-guessing reasons. | `public-quotes.controller.ts:47`, `quotes.service.ts:404-415` | OPEN |
| F37 | Public share pages fall back to IP keying, and the IP is Vercel's — the page fetches server-side, so every anonymous view platform-wide shares one 120/min bucket. The 121st share-link view in a minute gets a 429, rendered as "link unavailable" for a perfectly valid quote. Availability only; the decision *write* is client-side and unaffected. | `public-quote.ts:43`, `public-invoice.ts:33` | OPEN |
| F38 `[reviewed]` | Dead controls on the admin console: four "Source" links are anchors to `#` with `preventDefault`, while a real URL sits in scope and working links exist 150 lines above; the header search with its keyboard hint is a div of spans; the tenant filter pills have a pointer cursor and no handler; the Regulatory nav badge is a hardcoded 3 one line from the real count; the "PRODUCTION" pill has no env check; the LAST ACTIVE column renders the signup date. | `AdminConsole.tsx:753,758,802-806,929-933,1407` | **CLOSED.** Source links carry the real URL (`sourceEff`, or the matching `jm.sources` entry) and render as plain text when there is none. The fake search box is DELETED — a ⌘K hint is a promise about a shortcut that did not exist, and it would have been the first thing staff tried when looking up a TRN; a real one is below. The filter pills no longer claim to be clickable. The nav badge is `needsReviewCount` and renders nothing at zero. The PRODUCTION pill now names the API the page actually reads — LOCAL / STAGING / PRODUCTION / API NOT SET, from `NEXT_PUBLIC_API_BASE_URL`; `NODE_ENV` was rejected because a staging deploy is also a production BUILD, which is the same lie with more steps. LAST ACTIVE is a real `lastActiveAt` (newest `Quote.updatedAt`, the only activity timestamp the platform records), "never" when there is none, with signup moved to the drawer's identity line. |
| F39 `[reviewed]` | The manual sweep is the one mutating admin route with no audit entry — and that run can revert tenants to free and send email. The sweep-run table records *that* a manual run happened, not who pressed it. | `admin.controller.ts:259-263` | **CLOSED.** `POST /admin/subscriptions/sweep` records an audit entry with the actor and the outcome, and records the attempt when the sweep throws — a run that failed half-way has still sent some of those emails. A new class guard, `admin-audit-coverage.test.ts`, asserts every mutating admin route obtains an actor; it found the sweep and nothing else, and the three routes it first flagged were its own false positive (they use `req.adminContext`, which the pattern missed) |
| F40 `[reviewed]` | Money renders through `formatJmd` while the currency is free text with no ISO check. Set it to USD and the Financials tile shows a JMD symbol beside the letters USD. The one-helper rule is being followed; the helper simply is not parameterised. | `AdminConsole.tsx:1476`, `billing.dto.ts:9` | **CLOSED.** `currency` is `z.enum(CURRENCY_CODES)` on the server and a `<select>` over the same array on the form, so neither can offer a code the other refuses. New `formatPlatformMoney(cents, code)` in core takes the configured currency; all seven console money renders go through it, threaded into the drawer and billing table as a prop. An unknown code degrades to the amount plus the raw code rather than asserting a symbol |
| F41 `[reviewed]` | Pricing save reports success on a field it dropped — a falsy coercion turns a cleared or mistyped value into an omission the server reads as "leave unchanged". A wording problem rather than a data one, since the form re-renders from the response. | `AdminConsole.tsx:203-206` | **CLOSED.** The save validates and REFUSES, naming the field, instead of coercing to `undefined` — which the server read as "leave unchanged" while the screen said "Saved". The class guard written for it found the same defect one form over: `taxLabel: rpForm.taxLabel.trim() || undefined` in the rule-pack save, so clearing the tax label also reported success and changed nothing. Both now carry an error sentence, falling back to the server's own message |
| F42 | Library and client ids accepted without ownership checks on jobs and projects — lesser cousins of F1. A crafted job plants another tenant's row id in your own recipe; not a leak today because the read never dereferences the relation, and it becomes one the first time anyone adds an include for the material. | `jobs.service.ts:41-43`, `projects.service.ts:11,29` | OPEN |
| F43 | Smaller wired-then-dropped items: `annualCount` is computed, tested, sent and unread by the web; "Applied (YTD)" has no year filter, so a 2024 review counts toward this year; `publishedAt` orders the regulatory feed and is never rendered, so the ordering looks arbitrary on screen; `detailLevel` reaches the client and is ignored there; variations are visible only from the variation, so a contractor accumulates empty DRAFT variations, each burning a quote number. | various | OPEN |
| F44 | Undefined CSS custom properties: two tokens are defined only inside the admin console module, so on the tenant app both render in inherited colour — one of them the "Couldn't create the share link" error. | `WhatsAppButton.tsx:86`, `EmailQuoteButton.tsx:112` | OPEN |
| F45 | `toCents` is money math outside core: `toCents("1.005")` returns 100, not 101, because float error puts the product below the half-cent. Sub-cent, but it is the entry point for every price a contractor types. | `line-editor.ts:74` | OPEN |
| F46 `[reviewed]` | ~~`no-unused-vars` is a warning in `apps/api`~~ **CLOSED — and it was worse than this row said: there was NO CI AT ALL.** 628 API tests, 453 web, 269 core, plus every source-scanning guard — and the only workflow was a keep-warm ping, so nothing gated anything. That is the structural reason the F1 guard could be satisfied by an import line and no one noticed. Now: `verify.yml` runs typecheck, lint and test on every push and PR (each step runs even if an earlier one fails, so one push reports everything wrong); `no-unused-vars` escalated to error; lint carries `--max-warnings=0`. All six accumulated problems fixed rather than suppressed, and two were findings themselves — the dead `resolveWebBase` (F14's missing link helper) and two recomputed-then-discarded reads in the billing sweep. Deliberately NOT gated: `build`, because `next build` fetches fonts from Google and cannot complete on every network — Vercel is the honest gate, and a permanent red X is worse than no check. | `.github/workflows/verify.yml`, `apps/api/.eslintrc.json` | **CLOSED `71e5611`** |
| F48 `[reviewed]` | **Un-retiring a statutory contribution reports success and writes nothing, and each save silently undoes the last.** `rpCustom`/`rpRetired` are initialised to `[]` on every mount and never seeded from the pack, while the API treats both as complete *replacement* lists. So: clicking a retired pill again omits the key entirely and the stored retirement survives (`Saved ✓`, nothing changed); after a reload the retired code has no pill at all, so retirement is permanent from the UI; and retiring a second code replaces the first, resurrecting it unannounced. Same shape for custom levies — adding a second deletes the first. The guard omitting the empty list carries a comment explaining why it is correct. `rpSourcesDraft` three lines away does it right, seeding from the pack with a `touched` flag. | `AdminConsole.tsx:232-233,284-285,1300-1320`, `rulepack.service.ts:196-204` | OPEN |
| F49 `[reviewed]` | **`LAST ACTIVE` renders the signup date.** No activity timestamp exists on `AdminTenant`; the cell is `relativeTime(t.createdAt)`. A tenant who signed up two years ago and never returned reads "2 years ago" only by coincidence. Rename the column or add a real `lastActiveAt`. Beside it, `TenantRow` index 6 is a literal `"—"` read by nothing — the hole where the removed MRR was. | `AdminConsole.tsx:944,575-576,1006` | OPEN |
| F50 `[reviewed]` | **The hand-written-shapes guard misses ~17 response shapes because their names lack the `Api` prefix — nine of them carrying money or tax rates**: `AdminFinancials` (`mrrCents`), `PricingConfig`, `EffectiveRulePack` and `EffectiveStatutory` (tax and statutory percentages), `BillingStatus`, `AdminSubscriptionPayment`, `AdminSweepRun`, `CardPaymentResponse`, `AdminUpcomingRenewal`. It also matches only `export interface`, so `export type ApiFoo = {…}` walks past it — plausible, since the surrounding lines are all `export type Api… =`. And the deadness check inherits both holes, which is why F2 went unflagged. **`EffectiveRulePack` is duplicated field-for-field** between `api-client.ts:1157` and `rulepack.service.ts:29` — two hand-maintained copies of the shape carrying `defaultTaxRatePct` into a quote. | `hand-written-shapes.test.ts:66`, `api-client.ts:1102,1144,1157,1257,1280,1289` | OPEN |
| F51 `[reviewed]` | **A bounded namesake makes the unbounded field look checked.** `quotes.dto.ts:16` bounds `description` to 500 — but that is `quoteLineJobComponentSchema`'s display snapshot, not the line item's. The line item's `description` comes from core unbounded, and the guard scanning that file finds the bounded one. This is why F-series "0 unbounded" read as true. | `validators.ts:22,43`, `quotes.dto.ts:16,33` | OPEN |
| F52 `[reviewed]` | **`admin-console-honesty.test.ts` has no teeth against a new fabrication.** Five of six blocks are denylists of strings already deleted (`"2418540"`, `"Blue Mountain Builders"`); only two assertions generalise and both are sidestepped by inlining a figure at its render site — which is how every original fabrication was written. It asserts nothing about having found its subjects, so a rename empties it silently. **It passes today alongside F17, F18, F20, F38 and F49.** What would have teeth: no metric labelled "month"/"today" rendered from an unwindowed value; every `Verified` badge inside a ternary; no `cursor:pointer` element without an `onClick`; `PRODUCTION` not a string literal. Each catches a class, and each fails today. | `admin-console-honesty.test.ts:26-81` | FIXED — four class-based assertions appended: no metric labelled with a window the API does not send; every Verified badge inside a condition; no `statusMap`/`past_due:` read; nothing carrying `cursor: "pointer"` without a handler. Comments are stripped first (the guard matched its own prose), style factories are skipped by a `CSSProperties` marker, and the handler window is 1400 chars each way because these inline styles are long. |

---

## Guards that were weaker than claimed

Corrections to statements in `TESTING.md` and `CONTRACTS.md`. These were my own
claims, and the reviewers found them overstated.

| Claim I made | What is actually true |
|---|---|
| "139 string fields, 0 unbounded" | True of the API DTOs, which is all the guard scans — `SRC = join(process.cwd(), "src")`. The quote and invoice **line item** schemas live in `packages/core`, where `description` and `overrideNote` carry no upper bound, on every line of every document, live on the REST door through `.and()`. `TESTING.md`'s "0 | All bounded" and "DONE" are false as written. (`trnSchema` and `jamaicaPhoneSchema` need no `.max()` — both strip to digits and refine an exact length, so the *output* is bounded whatever arrives.) |
| The markup leak is closed by explicit selects **plus** strict contracts | Backwards, and worse than I wrote. The **source-scanning** disclosure test is what closes it, and only for the LINE select — which it pins properly, so the markup leak itself cannot come back. `.strict()` closes nothing: `publicQuoteWire.parse` appears only inside test files, never on a live response. `business`, `client`, `sections` and the top level can all be widened silently. See **F47** for the one-line fix that makes it fail closed. |
| `unit-label-usage.test.ts` closes seam 4 | It scans for one spelling. The bypass in use is `rateUnit.toLowerCase()` — eight sites across five files, **including both public share pages**. Latent today because every unit label equals its lowercased enum name; live the moment one does not. |
| `hand-written-shapes.test.ts` stops the list growing | See **F50**. It matches only `export interface`, misses ~17 shapes whose names lack the `Api` prefix — nine carrying money or tax rates — and the deadness check inherits both holes, which is why F2 sat there unflagged. My guard's own docstring claim that "every shape on a MONEY path now comes from a contract" is true only of the `Api*` subset. |
| None of the thirteen is on a money path | Loose for two: a job's unit cost becomes a quote line's price, and a supplier price becomes a material's price. |
| "Exactly three unauthenticated surfaces" | Five: the two share views, the decision write, the public plans read, and the WiPay webhook. Both extras are justified in place, but the controller comment still says "the one deliberately UNAUTHENTICATED surface", and a reviewer trusting that count would never look at the webhook. |
| `admin-console-honesty.test.ts` guards against fabricated figures | See **F52**. Five denylists of strings already deleted, plus two assertions both sidestepped by inlining a figure at its render site — which is how every original fabrication was written. It asserts nothing about finding its subjects, so a rename empties it silently. It passes today alongside five findings in the file it guards. |
| `TESTING.md:113` — "Tenant checks make this safe" | There is no tenant check. This line is why **F1** survived. |
| `CONTRACTS.md:262` lists `MaterialFavourite` as remaining work | Stale — `api-client.ts:174` already aliases the wire contract. The same row omits the admin, billing and rulepack surface entirely, which is where F50's nine money-carrying shapes live. |

---

## What the reviewers confirmed sound

Worth as much as the findings, and the reason the list above is credible.

- **The wire migration is real and complete for money** — ten contracts, 88
  assertions with genuine negative cases, and the web declares none of the money
  shapes. Decimal-as-string is proven, not assumed.
- **Tenant isolation holds everywhere except the caller-supplied foreign key.**
  All 47 unscoped mutations are preceded by a tenant-scoped read.
  `req.businessId` never comes from the token. Impersonation keeps the admin's
  own user id and dies at the guard on any write.
- **Hiding actually hides**, for all four kinds, on every picker call site — the
  owner's reported regression holds.
- **No path re-reads the rate book for an existing line**, so raising a day rate
  reprices no history.
- **Retention release never writes `paidCents`**; the reminder gate is enforced
  on both the button and the endpoint; conversion carries `projectId`.
- **Every quote status, project stage and invoice status has a writer** — no
  filter reports a permanent zero as fact.
- **Variations and revisions are not conflated** — the two fields never appear in
  the same write.
- **CSV injection defences hold**, including the raw-cell marker that makes the
  escape hatch impossible to take by accident.
- **The free quota comes from the Staff Console on every enforcing path** — no
  literal quota exists anywhere outside the default.
- **Reverting to free is a reduced tier, not a lockout** — the quote gate is the
  only plan check in the API, and nothing gates correctness.
- **Sweep idempotency, capability enforcement on every mutating admin route, and
  the typed-name delete gate** all hold.

---

## From the review of `8bd0f2f` — partially addressed

| Item | Status |
|---|---|
| No `month.util.test.ts` — the month boundary that gates the free allowance had no direct test | **FIXED.** Seven cases, all asserting on the INSTANT via `toISOString()` rather than on `getMonth()`/`getDate()`, because a test written with local accessors asserts the host's opinion and passes anywhere — which is the bug class itself. Covers 7pm-on-the-last-evening (the actual regression), the 05:00Z rollover to the millisecond, a year boundary, a leap February, and a 37-minute sweep across a year asserting the boundary is never in the future (a sign error in the offset would report zero quotes used and hand out an unlimited allowance). Verified non-vacuous: the old local-accessor implementation returns April and 2027 where the test demands March and 2026 |
| `admin.service.ts` carries orphaned JSDoc for the moved `startOfJamaicaMonth` | OPEN |
| `admin.service.ts:253` `_count` now includes tombstones | OPEN — also queued as a question for the `127380f` review, since the "Paying tenants" tile reads a figure from the same service |
| `nextRenewal` duplicates term logic | OPEN |

## The review of `127380f` — five confirmed defects, three of them in my own guard

The review ran and **found something in every category it was asked about**, including
that F20 was not fixed at all. The pattern is the one this register keeps recording: I
wrote a check that asked whether evidence existed NEARBY instead of whether the thing
in front of it was correct.

| What it found | Status |
|---|---|
| **F20 was not fixed.** The badge branched on `provenance.startsWith("Code-owned")` — a proxy for "is this provenance string a hardcoded literal". Three cards hold that literal; the fourth holds `taxProv`, which begins "Verified" or "Unverified" and so could never match. The one card with a real verification state read "Needs review" fifteen lines above its own footer reading "Verified 2026-07-10", for ever, including immediately after a staffer clicked "Mark verified today" | FIXED properly. The badge is built beside the value it describes, from `rulePackVerification`. Code-owned cards get `info`, not the accent pill |
| **A live F17-class survivor the new guard could not see:** `label: "Applied (YTD)"` over `regulatoryUpdate.findMany` with no date predicate and `regStatusOf` with no year filter. An entry reviewed in 2024 counts toward "YTD" | FIXED — the label is "Applied", and the guard now scans for a CLASS of window words instead of four hand-listed strings |
| **The pointer-cursor assertion was defeated by `disabled=`** — demonstrated, not theorised. The reviewer re-added the exact F38 defect, dropped a handler-less `<input disabled={true} />` above it, and the suite went green. The evidence did not even have to be on the same element | FIXED — it parses the enclosing open tag and requires the handler ON that tag. `disabled=` is no longer evidence of anything |
| **The Verified-badge assertion was satisfied by any `?` in the preceding 200 chars.** Wrapping an unconditional badge in `<span style={{ marginLeft: c.label ? 4 : 0 }}>` restored F20 verbatim, green | FIXED — nested brace groups are blanked, so only a ternary at the top level of the badge's own expression counts |
| **The status assertion was a name denylist, and the column was still plumbed.** `t.status` was still loaded into `TenantRow[4]` and discarded with `void status`; any new pill under a different identifier would reproduce F18 and pass | FIXED — the slot is DELETED (`TenantRow` is 7 elements) and the assertion is on the field, not on its consumers' names |
| "Paying tenants" overstated by the past-due population | FIXED — "Pro tenants" |
| The drawer's metrics grid was a fixed `1fr 1fr` with one card, rendering half-width | FIXED — the columns follow the metric count |
| The new block read `process.cwd()` while the original used `__dirname` | FIXED — one `SOURCE` for the whole file |
| The drawer's "Quotes created (all time)" counts soft-deleted quotes (`admin.service.ts:253`) | OPEN — pre-existing, and "created" is arguably literal, but it is the tombstone issue in the metric this commit re-labelled as authoritative |

**Confirmed clean:** the column grid after F17 (7 `<th>`, 7 `<td>`, all read by explicit
index, nothing else consuming a 9-tuple); F18 twins (one remaining read of
`AdminTenant.status`, now deleted); other unconditional Verified badges (the payroll
table's two are genuinely conditional); drawer regressions (the `find` by id is
equivalent to the table's index lookup because `tenantIds` is the same array).

**The guards now carry the defeats as tests.** A second `describe` block holds the
three bypasses the reviewer demonstrated, as assertions that they no longer work —
because the useful thing a defeated guard leaves behind is the defeat.

## The review of `69f8caa` (F38) — and the guard lesson, learned properly

Third review, third set of real findings. The important one is not any single
defect, it is that **all three new guards were defeated simultaneously, on the real
file, with the suite green** — by rewrites that did not change the defect at all.

| What it found | Status |
|---|---|
| **Two source links pointed at the WRONG document.** `jm.sources` holds exactly two URLs, both about GCT — its own `verifiedAsOf` comment says it is the consumption-tax provenance. `sources[0]` for TAXPAYER ID and `find(u => u.includes("gov.jm"))` for REGIONS both resolved to the GCT rate page, because `jamaicatax.gov.jm` is under `gov.jm`. A staffer clicking "Gov.jm" beside "14 parishes" landed on a tax-rate page | FIXED — the three code-owned cards carry `sourceUrl: null` and render as dimmed text. A confidently-labelled link to the wrong page is worse than none: it looks sourced, and the reader has to discover that it is not. F59 covers sourcing them properly |
| **The environment badge read the second-precedence variable.** Every fetch resolves `API_BASE_URL ?? NEXT_PUBLIC_API_BASE_URL ?? localhost`; the badge read only the public one, which the client bundle can see but which loses. A deploy setting `API_BASE_URL` to production with a stale public value would have suspended real tenants behind an amber STAGING pill | FIXED — `apiEnvironment` moved to `lib/api-environment.ts`, takes the ALREADY-RESOLVED url, and the server page passes `apiEnvironment(API_BASE_URL)` as a prop. One resolution, one precedence |
| **The STAGING pattern fired on production hosts.** `jamquote-api.fly.dev`, `api.jamquote.dev` and `jamquote.dev` all read STAGING — `.dev` is an ordinary TLD and Fly.io an ordinary host | FIXED — the TLD label is excluded and `dev`/`test`/`preview` are dropped from the word list. A badge that cries staging on production teaches staff to ignore the badge |
| `apiEnvironment` had no unit test; the only guard was a string grep | FIXED — `api-environment.test.ts`, six cases including every host the review found misclassified, and one asserting every tone it can return is a real CSS variable |
| **A false claim in a comment:** "one extra indexed read per tenant". `Quote` has no index on `updatedAt`, so the ordered `take: 1` sorts every quote of every tenant per page load | FIXED — the comment states the truth. F58 covers the index |
| **All three new guards were defeated** (see below) | FIXED — each now parses instead of matching, and every demonstrated bypass is kept as a test |

**Confirmed clean:** `lastActiveAt` semantics (`@updatedAt` does bump on create,
edit, status change and soft-delete; the include is tenant-scoped by construction and
is not N+1); the `Subscription.status` removal (no surviving consumer anywhere in the
monorepo); the `TenantRow` 7-to-8 widening (every index read and the drawer
destructure check out, header and body still 7 columns); the search-box deletion.

### Why the guards kept failing, and what changed

The bypasses were: deleting the two spaces around an arrow, dropping the parens on
the parameter, typing the parameter, putting the body in braces — *the exact form the
comment claimed to target* — swapping attribute order, a braced or empty `href`, no
`href` at all; a braced digit and a newline before a digit; a quoted PRODUCTION.
Each is the same defect with different whitespace.

Two changes, and they are the general lesson:

1. **Parse the thing, do not match its spelling.** `deadAnchor(tag)` extracts the
   `href` and `onClick` attributes, strips the arrow head and any braced body,
   removes every `preventDefault()` / `stopPropagation()` / `void 0`, and asks
   whether anything is left. All eleven spellings collapse to one answer. Likewise
   `literalCount` normalises braces, quotes and whitespace before testing digits.
2. **The control tests must exercise the guard, not a copy of it.** Each bypass test
   previously declared its OWN regex, so editing a guard could not fail its own
   control. The predicates are defined once and both blocks call them.

There is also a `found its subjects` assertion over the whole block — tag count,
anchor count, text-child count — because every assertion in it scans one parse, and a
rename would otherwise empty all of them at once.

While being written, the new guard caught something real: the orphaned local copy of
`apiEnvironment`, left in the console because an earlier edit script asserted and
exited before writing.

## The review of `84f21a4` — two data-loss paths, and both new guards defeated

Fourth consecutive review to find real defects. The F21 finding is the serious one:
my own "always send" fix created a way to destroy stored data that the previous
behaviour did not have.

| What it found | Status |
|---|---|
| **F21: two data-loss paths, one of them a regression the fix introduced.** (1a) The chip row's `.map` was changed to `retirableContributions` but the wrapping gate was left on `rp.statutory.length > 0` — and retired codes are filtered OUT of `statutory`. Retiring all four JM contributions emptied it, the whole row vanished, and the four correctly-computed stubs were discarded. Four clicks made the decision unrecoverable from the console. (1b) `resolveProfile` swallows a failed `rulePackConfig.findUnique` and reports `statutoryRetired: []` in a **200** while the override row exists; with "always send", one unrelated rate save then wrote that emptiness over every stored retirement and every admin-added levy. (1c) Two staff editing at once: B's stale list silently un-retires what A just retired | FIXED. The gate follows what is RENDERED. And the lists are sent only once `rpContributionsTouched` — which is the distinction that actually matters: "untouched" versus "empty", not "empty" versus "non-empty". That closes 1b and 1c as well, and it is the pattern this same form already used for `sources`, which I should have followed the first time. The setters are wrapped rather than flagging at each of eight edit sites, because one site that forgot would be a silent gap |
| **The payment ledger rendered receipts in the PLATFORM's current currency**, not each payment's own, though `AdminSubscriptionPayment.currency` was right there. A receipt taken in JMD re-rendered as US$ after a switch — in a ledger reconciled against a bank statement | FIXED — each row passes `r.currency ?? currency`. The local binding in that table is gone, so no figure there can silently inherit the platform's |
| **A legacy currency value trapped the admin.** A `<select>` whose value matches no option displays the FIRST option, so a pre-`z.enum` row holding `"usd"` showed **JMD** while state said otherwise; the save was refused with "must be one of…", contradicting the screen, and re-picking the shown option fires no change event | FIXED — an unrecognised stored value is rendered as its own option, marked "not supported, pick one below", so the refusal agrees with what is on screen |
| `formatPlatformMoney` looked its code up on `CURRENCIES` with no own-property check, so a legacy value of `"valueOf"` or `"toString"` (both within the old 8-char limit) resolved to a truthy inherited `Function` | FIXED — `Object.hasOwn` first |
| **The audit guard was blind to a template-literal route path** — a review added an actor-less `@Post(\`tenants/:id/nuke\`)` and the suite stayed green | FIXED — one `ROUTE_DECORATOR` accepting any quoting and a bare collection route, defined once and exercised by its own bypass tests. Verified by re-running the reviewer's injection |
| **Both new console guards were defeated.** `?? undefined` and `|| void 0` walked past the coercion check; `formatPlatformMoney(cents, "JMD")` — the exact defect F40 was about — walked past the currency check, which only asserted the identifier was present | FIXED — the coercion check matches the CLASS of coercion-to-absent, and the currency check refuses a literal second argument. Both verified by re-running the reviewer's bypasses; the currency one needed a second attempt, caught because I ran it rather than assuming |
| The comment block claiming "formatJmd … is now the only way money is rendered here" was made false by the previous commit, and said there was deliberately no local `money()` helper while one had just been added | FIXED — rewritten to record both mistakes and what the single rule now is |

**Confirmed clean:** the `statutoryCustom` round-trip field by field (the API's
narrower `StatutoryCustomEntry` is a type-only inaccuracy — `{...c}` copies
everything, and `withAdminProvenance` never touches the stored override, so no
`verified`/`asOf` is sent back as input); `data.rulepack === null`, where the editor
refuses to save; `pricingProblem()` against `updatePricingSchema` field by field;
`dollarsStrToCents` on garbage (NaN, never throws); no other falsy-coercion save in
the console or the client; `memberBody`'s brace heuristic across all 17 routes.

**Still open, and not introduced here:** a failed rule-pack read reports
`overridden: false` in a 200, so the screen says "no override" when the row exists
and cannot be read. The data loss that made that dangerous is fixed, but the 200 is
still dishonest — F60. Rule-pack saves also have no optimistic concurrency, so two
staff editing contributions can still overwrite each other's complete lists, exactly
as `sources` always could — F61.

## The review of `f4bc06d` — a live defect, and three guards still defeatable

Fifth consecutive review to find real defects. Two things stand out. One: a defect
shipped in the commit — the same coercion class I had just fixed, three lines from
the fix. Two: three of the four guards I had strengthened in response to the previous
review were still walked past, each by a rewrite I had not thought of.

| What it found | Status |
|---|---|
| **A LIVE defect in the shipped commit.** `defaultTaxRatePct: rpForm.defaultTaxRatePct.trim() === "" ? undefined : Number(...)` — a ternary yielding `undefined`, three lines below the `taxLabel` refusal I had just written. A `type="number"` input yields `""` both when cleared and when unparseable, so clearing the default tax rate omitted the field, the server left the column alone, `rpToForm(updated)` repainted the old rate, and the screen said "Saved ✓". The admin is told a tax-rate change landed that never did, and the number appears to revert by itself | FIXED — one `rulePackProblem()` checking every field this form sends (label length, rate range, each statutory split, each custom row), mirroring `pricingProblem()`. The answer to "I fixed one field and missed its neighbour" is not another `if` |
| **The touched-flag guard passed with the unconditional send reinstated.** It asserted that the string `rpContributionsTouched` appeared somewhere — and it appears in its own `useState` line and in both setter wrappers. A review put the data-destroying code back and the suite stayed green: failure mode (b), on the assertion written to prevent failure mode (b) | FIXED — the payload is PARSED. `topLevelKeys` blanks nested braces, so a key inside `...(touched ? {…} : {})` is invisible and a flat key is not; the assertion also requires the field to still be sent somewhere, so it cannot pass by dropping it and restoring the one-way door |
| **The currency guard was defeated again**, by a call inside the first argument: `formatPlatformMoney(Number(r.amountCents), "JMD")`. `[^)]*` cannot cross the `)` of `Number(...)`, so a hardcoded JMD on the bank-reconciled ledger passed. Second time I fixed the spelling I had tried rather than the class | FIXED — `callArguments()` splits a call's arguments paren-, brace- and quote-aware, and the second argument must not be a string literal |
| **The audit guard still missed a non-literal route path** — `const NUKE_PATH = …; @Post(NUKE_PATH)` passed. I had "fixed" the template-literal bypass by accepting any QUOTING; the lesson was about literal-ness | FIXED — the decorator's argument is not inspected at all. Whether the path is readable from source has nothing to do with whether the handler knows who is acting |
| **Touching a contribution after a swallowed read still destroyed everything**, and the screen asserted the opposite: "Core baseline", no override pill. My commit message's "closes both paths" was an overclaim — path 1 was closed only for saves that did not touch contributions | FIXED, and this closes **F60**. `resolveProfile` now returns `readFailed`, `EffectiveRulePack.overrideReadFailed` carries it, `toEffective` takes it with NO default so the compiler forces every call site, the console shows a red banner before anything is typed, and `rulePackProblem()` refuses to save. Three service tests assert the flag distinguishes a failed read from a genuine absence |
| A retired CUSTOM levy fell back to a bare code with a fabricated `appliesTo: "BOTH"` and null rates, while `rpCustom` held the real label in the same scope — and the comment claimed the label came "from the baseline where possible" | FIXED — baseline first, then `rpCustom` |

**Confirmed clean, and worth recording because it was the thing most likely to be
wrong:** the setter-wrapper pattern. All eight edit sites go through the wrappers;
`setRpCustomState`/`setRpRetiredState` appear only at their declarations and inside
the wrappers; the functional-updater form survives because the wrapper forwards the
value opaquely; `saveRulepack` is a plain render-body function so it reads the
current render's flag with no stale closure; and there is no path where an edit and
the save happen in one event. Also clean: un-retiring the last contribution end to
end (Zod accepts `[]`, `update()` writes it, `toOverride` maps it back to "none"); a
failed save leaves the flag true so a retry still sends; the chip gate; the "not
supported" currency option cannot be saved; `Object.hasOwn` on every runtime here;
and no false positives from the widened patterns.

**The recurring lesson, now stated once:** every guard I have written by matching
the text of a defect has been defeated by a rewrite of that text. The four that have
held are the four that PARSE — the enclosing tag, the enclosing expression, a call's
arguments, an object's top-level keys. Match a shape, not a spelling.

## The review of `5d155db` — a live defect, and a guard vacuous in a new way

Sixth consecutive review to find real defects. The most instructive finding is one
the reviewer got half-right: their `...{ … }` spread bypass did defeat the
touched-flag guard, but not for the reason given. `callArguments` returns an object
argument WITH its braces, so the key parse returned an empty list and the assertion
was trivially true for ANY payload — honest or not. Two reviews and three of my own
rewrites had looked at that assertion without noticing it asserted nothing.

| What it found | Status |
|---|---|
| **A LIVE defect: an admin-added levy had TWO rate editors.** It is appended to the effective `statutory` list, so it appeared in the statutory grid (mirrored in `rpForm.statutory`) AND in its own row under MAINTAIN CONTRIBUTIONS. Both were sent, and `withAdminProvenance` resolves `rate?.employeePct ?? input.employeePct` — so the grid's untouched copy won. Editing the levy's own rate reported "Saved ✓", changed nothing, and left two different numbers for one levy on one screen | FIXED — the grid renders BASELINE codes only, and `statutoryRates` refuses to carry a code the custom list owns even if a future edit puts it back. Two places holding one fact is this repo's oldest recurring defect and I reintroduced it |
| **`rpContributionsTouched` was never cleared**, so it meant "touched at some point this session" rather than "since the last load" — which reopened the concurrency path its own doc comment claimed to close, after the first contribution edit | FIXED — the flag is cleared and `rpCustom`/`rpRetired`/`rpSourcesDraft` are re-seeded from the save RESPONSE, which also means the local copy holds the server's normalised codes rather than what was typed |
| **The touched-flag guard was vacuous in a way NEITHER I nor the previous reviewer spotted.** `callArguments` returns an object argument WITH its braces, so `topLevelKeys` saw every key at depth 1 and returned `[]` — `not.toContain("statutoryRetired")` was trivially true whatever the payload did. The reviewer's `...{ … }` spread bypass passed for this reason, not the one they diagnosed | FIXED — the payload is unwrapped first, shorthand keys are recorded (`{ taxLabel }` has no colon and was invisible, which is also how the vacuity was finally caught), and `unconditionalKeys` treats a spread with no condition of its own as unconditional. A **positive control** now requires the parse to find `taxLabel` and `statutoryRates`: any guard whose pass depends on a parse must prove the parse worked. Three unconditional-send forms — conditional-spread removal, flat keys, and a plain-object spread with a decoy `...(flag ? {} : {})` — all now fail |
| **The coercion guard was defeated twice more:** by hoisting the coercion one line above the call, and by reformatting the api-client import so the mutator list (a regex demanding two-space indent and a trailing comma) dropped the one name that mattered while the count floor still passed | FIXED — the whole `savePricing`/`saveRulepack` body is read rather than the payload literal (those functions contain no JSX, so the legitimate `undefined`-as-a-CSS-value uses cannot fire), and `importedNames` parses the import block whatever its formatting. Verified by combining the reformat WITH the ternary it was hiding |
| **The currency guard was defeated by a const holding a literal** — `const JMD = "JMD"` passed as the second argument, on the bank-reconciled ledger. The commit had just recorded the literal-ness lesson for route decorators and not carried it to the guard beside it | FIXED — `stringConstants()` resolves identifiers bound to string literals and treats them as literals |
| `rulePackProblem()`'s comment claimed it "checks every field this form sends". It did not: `sources` (a typo'd line or a 21st URL 400s the whole save), custom `code` max 40, `label` max 80, `verifiedAsOf` as a date, `sourceUrl` as a URL | FIXED — all of them, with the row or source numbered in the message; the comment now records what it had missed |

**Confirmed clean:** `rpForm.statutory` can never hold a non-string, so the
`.trim()` cannot throw; `NaN` cannot reach the payload from a custom row;
`defaultTaxRatePct`'s unconditional `Number()` is safe because the refusal runs
first and there is exactly one call site; F60 is threaded to both producers with no
default and no fabricated `false` anywhere (`safe()` yields `null`, not a lying
object); `callArguments`' preceding-character check has no false negatives;
`ROUTE_DECORATOR` handles nested parens; the retired-custom-levy label fix is
correct.

**The rule, restated after six rounds:** a guard must parse a SHAPE, and it must
prove its parse found something. Every text-matching version has been walked past,
and the one parsing version that had no positive control turned out to be asserting
nothing at all.

## The review of `4f2d5c8` — the fix was wrong at the root, and the guards were the wrong tool

Seventh consecutive review to find real defects, and the one that changed how I am
working on this file. Two conclusions:

1. **I had been fixing a data-model defect on the screen.** Two stores could hold a
   rate for one code and the stale one won. Rearranging which inputs render and
   what the payload omits could not fix that, and twice made it worse — the second
   attempt turned a wrong-value bug into a permanent two-numbers-on-screen
   stalemate where both editors reported success and did nothing.
2. **Source-scanning guards were the wrong tool for a payload.** Four generations,
   each walked past by a rewrite that changed no behaviour, and one that had been
   asserting nothing for three of them. The payload needed to be a function with a
   return value. It is one now, and the scanner is deleted.

| What it found | Status |
|---|---|
| **My two-editors fix closed the append case and left the REPLACEMENT case fully alive.** `mergeStatutory` consumes a custom entry in place when its code matches a baseline one — the documented replacement case, four lines above the function I cited. So a custom entry coded `NIS` is still a baseline code, still rendered in the grid, and still had its own row | FIXED AT THE ROOT, not on the screen. `withAdminProvenance` no longer resolves `statutoryRates[code] ?? input` — a custom entry is a COMPLETE definition and owns its rates. Two stores held one fact and the wrong one won; whichever way the inputs are arranged, the model had to say which wins |
| **Worse: my `statutoryRates` skip created a permanent disagreement.** `update()` MERGES `statutoryRates`, so omission means keep — the stale stored `NIS = 3` survived, beat the custom row's 7, and editing EITHER box then saved successfully and changed nothing, with 3 and 7 both on screen for ever | FIXED — `RulePackService.update` PRUNES any rate a custom entry has taken over, and writes `statutoryRates` whenever either side changed so the prune lands on a save that sent no rates. Three service tests, each failing when the fix is reverted |
| A removed custom row left an orphaned `statutoryRates` entry that would silently override the levy if it were ever re-added | FIXED by the same prune, which runs against the effective custom list |
| **`customCodes` used `trim().toUpperCase()` and missed the DTO's space-to-underscore step**, so a code typed "EDUCATION TAX" never matched the stored EDUCATION_TAX and the duplicate input survived the first save — a second hand-written copy of a normalisation rule, which is the same mistake one level down | FIXED — one exported `normaliseCode`, shared by the grid filter and the send path, with tests against every spelling |
| **Four of five guards bypassable, and the new positive control did not cover the new code.** `unconditionalKeys` caught only the shape the last review used: a nested spread, `Object.assign`, computed keys and a constant condition all passed. Disabling the entire spread-analysis loop left the suite green, because the control only proved the trivial half of the parse ran. The "one fact has one editor" assertion greped for two literals — keep the spellings, empty the meaning, green. The coercion guard escaped via a helper outside the save function. `stringConstants` missed an object field and `String("JMD")` | **REPLACED, not patched a fifth time.** The payload is now `buildRulePackPatch` in `apps/web/lib/rulepack-patch.ts` — a pure function with 12 tests that construct state and read the result. 150 lines of parser I had failed to get right three times are deleted. Precedence and pruning are asserted behaviourally in core and the service. What is left in the source guard is a delegation check: the console must not build a payload inline again, because that is what put these rules beyond reach of a real test |
| `isHttpUrl`'s comment claimed it matched `z.string().url()`; it is strictly stricter (rejects `ftp:`, `mailto:`, `javascript:`). The custom `code`/`label` length checks ran on the trimmed value while the server's `.max()` runs on the raw one | FIXED — the comment says stricter and why; the custom rows are checked raw because they are SENT raw, while `taxLabel` stays trimmed because it is sent trimmed. Reading the send path rather than assuming it is the whole point |

**Refuted by the reviewer, and worth recording:** the touch-flag re-seed is NOT a
data-loss path — `update()` returns the upserted row, so a save that omits the
lists gets the stored ones back. The `verifiedAsOf` regex is weaker than
`z.string().date()` but unreachable behind `type="date"`. Lowercase codes behave
correctly in both halves. `importedNames` has no bypass.

**Pre-existing, now registered:** clearing the sources box and saving refills it
with baseline URLs, because `updated.sources` is the EFFECTIVE list — F62.

## The review of `1792e3f` — a stuck state of my own making, and the compiler as the guard

Eighth consecutive review to find real defects. It also refuted the thing I was most
worried about: the core precedence change has no blast radius. `withAdminProvenance`
is module-private, `mergeStatutory` is its only caller, and the effective `statutory`
array reaches nothing but the admin console — no payroll, PDF, report or mobile path.
**No tenant-facing figure changed value.**

| What it found | Status |
|---|---|
| **A stuck state I created.** `rpForm.statutory` is keyed by every effective code, but the grid stops rendering a code once a custom entry takes it over and `buildRulePackPatch` stops sending it — while `rulePackProblem` still range-checked the whole form. Type 150 into NIS, then add a custom row coded NIS: the input unmounts, the value stays, and every later save is refused with "NIS employee rate must be…" naming a field that is no longer on screen. The only escapes were deleting the custom row or reloading and losing every pending edit — and the value was never going to be sent anyway | FIXED — `rulePackProblem` moved beside the builder and validates what the patch WILL CARRY, from the same `owned` set. The console now builds one `edits` object and hands it to both, so the two cannot describe different things. Ten tests on the validator, including this exact case |
| **Both surviving source guards defeated, simultaneously.** The delegation guard was satisfied by a dead `void buildRulePackPatch(...)` call left for the scanner while a hand-built object went to the mutator; the grid guard by copying the effective list into a differently-named local. 27/27 green with both original defects reinstated | **REPLACED BY THE COMPILER.** `updateAdminRulePack` now takes a branded `RulePackPatch` that only the builder can produce, so an inline literal is a COMPILE ERROR — verified by injecting the reviewer's exact bypass. The grid's decision is `gridContributionCodes`, a tested function; the two guards are deleted with a note saying why |
| **Commit-message overclaim:** "every fix verified by reverting it and watching a test fail" was false for the grid filter, which had no test at all | FIXED — six tests on `gridContributionCodes`, and I reverted it to BOTH earlier wrong versions: the render-everything one fails four, the baseline-membership one fails two |

**Also confirmed clean:** the prune's fallback cannot meet an un-normalised stored
code (the DTO transform has been in place since `statutoryCustom` was introduced);
`mergedStatutory` loses nothing on a contributions-only save; the prune applies to
the create branch too; `buildRulePackPatch` reproduces the previous inline payload
field for field, with the two intended changes; the tests assert rules rather than
implementation (verified by mutating the implementation); no dead code from the
deletion.

**A correction to something I said in a review reply:** `n i s` does NOT normalise
to `NIS`. It becomes `N_I_S` — the rule collapses whitespace to underscores, it does
not delete it — so it defines a new levy rather than replacing NIS. My own test
caught that, and it is now asserted both ways.

## The review of `b6b2549` — a fabricated test reference, and a brand that carried

Ninth consecutive review to find real defects. The one that matters most is not a
bug: **I wrote a comment citing a test file that did not exist**, while deleting the
assertion it claimed to replace. Nothing about that was caught by a tool, and
nothing would have been.

| What it found | Status |
|---|---|
| **A comment claimed coverage that did not exist.** Deleting the grid assertion, I wrote that it was "replaced by a render test — `statutory-grid.test.tsx`". That file had never been written: I had pivoted to unit-testing the decision instead and left the sentence behind. The grid's use of that decision was covered by nothing | FIXED — `statutory-grid.test.tsx` exists now. It renders the console, navigates to the rule-pack screen and COUNTS the rate inputs a code is offered, verified against both earlier wrong versions of the filter (render-everything fails two, baseline-only fails one). The grid inputs gained `aria-label`s, which they had never had — screen readers got nothing from them before |
| **The brand guarded one door of two.** `apiClient` was exported with `patch(path, body?: unknown)`, so anything could reach `PATCH /admin/rulepack` with a hand-built body and no type friction | FIXED — `apiClient` is no longer exported. It had no callers outside its own module, so every request goes through a named function |
| **The brand was structural, so a spread carried it.** `{ ...buildRulePackPatch(e), statutoryRetired: [] }` typechecked, and `statutoryRetired: []` is a REPLACE on the server — the wipe that destroys every stored retirement. `Object.assign` did the same. The brand constrained the provenance of the OBJECT while the defect class is about the provenance of its FIELDS | FIXED — `RulePackPatch` is a CLASS with a private member, so it is nominal: a plain object cannot satisfy it and a spread is a compile error. The body sits behind a getter, so `Object.assign` onto the wrapper still compiles but is INERT — asserted as a test rather than assumed |
| **A coverage hole I created by moving the code.** The coercion guard reads the `savePricing`/`saveRulepack` bodies in `AdminConsole.tsx`, and the payload moved to another file — so `taxLabel: x.trim() === "" ? undefined : x` inside the builder was policed by nothing. Two of the three scalars the builder's own comment calls "sent unconditionally" had no guard, no test and no type behind them | FIXED — two tests assert that a form with every field blank, and one with every field whitespace, still SEND all four scalars. Both of the reviewer's exact injections now fail |
| **Overclaim:** "an inline literal is a compile error" was true only of a naked literal to that one wrapper; `as RulePackPatch`, `as unknown as`, `any` and `JSON.parse` all compiled. "None has defeated a type" was false when written | The claim is now narrower and accurate in the code comment. A deliberate cast still defeats any brand — that is what a cast is for — and the honest statement is that this stops the accidental and the convenient, not the determined |

**Confirmed clean:** the circular `import type` between `api-client` and
`rulepack-patch` (both edges elide, `next build` succeeds, no cycle warning); the
validator move clause by clause including message text, with `isHttpUrl`
character-identical and the `!rpForm` branch correctly dropped rather than lost;
`gridContributionCodes` against duplicate and differently-cased codes; grid ordering
unchanged; every rendered row still resolving its form entry; no orphaned helpers.

## The review of `ee9cd61` — the first run of `commit-reviewer`, and it broke the brand

Tenth consecutive review to find real defects, and the first using the new
`commit-reviewer` brief. It earned itself immediately: the brief's instruction to
compile a direct `new` and a write through an accessor — both added because they had
worked before — found the two holes below in minutes.

| What it found | Status |
|---|---|
| **The nominal class was open, and more easily than the thing it replaced.** `private` on a constructor PARAMETER marks the field, not the constructor — so `new RulePackPatch({ statutoryRetired: [] })` compiled with no cast and put that body on the wire. The spread bypass it replaced at least needed a real patch to spread; this needed nothing. Three comments added or kept by that commit said only the builder could produce one | FIXED — the class VALUE is no longer exported, only the type. Outside the module there is nothing to `new`, subclass or `Object.create`. All three comments corrected |
| **`.body` returned the payload by reference**, so `patch.body.statutoryRetired = []` reached the wire — the original bypass restored by four characters. My test asserted only `Object.assign` on the WRAPPER, which is the shape the reviewer had happened to use: matching the text of a defeated bypass rather than its shape | FIXED — the getter returns a `structuredClone` typed `Readonly`, so the write is a compile error AND cannot reach the patch if cast past. Three tests, including one that mutates an escaped copy and asserts the patch is unchanged |
| **The blank-form tests were satisfied by garbage.** They asserted `Object.hasOwn` and `not.toBeUndefined()`, so injecting a blank tax label that silently became `"TAX"` — renaming the tax on every quote and invoice — left all 534 web tests green. The comment claiming "blank means null or NaN" was also false: `Number("")` is `0`, which the server accepts | FIXED — exact values asserted (`""`, `0`, `null`, `null`), and the comment corrected. The garbage injection now fails both tests |
| `updateAdminRulePack`'s transport was covered by nothing, before or after the `input` → `input.body` change. A wrapper sent whole would serialise as `{ nominal, patch }` rather than as nothing, because constructor parameter properties are own enumerable fields | FIXED — a stubbed-fetch test asserts what is on the wire and that the wrapper's own shape is absent. Reverting the unwrap fails it |
| The grid's new `aria-label` used the raw code, so a screen reader said "EDUCATION_TAX employee rate" while the row read "Education Tax" | FIXED — one `statLabel` helper, shared with the visible label |

**Confirmed clean:** the render test proves what it claims (both reverts reproduced
exactly — render-everything fails two of three, baseline-only fails one); its
`as unknown as AdminData` cast hides no omission (removing it yields one EXCESS
property error and nothing missing); `gridInputsFor` cannot match the MAINTAIN
CONTRIBUTIONS rows, which carry a `placeholder` and no `aria-label`; nothing
imported `apiClient`, so un-exporting it reduced no coverage; the aria-labels are
not a copy-paste and conflict with no visible label; nothing stringifies the
wrapper; no blast radius in core, api or mobile.

**The brief gained three lessons from its own first run:** the working tree is not
private during a review (this review saw a concurrent commit and correctly flagged
it rather than assuming); a test asserting "defined" asserts almost nothing; and the
brand-defeating list now includes a direct `new`, a subclass, `Object.create` and a
write through a by-reference accessor.

## Opened by the F38 work

| New | Why it is worth doing |
|---|---|
| F55 | **A real tenant search.** The fake header box was deleted rather than wired, because a dead control is worse than its absence — but staff genuinely need to find a tenant by name or TRN, and the tenants table has no filter at all now that the pills are honest about not being one. This is the feature the mock was standing in for |
| F56 | **The filter pills still do not filter.** They are honest counts now, which is not the same as useful. Wiring them is a small change once a search/filter state exists (see F55) |
| F57 | **`lastActiveAt` measures quote activity only.** There is no `lastLoginAt` on the platform, so a tenant who logs in and browses without touching a quote reads as inactive. The column's tooltip says exactly what it measures, which is honest, but a real last-seen timestamp would be better and is a one-column migration |
| F58 | **No index supports the last-activity sort.** `orderBy: { updatedAt: "desc" }` on the tenants include has no `@@index([businessId, updatedAt])` behind it, so it sorts every quote of every tenant on each admin page load. Fine at current scale, one migration to fix |
| F59 | **Per-topic source URLs for the rule cards.** `jm.sources` is consumption-tax provenance only, so TAXPAYER ID, REGIONS and PAYMENT RAILS have no honest link and render as text. Each needs a URL recorded by someone who has checked it — inventing one is how the wrong-document defect happened |
| F60 | ~~A failed rule-pack read looks like "no override".~~ **CLOSED** by the review of `f4bc06d` — see above. |
| F61 | **No optimistic concurrency on the rule pack.** `statutoryRetired`, `statutoryCustom` and `sources` are complete lists with no `expectedUpdatedAt`, so two staff editing contributions overwrite each other silently. Pre-existing for `sources`; now reachable for contributions too |
| F62 | **Clearing the sources list refills it from the baseline.** `toEffective` reports the effective `sources` (override, then `sourceUrl`, then the baseline profile), so a save that deliberately empties the box answers with the baseline URLs and the box repopulates with what the admin just deleted. Pre-existing — the same fallback applies at load |

## Suggested order

1. **F1** — the only tenant-boundary crossing. One helper, six call sites.
2. **F2, F3, F4, F13, F30** — the retention and card cluster. One root cause: the
   client-facing surfaces and the payment path do not know retention exists.
3. **F5, F6, F15, F12** — the accountant's four files, which currently cannot be
   reconciled against each other.
4. **F8, F9, F10, F11** — the quote-edit and share cluster, same root cause:
   `markupPct` is captured nowhere on the web, and the public page cannot
   compute it.
5. **F7, F16** — billing correctness.
6. **F28** first among the rest, because it is what makes F31 unreadable to a
   contractor.

Then the guard corrections, because each one is a fix that can silently come
undone.
