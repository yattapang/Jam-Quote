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
| `apps/api` | 49 | 563 | Services with a fake Prisma, PGlite migration replays, wire contracts, write-path parity, input bounds, public disclosure |
| `apps/web` | 30 | 436 | Pure logic, source guards, and **6 component suites** |

**The structural gap that closed on 2026-09-08:** nothing had ever rendered a
component. Every form defect the owner found by clicking was invisible to the
suite — whether a button is disabled, or a field groups its digits, is a
property of the rendered output.

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
| `QuoteBuilder` draft recovery | The banner appears only for a draft worth restoring, never on an untouched form; Restore repopulates; Start fresh clears; and **typing dismisses it and starts autosaving** |

### Owed, highest value first

| Suite | Why it matters | Defect precedent |
|---|---|---|
**Two notes from writing these**, both about the tests rather than the code:

- `vi.mock` factories are HOISTED, so a class declared below them is not
  initialised when the factory runs. It fails as "Cannot access X before
  initialization", which reads like a broken component. `vi.hoisted` is the fix.
- The delete trigger and its confirm button share the accessible name "Delete",
  so a name query matches both once the modal opens. Handled in the test, but
  noted as a real if minor accessibility smell — two controls with one name, one
  of them destructive. Renaming the confirm is a product decision, not a test's.

| `LineItemsEditor` | Unit label per line via `lineUnitLabel`; the category dropdown showing its options | "30 units" for a job sold by the metre; the invisible datalist |
| `RetentionPanel` | Held vs due-now; release disabled on a draft | Retention read as a shortfall |
| `MaterialForm` | Coverage hint; the unit picker; `m2` → `m²` | All three were owner findings |
| `QuoteDecision` (public) | Accept/decline once only; a settled quote offers no buttons | New, unexercised |

---

## 3. Input validation (Phase A)

The owner's original ask: *"many different scenarios and combinations for
testing all the input forms, on the tenant side and on the backend"*.

### Measured state, 2026-09-08

**146 `z.string()` fields across 16 DTOs. 117 carry a value constraint**
(`.max`, `.min`, `.email`, `.uuid`, `.datetime`, `.regex`). **29 carry none.**

> An earlier pass in this session reported 103 unconstrained. That was **wrong**
> — the regex behind it did not count `.datetime()`, `.min()` or `.regex()` as
> constraints. The real figure is 29, and the DTOs are in much better shape than
> that first number suggested. Recorded because a wrong measurement in a
> planning document is worse than none.

The 29, by module: `admin` (actionNeeded); `business` (addressLine, tradeType);
`catalogs` (category, skillTier, unit, vendor, vendorPhone); `clients`
(addressLine, lastName, notes, phone, whatsapp); `invoices` (terms); `projects`
(addressLine); `quotes` (terms); `sync` (11, mostly the client mirror).

Most are free text where an upper bound is the only real want — a 100kb
`description` will not break the database but will break a PDF and make a CSV
cell unreadable. Express caps a JSON body at 100kb by default, so this is a
robustness and cost issue rather than a security one.

### Owed

| Item | Notes |
|---|---|
| ~~Guard: no NEW unconstrained string field~~ | **DONE.** `input-bounds.test.ts`. It also refuses to let its own allow-list rot, which caught the list twice while the seam fixes below were landing |
| **Bound the remaining 11** | Started at 29. Sharing the client and project field rules across the two doors bounded **18 of them as a side effect** — the argument for fixing a seam rather than patching each side. `terms` is the one that matters most: it prints on the document a client reads |
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
| `Client`, `Business`, `Project`, `LabourRate`, `EquipmentItem` | **Done.** Web infers; API proves |
| `MaterialFavourite` | Owed — flat, quick |
| `Invoice` | Owed — nested sections, line items, retention, payments, reminders |
| `Quote` | Owed — nested, plus variations and the client decision fields |
| `PublicQuoteView` | **Done, and guarded twice.** A source-reading disclosure test over the Prisma `select`, plus a `.strict()` wire contract — the only strict schema in `wire/`, because here an unexpected field is a disclosure rather than a shrug. The web derives from it |
| `PublicInvoiceView` | Disclosure test done; the `.strict()` contract still owed — same shape as the quote one |

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
