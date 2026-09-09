# Review findings — nine independent reviewers, 2026-09-08

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

### F1 `[reviewed]` — a caller-supplied `clientId` is never checked for ownership · **FIXED + reviewed; one action left**

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

**Still open, and it needs the owner:** rows written before this check existed were
never validated. `apps/api/scripts/audit-client-refs.mjs` finds any, and
`revise`/`createVariation`/`convertFromQuote` copy `clientId` forward, so a bad
reference multiplies rather than ageing out. **I could not run it — Neon was
unreachable (free tier asleep).** Run it before contractor testing:

```
cd apps/api && node --env-file=.env scripts/audit-client-refs.mjs
```

It reports and exits 1 rather than repairing: detaching a client silently rewrites
a document the contractor may already have sent, so the list is a decision.

### F2 `[reviewed]` — a card-payment helper fabricates a WiPay checkout · OPEN

The catch block swallows any error, sleeps 700ms to look like a network call, and
returns a `checkout.wipayfinancial.com/mock/...` URL. Its declared shape matches
nothing the endpoint sends — the controller returns `paymentUrl` — so even the
happy path navigates to `undefined`. Zero callers today, which makes it a
landmine rather than a live bug. Invisible to the shapes guard because the name
lacks the `Api` prefix.

`apps/web/lib/api-client.ts:1257-1272`

### F47 `[reviewed]` — the public view is coupled for LINE fields only · OPEN

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

### F3 — card payment charges the retained money · OPEN

The balance sent to WiPay is total minus paid. On a $100,000 invoice with 10%
held and $90,000 paid, "pay by card" opens a checkout for $10,000 the contract
says the client keeps. The same comparison in the callback means a retention
invoice can never reach PAID. The lookup also omits `deletedAt: null` and does
not refuse DRAFT.

`payments.service.ts:41`

### F4 — the client-facing PDF and email demand the retained money · OPEN

Both call `invoiceBalanceCents(total, paid)`, and the string "retention" appears
**zero times** in `InvoicePdf.tsx` — no held row, no "Due now". The app's own
screens correctly say "Fully paid apart from retention"; the document in the
client's hand says Amount due $10,000.

`InvoicePdf.tsx:192`, `invoices/[id]/email/route.ts:69`

### F5 — the cash export counts checkouts that were merely opened · OPEN

No status filter. A pending row is written for the full balance the moment a
checkout opens, with `paidAt` defaulting to now, so an abandoned checkout stays
in `payments-received` for ever. The Reports page allow-lists only completed and
recorded payments for this exact reason, and sits on the same screen disagreeing
with the file.

`exports.service.ts:176`

### F6 — `invoice-lines` ignores `markupPct` · OPEN

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

### F8 — an ACCEPTED quote can be rewritten · OPEN

`update` has no status guard, while `remove` two hundred lines away does. A
delete-and-re-persist wipes the lines and totals of a quote the client has
agreed to, possibly with a live share token. The Edit button is hidden outside
DRAFT and the "Mark as sent" modal promises the quote "can no longer be edited
directly" — the promise is UI-only, and `/quotes/<id>/edit` loads any status.
This is the failure §4m rejected variations-by-rewrite to avoid.

`quotes.service.ts:441`, `quotes/[id]/edit/page.tsx:8`

### F9 — editing a quote silently strips `markupPct`, lowering the total · OPEN

The web builder never captures it — **zero occurrences** in `QuoteBuilder.tsx`
and the edit page — and `update` replaces lines wholesale. Open Edit, change
nothing, Save: subtotal, GCT and total all drop by the markup. `priceSource`,
`supplierId` and `overrideNote` go the same way.

`quotes/[id]/edit/page.tsx:44-75`, `line-editor.ts:750`

### F10 — the public share page computes line amounts itself · OPEN

A recompute in display code, and it *cannot* be right: `markupPct` is correctly
withheld from the public select, so the page has nothing to compute with. The
per-line figures do not add up to the subtotal printed directly beneath them,
and the emailed PDF disagrees with the link.

`q/[token]/page.tsx:83`

### F11 — `discountPct` is disclosed to the client and never rendered · OPEN

