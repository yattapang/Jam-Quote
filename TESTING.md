# Testing — what exists, and what is still owed

**Written 2026-09-08.** The standing register of test work, so nothing is
forgotten between sessions. Companion to `CONTRACTS.md` (the seams) and
`PLANNING.md` (features).

Update this file when a row is finished. A backlog that lives only in a
conversation is a backlog that gets re-derived badly.

---

## 1. Where the suite stands

| Suite | Files | Tests | Kind |
|---|---|---|---|
| `packages/core` | 23 | 269 | Pure logic — totals, money, dates, settlement, vocabulary |
| `apps/api` | 54 | 616 | Services with a fake Prisma, PGlite migration replays, wire contracts, write-path parity, input bounds, public disclosure |
| `apps/web` | 31 | 449 | Pure logic, source guards, and **7 component suites** |

**The structural gap that closed on 2026-09-08:** nothing had ever rendered a
component. Every form defect the owner found by clicking was invisible to the
suite — whether a button is disabled, or a field groups its digits, is a
property of the rendered output.

The web suite takes ~36s of test time (~50s wall), up from ~7s before the DOM
suites — almost all of it jsdom environment setup, which is why jsdom is opted
into per file rather than switched on globally.

**The gap still open:** nothing exercises the tenant↔API boundary over HTTP. All
API tests use a fake Prisma or an in-process Postgres; no test makes a request.

---

## 2. Component suites (Phase B)

Each one aims at a defect that actually shipped, and each was verified by
reintroducing that defect and watching it fail. **A component test that has
never failed proves only that it runs.**

### Done

| Suite | Pins |
|---|---|
| `EmailInvoiceButton` | The gate accepted as a prop and dropped, leaving the button live against an unverified domain |
| `ClientForm` | The TRN that would not group; `town` reaching the payload |
| `ProjectForm` | Blank retention vs a typed `0`; the PROJECT/JOB vocabulary on screen |
| `RemindButton` | WhatsApp and email each disabled for their OWN reason, each stated in text rather than a tooltip; the chase count; the API's real refusal |
| `DeleteRowButton` | Confirms first; the API's own reason on refusal; blames the network only when the fetch never completed; a failed delete does not navigate |
| `QuoteDecision` (public accept/decline) | A settled quote offers NO buttons — two people opening the same link is the common case; a name is required; the API's own refusal sentence is shown rather than "is the API running?"; an acceptance never carries a decline reason |
| `QuoteBuilder` draft recovery | The banner appears only for a draft worth restoring, never on an untouched form; Restore repopulates; Start fresh clears; and **typing dismisses it and starts autosaving** |

### Owed, highest value first

| Suite | Why it matters | Defect precedent |
|---|---|---|
| `LineItemsEditor` | Unit label per line via `lineUnitLabel`; the category dropdown showing its options | "30 units" for a job sold by the metre; the invisible datalist |
| `RetentionPanel` | Held vs due-now; release disabled on a draft | Retention read as a shortfall |
| `MaterialForm` | Coverage hint; the unit picker; `m2` → `m²` | All three were owner findings |

None of the three is protecting something that has actually broken since it was
fixed, and `LineItemsEditor`'s two defects already have a source guard behind
them. They are worth doing; they are not what is holding anything up.

**Two notes from writing these**, both about the tests rather than the code:

- `vi.mock` factories are HOISTED, so a class declared below them is not
  initialised when the factory runs. It fails as "Cannot access X before
  initialization", which reads like a broken component. `vi.hoisted` is the fix.
- The delete trigger and its confirm button share the accessible name "Delete",
  so a name query matches both once the modal opens. Handled in the test, but
  noted as a real if minor accessibility smell — two controls with one name, one
  of them destructive. Renaming the confirm is a product decision, not a test's.

---

## 3. Input validation (Phase A)

The owner's original ask: *"many different scenarios and combinations for
testing all the input forms, on the tenant side and on the backend"*.