On a $100,000 quote at 10% off, the client sees a Subtotal, GCT and Total that do
not add up, with the discount they were given invisible. The tenant page has the
row; the client page does not.

`q/[token]/page.tsx:92-113`

---

## Tier 2 — wrong figures and false statements, inside the business

| # | Finding | Where | Status |
|---|---|---|---|
| F12 | **Job profit compares GCT-inclusive revenue against GCT-exclusive cost.** Revenue sums the invoice total, including output GCT remitted to TAJ, while cost correctly nets off reclaimable input tax. It only ever flatters: 65.2% shown where the truth is 60%. Correct for unregistered contractors, which is why it survived. Both fields needed for the fix are already on `Invoice`. | `job-profit.ts:77,89` | OPEN |
| F13 | **A settled-for-now invoice is marked OVERDUE and chased.** `statusForPaid` compares against the total, so a retention invoice stays PARTIAL, the sweep flips it OVERDUE in critical red, and the nightly digest emails the contractor to go chase it. | `payments.service.ts:13-17`, `invoice-overdue.service.ts:73,116,150` | OPEN |
| F14 | **Every reminder promises a link it does not send.** `reminderMessage` is called with no link, so the empty branch always wins, while the modal says "It includes a link to the invoice". `resolveWebBase()` is dead in that file and `shareInvoice()` has no callers — so no invoice ever gets a share token, which makes the public invoice page and `firstViewedAt` unreachable in the shipped product. All four ends built, nothing joining them. The reminder's *amount* is correct. | `invoices.service.ts:624-632,843`, `api-client.ts:1520`, `RemindButton.tsx:94` | OPEN |
| F15 | **`invoices-issued` has no Discount column**, so Subtotal plus GCT does not equal Total for any discounted invoice. The demo fixtures already carry a 5% discount. | `exports.service.ts:83-96` | OPEN |
| F16 | **The free-quote gate is bypassable and over-charges.** Called only from `create`, but it counts *every* `Quote` row — so `revise` and `createVariation` mint usable quotes without limit, while a contractor's own revisions eat their allowance of five. | `quotes.service.ts:216-235,739,791` | OPEN |
| F17 `[reviewed]` | **The admin drawer shows the all-time quote count as "This month".** `t.quoteCount` is passed twice, into slots 7 and 8, and rendered as two different facts. The API has no monthly figure at all. 240 lifetime quotes reads "This month: 240" — on the screen used to decide whether to bill or suspend. | `AdminConsole.tsx:577-578,1899-1900` | OPEN |
| F18 `[reviewed]` | **The drawer's status pill reads over a column only ever written "active".** Three of four branches are unreachable, and the fallback means a suspended, past-due tenant opens as "Active". The tenants table was fixed for exactly this; the drawer was not. | `AdminConsole.tsx:1881-1882` | OPEN |
| F19 `[reviewed]` | **"Active subscriptions" counts neither active ones nor subscriptions.** The status is always active, there is no `deletedAt` filter, and rows exist only for tenants staff have touched — so the tile beside "Total businesses" actually means "tenants a staff member has clicked the plan dropdown on". `financials.proCount` is the honest figure, two clicks away. | `admin.service.ts:230`, `AdminConsole.tsx:547` | OPEN |
| F20 `[reviewed]` | **Every rule card says "Verified" unconditionally**, beneath a red banner saying no one has confirmed the figures against a source, and above its own footer saying "Unverified · core baseline". A staffer scanning badges concludes the tax rate is sourced. The payroll table's badge *is* real. | `AdminConsole.tsx:1393` | OPEN |
| F21 `[reviewed]` | **Retiring a statutory contribution is one-way, and retiring a *custom* one silently does nothing.** (a) The client omits the empty list, so a retirement can never be cleared, and the chip row cannot offer it back — while the comment promises "the decision reverses". (b) `mergeStatutory` applies the retired filter to baseline entries only; custom ones are appended unconditionally, so it reports success and the levy is still in the payroll table. | `AdminConsole.tsx:284-285,233`, `jurisdiction.ts:271,295` | OPEN |
| F22 | **`labourLabel` drops `unitLabel`.** Its sibling `equipmentLabel`, four lines up, gets it right. The dropdown reads "$300.00/**unit**" while picking it correctly stamps "sq ft" on the row — label and value disagree. This is the regression `437c235` was committed to fix. | `JobForm.tsx:137` | OPEN |
| F23 | **`normalizeUnitLabel` is called from one write path out of four.** A material unit typed `m2` becomes `m²`; a *labour rate* typed `m2` stays `m2` and prints "30 m2" on the client's quote. The field's placeholder asks for a character the contractor cannot type, on the path that does not normalise it. | `material-schema.service.ts:234` only; `catalogs.dto.ts:12,39,105` | OPEN |
| F24 | **Equipment hard-deletes a row marked for offline sync.** A plain delete, where all three sibling services soft-delete under the comment "never hard-delete a synced row". Its reads also omit `deletedAt: null` — vacuous now, but whoever fixes the delete ships deleted equipment into every picker unless they fix both reads too. **Equipment is the only one of the four catalogs with no service test**, which is why neither was caught. | `equipment.service.ts:22,34,51` | OPEN |
| F25 | **"Send on WhatsApp" on a DRAFT mints a token, opens a well-formed message, and the link 404s.** `EmailQuoteButton` handles exactly this by advancing DRAFT to SENT after a confirmed send. WhatsApp — the channel the file's own comment calls the one contractors actually use — does not. | `WhatsAppButton.tsx:49-66`, `quotes/[id]/page.tsx:88` | OPEN |
| F26 | **The labour cost helper is bypassed on the only screen that shows labour.** `labourEntryCostCents` floors a bad quantity at 0; the API uses it, the web does not. A quantity of minus 2 reads minus $8,000 in the Labour section while the profit figure above it counts zero — two numbers on one screen from the same row. | `ProjectCosts.tsx:118,262` | OPEN |
| F27 | **The Cost tile's two sub-figures do not add up to the Cost above them.** The purchase component is derived gross of GCT while the headline is net, so the parts exceed the whole by exactly the reclaimable GCT. | `projects/[id]/page.tsx:88-93`, `purchases.service.ts:176` | OPEN |
| F28 | **Every validation rejection reaches the user as "Validation failed".** The pipe generates the real reason and throws it into an `issues` field that **nothing under `apps/web` reads**. Because `errorMessage()` prefers a non-empty server message, this generic string beats every "Couldn't save…" fallback. Root cause behind most of F31. | `zod-validation.pipe.ts:14-17`, `api-client.ts:83` | OPEN |
| F29 `[reviewed]` | **The failure banner cries wolf on every load for every non-super-admin.** Any throw is pushed into the failed list, including the 403s the comments describe as expected — so a MANAGE_TENANTS-only admin sees a red alert naming two sections on every page load. Same class: `SweepPanel` renders for anyone reaching Financials but its endpoint needs MANAGE_TENANTS. | `api-server.ts:605-612`, `AdminConsole.tsx:1580` | OPEN |
| F30 | **The retention snapshot goes stale on a draft edit.** `update` recomputes the totals and never touches `retentionCents`, so a draft edited after conversion can hold 5% while both screens label it "Retention held (10%)" on a finalized document. Related: `dueDate` uses `??`, so it can be set but never cleared — two lines below a comment explaining why that is wrong for a nullable field. | `invoices.service.ts:435-455` | OPEN |