### Measured state — every string input is now bounded

**139 `z.string()` fields across 16 DTOs. All 139 carry an upper bound.**

The count went **29 → 11 → 58 → 0**, and every step is worth knowing because
three of them were my own measurement being wrong:

| Count | What it was |
|---|---|
| **29** | The first measurement of fields with no value constraint |
| **11** | After sharing the client and project field rules across the REST and sync doors, which bounded **18 as a side effect** — the argument for fixing a seam over patching each side |
| **58** | The real figure. The guard had been counting `.min()` as a constraint, and `.min(1)` stops an EMPTY string while saying nothing about a 100kb one — which is the failure it exists to prevent. It hid 47 fields |
| **0** | All bounded. `input-bounds.test.ts` now requires an upper bound specifically, and its allow-list is empty |

> An even earlier pass reported **103**. That was also wrong — the regex behind it
> did not count `.datetime()`, `.min()` or `.regex()` at all. Recorded because a
> wrong number in a planning document is worse than no number, and this one was
> wrong twice in opposite directions.

**Limits are generous on purpose** — `terms` allows 5000 characters, `description`
500, ids 64 (a UUID is 36). The point is to stop a payload, not to police
wording. `password` is capped at 256 with a note: bcrypt only reads the first 72
bytes, so anything beyond that is discarded before hashing anyway.

### Owed

| Item | Notes |
|---|---|
| ~~Guard: no NEW unconstrained string field~~ | **DONE.** `input-bounds.test.ts`, now requiring an UPPER bound. It also refuses to let its own allow-list rot, which caught the list three times while the fixes landed |
| ~~Bound the free-text fields~~ | **DONE — all 139.** See the table above for how the count moved, and why two of the figures were my own error |
| **Validation matrices for the money DTOs** | `quotes`, `invoices`, `payments`, `purchases`: empty, zero, negative, fractional cents, huge, unicode, formula-leading `=`, and cents-vs-dollars confusion |
| **Date-string boundaries** | Every `.datetime()` field against the Jamaica UTC-5 edge cases that have produced the same bug three times |
| **Id fields that should be `.uuid()`** | `clientId`, `projectId`, `jobId`, `supplierId` and friends are free strings. Tenant checks make this safe, not clean — a bad id 404s instead of being rejected |

### Found while measuring — a real defect, not a test gap

**Two doors into `Client.email` with different rules.** `POST /clients` requires
`z.string().email()`. `POST /sync` accepts `z.string().nullish()` — any string
at all. A mobile client can plant `"not-an-email"` in the column the REST path
guards, and then "Send by email" tries to send to it and the accountant export
carries it.

**Also `parish`**, which is worse: the REST path requires one of the fourteen,
sync accepted any string. A parish keys the jurisdiction rule-pack, so an
invented one silently matches nothing.

**FIXED 2026-09-08.** The value rules now live once in `clientFieldRules` and
each path applies its own presence rule on top — REST `.optional()` (absent means
leave alone), sync `.nullish()` (null means the device cleared it). Divergence is
structurally impossible rather than something a test must notice.
`client-validation-parity.test.ts` states the intent and was verified against the
real divergence.

**The PROJECT table had the identical divergence**, found by the input-bounds
guard rather than by looking: `POST /projects` required a real parish and capped
`town`; sync accepted any string for both. What made it easy to miss is worth
recording — the sync schema carries a comment reading *"Same enum the REST DTO
takes"*, which is true, and about `stage`, sitting two lines below a `parish`
that was still free text. **A right idea next to the wrong field.** Fixed the
same way, with `projectFieldRules`.

**Two things that happened writing that test, both worth keeping:**

- Tightening sync immediately broke `sync.service.test.ts`, whose fixture typed
  `parish` as a plain `string`. That is the loose contract showing: the fixture
  could only compile because nothing constrained the value.
- **The first version of the parity test was vacuous.** `pushSchema` is
  `{ clients: [], projects: [] }` with both arrays defaulted, and the test sent an
  invented `changes` key. Zod ignored the unknown property, the envelope parsed
  clean, and the invalid email "passed" because nothing had looked at it. Only
  the assertion that it should be REJECTED exposed that — which is the third time
  in this repo that asserting a failure caught a test checking nothing.

---

## 4. Wire contracts (`CONTRACTS.md` seam 1)

| Shape | State |
|---|---|
| `Client`, `Business`, `Project`, `LabourRate`, `EquipmentItem`, `MaterialFavourite` | **Done — every flat shape.** Web infers; API proves |
| `Quote` | **Done.** Two exports, because the LIST read genuinely sends a different shape from the DETAIL read — see below |
| `Invoice` | **Done.** Two exports like the quote, plus the payment and reminder ledgers |
| **The nine shapes the app actually turns on** | **All done.** Every entity a contractor reads or writes crosses the seam under contract |
| `PublicQuoteView` | **Done, and guarded twice.** A source-reading disclosure test over the Prisma `select`, plus a `.strict()` wire contract — the only strict schema in `wire/`, because here an unexpected field is a disclosure rather than a shrug. The web derives from it |
| `PublicInvoiceView` | **Done.** Disclosure test plus a `.strict()` contract that refuses the payment and reminder ledgers by name. The web derives from it |

---

### What `MaterialFavourite` taught, being the richest flat shape

Its old declaration marked **every** field optional-and-nullable, which flattened
three genuinely different facts into one:

| Fact | Fields | What the flattening cost |
|---|---|---|
| Always present, sometimes null | `unit`, `category`, `description`, `measureUnit`, `coveragePerSellUnit` | Nothing much — this is the honest case |
| Always present, **never** null | `nameCustom`, `priceCents` | `=== undefined` and `=== null` checks that can never be true |
| **Genuinely** optional | `unitRef` | The real one, hidden among the noise |

`unitRef` is the one that matters, and it has history: materials once lost their
unit on create because `create` and `update` omitted `include: { unitRef: true }`
while the reads had it — a fresh material came back without its unit and the quote
line read "30 units". It is a JOIN, not a column, so it is legitimately optional,
and the contract now says so where the old declaration said it of everything.

The tests cover the joined payload, the unjoined one and a null `unitRef`, rather
than pretending only one shape exists. They also cover a pre-2a row, since both
generations of `unit`/`category` still live in the column set.

---

### The quote contract: two shapes, and one principle applied against myself

`GET /quotes` runs a `findMany` with **no include**, so a list row carries the
columns and nothing else; `GET /quotes/:id` includes the sections and lines. Same
entity, two shapes.

The old interface expressed that by marking `lineItems` and `sections` optional —
accurate, but it told a reader nothing about why, and it left every caller
checking at runtime. There are now two exports: `quoteWire` for what any endpoint
sends, and `quoteDetailWire` where the nested items are guaranteed, so a caller
that needs the lines says so in a type.

**Where the principle bit back.** The API sends a section `id`, and my first
draft required it — at which point three test fixtures failed for omitting a
value nothing consumes. The web keys sections by index and never reads that id.
`wire/README.md` says a contract is *"the fields the web RELIES ON, not a mirror
of every column"*, so the honest move was to drop it from the schema rather than
edit three fixtures into agreeing with a field nobody uses. Written down because
the temptation ran the other way.

**What the tightening did surface** was real: the mapper fixtures had been
omitting `unitLabel`, `jobId`, `jobName`, `jobUnit` and `jobComponents`, and
claiming a payload the API never produces. They compiled only because the old
interface made everything optional. A fixture that describes an impossible
response is a test asserting something about nothing.