---

## Tier 3 — client/server disagreements, dead controls, prose drift

| # | Finding | Where | Status |
|---|---|---|---|
| F31 | Forms accept what the API refuses, so the save fails with F28's unreadable message: Discount, GCT and Deposit carry no min or max while the sibling Deposit field two lines away has both; `coveragePerSellUnit` allows zero against a positive-only rule; Rate and Price have no floor; `progressPct` accepts 50.5 against an integer rule. | `InvoiceBuilder.tsx:333-335`, `QuoteBuilder.tsx:391`, `MaterialForm.tsx:466-514`, `LabourRateForm.tsx:106-111`, `ProjectForm.tsx:182-190` | OPEN |
| F32 | Non-numeric input is silently coerced to zero in both builders — the preview shows 0% and nothing tells the user their input was ignored. | `QuoteBuilder.tsx:242`, `InvoiceBuilder.tsx:195` | OPEN |
| F33 | **The UTC-5 trap, fifth appearance.** `ProjectCosts` defaults the purchase and labour dates from `toISOString()`, so after 7pm Jamaica time the picker opens on *tomorrow*. `PaymentsPanel:33` already subtracts the offset, with a comment saying why. Two more raw uses to check while in there: `reports/page.tsx:63`, `AdminConsole.tsx:1244`. | `ProjectCosts.tsx:68,77` | OPEN |
| F34 | `dueDate` renders a day early through a raw `toLocaleDateString` — masked by UTC hosts today, wrong in any browser-side mapping in Jamaica and on the PDF the moment a host sets `TZ`. `jamaicaTodayAsUtcMidnight` is private to one service and not exported from core, which is why this could not have used it. | `api-client.ts:310-314,559` | OPEN |
| F35 | The restore banner fires on an untouched **edit** form, offering back a draft identical to what is already on screen — and a stale snapshot for up to seven days. Every draft test renders the new-quote mode, so the edit path is unguarded. | `QuoteBuilder.tsx:186-210`, `quote-draft-recovery.ts:96-102` | OPEN |
| F36 | An unauthenticated GET mutates status — WhatsApp, iMessage and Slack link-preview crawlers mark a quote VIEWED before any human opens it, so the contractor believes the client has read it. The GET also has no throttle override while the POST is tightened to 10/min for token-guessing reasons. | `public-quotes.controller.ts:47`, `quotes.service.ts:404-415` | OPEN |
| F37 | Public share pages fall back to IP keying, and the IP is Vercel's — the page fetches server-side, so every anonymous view platform-wide shares one 120/min bucket. The 121st share-link view in a minute gets a 429, rendered as "link unavailable" for a perfectly valid quote. Availability only; the decision *write* is client-side and unaffected. | `public-quote.ts:43`, `public-invoice.ts:33` | OPEN |
| F38 `[reviewed]` | Dead controls on the admin console: four "Source" links are anchors to `#` with `preventDefault`, while a real URL sits in scope and working links exist 150 lines above; the header search with its keyboard hint is a div of spans; the tenant filter pills have a pointer cursor and no handler; the Regulatory nav badge is a hardcoded 3 one line from the real count; the "PRODUCTION" pill has no env check. | `AdminConsole.tsx:753,758,802-806,929-933,1407` | OPEN |
| F39 `[reviewed]` | The manual sweep is the one mutating admin route with no audit entry — and that run can revert tenants to free and send email. The sweep-run table records *that* a manual run happened, not who pressed it. | `admin.controller.ts:259-263` | OPEN |
| F40 `[reviewed]` | Money renders through `formatJmd` while the currency is free text with no ISO check. Set it to USD and the Financials tile shows a JMD symbol beside the letters USD. The one-helper rule is being followed; the helper simply is not parameterised. | `AdminConsole.tsx:1476`, `billing.dto.ts:9` | OPEN |
| F41 `[reviewed]` | Pricing save reports success on a field it dropped — a falsy coercion turns a cleared or mistyped value into an omission the server reads as "leave unchanged". A wording problem rather than a data one, since the form re-renders from the response. | `AdminConsole.tsx:203-206` | OPEN |
| F42 | Library and client ids accepted without ownership checks on jobs and projects — lesser cousins of F1. A crafted job plants another tenant's row id in your own recipe; not a leak today because the read never dereferences the relation, and it becomes one the first time anyone adds an include for the material. | `jobs.service.ts:41-43`, `projects.service.ts:11,29` | OPEN |
| F43 | Smaller wired-then-dropped items: `annualCount` is computed, tested, sent and unread by the web; "Applied (YTD)" has no year filter, so a 2024 review counts toward this year; `publishedAt` orders the regulatory feed and is never rendered, so the ordering looks arbitrary on screen; `detailLevel` reaches the client and is ignored there; variations are visible only from the variation, so a contractor accumulates empty DRAFT variations, each burning a quote number. | various | OPEN |
| F44 | Undefined CSS custom properties: two tokens are defined only inside the admin console module, so on the tenant app both render in inherited colour — one of them the "Couldn't create the share link" error. | `WhatsAppButton.tsx:86`, `EmailQuoteButton.tsx:112` | OPEN |
| F45 | `toCents` is money math outside core: `toCents("1.005")` returns 100, not 101, because float error puts the product below the half-cent. Sub-cent, but it is the entry point for every price a contractor types. | `line-editor.ts:74` | OPEN |
| F46 | `no-unused-vars` is an error in `apps/web` and **a warning in `apps/api`**, with no max-warnings gate, so on the API side it cannot fail a build. CONTRACTS.md treats it as the rule that caught three wired-one-side-only defects. It is currently sitting on two live dead reads in the sweep service. | `apps/api/.eslintrc.json:20-23` | OPEN |
| F48 `[reviewed]` | **Un-retiring a statutory contribution reports success and writes nothing, and each save silently undoes the last.** `rpCustom`/`rpRetired` are initialised to `[]` on every mount and never seeded from the pack, while the API treats both as complete *replacement* lists. So: clicking a retired pill again omits the key entirely and the stored retirement survives (`Saved ✓`, nothing changed); after a reload the retired code has no pill at all, so retirement is permanent from the UI; and retiring a second code replaces the first, resurrecting it unannounced. Same shape for custom levies — adding a second deletes the first. The guard omitting the empty list carries a comment explaining why it is correct. `rpSourcesDraft` three lines away does it right, seeding from the pack with a `touched` flag. | `AdminConsole.tsx:232-233,284-285,1300-1320`, `rulepack.service.ts:196-204` | OPEN |
| F49 `[reviewed]` | **`LAST ACTIVE` renders the signup date.** No activity timestamp exists on `AdminTenant`; the cell is `relativeTime(t.createdAt)`. A tenant who signed up two years ago and never returned reads "2 years ago" only by coincidence. Rename the column or add a real `lastActiveAt`. Beside it, `TenantRow` index 6 is a literal `"—"` read by nothing — the hole where the removed MRR was. | `AdminConsole.tsx:944,575-576,1006` | OPEN |
| F50 `[reviewed]` | **The hand-written-shapes guard misses ~17 response shapes because their names lack the `Api` prefix — nine of them carrying money or tax rates**: `AdminFinancials` (`mrrCents`), `PricingConfig`, `EffectiveRulePack` and `EffectiveStatutory` (tax and statutory percentages), `BillingStatus`, `AdminSubscriptionPayment`, `AdminSweepRun`, `CardPaymentResponse`, `AdminUpcomingRenewal`. It also matches only `export interface`, so `export type ApiFoo = {…}` walks past it — plausible, since the surrounding lines are all `export type Api… =`. And the deadness check inherits both holes, which is why F2 went unflagged. **`EffectiveRulePack` is duplicated field-for-field** between `api-client.ts:1157` and `rulepack.service.ts:29` — two hand-maintained copies of the shape carrying `defaultTaxRatePct` into a quote. | `hand-written-shapes.test.ts:66`, `api-client.ts:1102,1144,1157,1257,1280,1289` | OPEN |
| F51 `[reviewed]` | **A bounded namesake makes the unbounded field look checked.** `quotes.dto.ts:16` bounds `description` to 500 — but that is `quoteLineJobComponentSchema`'s display snapshot, not the line item's. The line item's `description` comes from core unbounded, and the guard scanning that file finds the bounded one. This is why F-series "0 unbounded" read as true. | `validators.ts:22,43`, `quotes.dto.ts:16,33` | OPEN |
| F52 `[reviewed]` | **`admin-console-honesty.test.ts` has no teeth against a new fabrication.** Five of six blocks are denylists of strings already deleted (`"2418540"`, `"Blue Mountain Builders"`); only two assertions generalise and both are sidestepped by inlining a figure at its render site — which is how every original fabrication was written. It asserts nothing about having found its subjects, so a rename empties it silently. **It passes today alongside F17, F18, F20, F38 and F49.** What would have teeth: no metric labelled "month"/"today" rendered from an unwindowed value; every `Verified` badge inside a ternary; no `cursor:pointer` element without an `onClick`; `PRODUCTION` not a string literal. Each catches a class, and each fails today. | `admin-console-honesty.test.ts:26-81` | OPEN |

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