**One union kept on purpose.** `jobComponents[].quantityPerUnit` accepts a string
or a number, because it comes from a JSON snapshot rather than a column — a
serialized `Decimal` is a string, but an older client may have written a number.
That is the one place in `wire/` where a union is honest rather than lazy, and
both branches are tested.

---

## 4b. The public views were over-disclosing

**Found 2026-09-08 while starting on their wire contracts.**

Both public views reused the TENANT's include (`QUOTE_DETAIL_INCLUDE` /
`INVOICE_DETAIL_INCLUDE`), so every line sent to an anonymous share-token holder
carried the whole Prisma row:

| Field | What it tells the client |
|---|---|
| **`markupPct`** | **The contractor's margin on that line** |
| `supplierId` | Which merchant they buy from |
| `priceSource` | How the price was arrived at |
| `overrideNote` | An internal note about why a price was overridden |
| `quoteId`, `sectionId`, `updatedAt`, `deletedAt` | Plumbing |

The client page reads none of them — it renders description, quantity, unit and
amount, eight fields in total.

**`markupPct` is the one that matters.** A contractor's margin is the most
commercially sensitive number in a quote, and the client is the one person who
must not have it.

**It had never leaked.** All three sensitive columns are null across every line
item in production, and no quote currently holds a live share token — verified
before writing this up. So it was latent, not an incident. But the column is
real and the app supports markup, so the first contractor to use it and share a
quote would have handed their client the margin.

**How it happened, and the lesson.** The view's own comment read *"everything
here is already printed on the PDF the client is being sent, and nothing else"* —
true of the top-level fields it listed by hand, and false of the nested rows it
pulled in with a spread. **A spread inherits decisions nobody re-made.** The
declared type said the same thing: `lineItems: QuoteWithLines["lineItems"]` means
"whatever the tenant read returns", which cannot be reviewed as a disclosure
decision.

**Fixed** with an explicit `PUBLIC_LINE_SELECT` in both services and a spelled-out
`PublicQuoteLine` / `PublicInvoiceLine` type. A field now reaches a client only by
being named, so any future disclosure is a visible line in a diff.

**Guarded twice, at different levels.** `public-quote-disclosure.test.ts` and its
invoice twin read the source — because the boundary is a `select`, and a test over a sample row
would pass the moment someone widened it and the sample happened to lack the new
field. Each forbidden field is listed with the reason it is forbidden. Verified
by adding `markupPct` and `supplierId` back and watching both go red.

And `publicQuoteWire` is `.strict()` — the ONLY strict schema in `wire/`, since
everywhere else a schema is a floor and extra fields are tolerated because the
browser cannot be broken by data it never reads. Here an extra field IS the
harm, so the parse fails. Verified by removing `.strict()` and watching three
tests go red. The web now derives its public types from that contract, which also
retired two more `string | number` unions.

---

### What the invoice contract adds, and what it refuses

An invoice discloses four things a quote does not, and each is the client's own
business: `paidCents` (what they paid), `retentionCents` and `retentionReleased`
(what they are holding under the contract — hiding it would make the balance look
wrong), and `issueDate` / `dueDate` (what is owed, and by when).

**What it refuses by name, with tests:**

- **The payment ledger.** `paidCents` is a total the client is entitled to. Which
  method, which date, which bank reference is the contractor's record of their own
  banking, and a client needs none of it to pay an invoice.
- **The reminder ledger.** How many times a contractor has chased this client, and
  when, is between the contractor and their own records.

Neither was ever exposed — the view's return object always listed its top-level
fields by hand, so `payments` and `reminders` were fetched by the include and
dropped. **Only the nested LINE rows leaked**, because `lineItems` passed whole
rows through. Worth stating precisely: the allow-list worked exactly where someone
had written it out, and failed exactly where a spread stood in for it.

The line shape is **shared** between the two contracts rather than restated. A
quote line and an invoice line disclose identically, and two copies of a
disclosure boundary are two boundaries that will eventually differ.

---

### Seam 1: what is done, and what is honestly left

**Done — every shape the app turns on:** `Client`, `Business`, `Project`,
`LabourRate`, `EquipmentItem`, `MaterialFavourite`, `Quote`, `Invoice`, and both
public views. The web declares none of them; each is `z.infer<>` of a contract in
`packages/core/src/wire/`, and the API proves it keeps each promise.

**Sixteen hand-written `Api*` interfaces remain**, and they are deliberately
lower priority rather than forgotten:

| Group | Shapes | Why it can wait |
|---|---|---|
| Material schema tree | `ApiMaterialSchema`, `ApiMaterialAttribute`, `ApiMaterialCategory`, `ApiMaterialUnit`, `ApiMaterialAttributeOption` | Read-mostly configuration. A drift here empties a picker, which is loud |
| Job library | `ApiJob`, `ApiJobComponent` | Same shape family as quote lines, already contract-covered in effect |
| Costing | ~~`ApiPurchase`, `ApiLabourEntry`~~ **done**; `ApiSupplier`, `ApiSupplierPrice` remain | The two that carry cents are covered. The suppliers pair is a name and a price list |
| Admin / misc | `ApiRegulatoryUpdate`, `ApiHiddenCatalogEntry`, `ApiLogoMeta`, `ApiErrorBody`, `ApiInvoiceSection` | Staff-facing or trivial |

~~The costing group is next.~~ **Done.** `ApiPurchase` and `ApiLabourEntry` were
the ones that mattered: they carry cents and feed `computeJobProfit`, the money
seam that has been bitten twice. Fourteen `Api*` interfaces remain, none of them
on a money path.

Their old declarations were already GOOD — nullable where the column is nullable,
`quantity` correctly a string. Converted anyway, because a good hand-written
duplicate is still a duplicate, and the next person to add a field has two places
to remember.

**The pattern that made all of this cheap** is worth restating: a contract plus a
typed sample. TypeScript checks the sample against Prisma's generated type, so a
renamed column breaks compilation; Zod checks it against what the web reads, so a
dropped field fails the parse. Neither alone is enough, and together they cost
about forty lines per shape.

---

## 5. Not yet built, deliberately

| Item | Why it waits |
|---|---|
| **HTTP-level API tests** (supertest) | Would test guards, pipes and status codes for real. Real value; needs a test database story first |
| **Playbook E2E** (Playwright) | The only thing that tests tenant↔backend for real. Owner chose Phase A+B first; revisit against `app.educatebgreat.com` once it is up |
| **Live-database schema comparison** | Manual before a deploy. Automating means production credentials in CI, which buys less than it costs at this size |
| **Rule-pack feed verification** | No machine-readable source of Jamaican tax rates exists. A scraper over prose gives confident wrong answers about tax |

---

## 6. The review agents

Nine in `.claude/agents/`, read-only. Worth one pass each **after** the wire
contracts land — running them now means reviewing a moving target.

`wiring-contract-reviewer` is aimed at `CONTRACTS.md`; `form-input-auditor`
produces the field inventory that feeds §3's matrices.

---

## 7. How to write a test in this repo

Learned from the guards that did not work first time:

1. **Verify it fails on the defect it names.** Reintroduce the bug, watch it go
   red, restore. Two guards in this repo passed vacuously until this was done —
   one because it never saw the field group where the bug lived, one because a
   *comment* about the bug counted as evidence the bug was fixed.
2. **Assert it found its subjects.** `expect(files.length).toBeGreaterThan(n)`,
   so a rename cannot silently empty it.
3. **Allow-lists carry written reasons.** An exception with a justification is
   documentation; a bare entry is a hole.
4. **Comment the failure, not the rule.** "Screens bypassed this and printed 30
   units" outlives "always call lineUnitLabel".
5. **`// @vitest-environment jsdom` per file**, never globally — the pure-logic
   majority should not pay for a DOM they never touch.
