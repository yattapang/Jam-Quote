# Contracts and drift

**Written 2026-09-08.** How the four applications in this repo agree with each
other, and how that agreement is kept rather than hoped for.

Companion to `PLANNING.md` (what is built) and `COMMERCIAL-LAUNCH.md` (what is
needed to charge money). This one is about the seams.

---

## 1. Why this document exists

Almost every defect this project has shipped lived in a seam, not in a module.
The modules are well tested — 1,100-odd tests, and the logic in
`packages/core` is genuinely solid. What has broken, repeatedly, is two sides
of a boundary disagreeing while both compiled and both passed their own tests:

| What drifted | What the contractor saw |
|---|---|
| `unavailableReason` accepted as a prop, never read | An email button that stayed live against an unverified domain |
| `Client.town` validated by the DTO, never written | A field they filled in that silently vanished, and an export column that could only ever be empty |
| `@map("costingJobId")` disagreeing with the migration | Every invoice read failing |
| `csvText` output re-escaped by `csvCell` | Tax numbers mangled by Excel, the protection undone by the layer above it |
| A publish button wired to nothing | "Rule-pack published to production" — and nothing published |

None of these were logic errors. Every one was an agreement failure.

**The principle this document argues for: prefer designs where drift cannot
happen over tests that detect drift after it has.** A test that catches drift is
worth having. A structure where the two sides cannot disagree is worth more,
because it converts a runtime surprise into a compile error at the moment
someone types the mistake.

---

## 2. The four seams

### Seam 1 — web ↔ API wire shapes

**The problem.** `apps/web/lib/api-client.ts` declares `ApiQuote`,
`ApiInvoice`, `ApiClientRow` and about a dozen others **by hand**. The API
returns Prisma rows serialized to JSON. Nothing connects the two. Rename a
field in the API and the web still compiles, still passes, and renders
`undefined` to a contractor.

This is the largest untreated drift surface in the repo.

**The fix: core owns the wire shape.**

```
packages/core/src/wire/*.ts     Zod schemas describing the JSON on the wire
        │                       (dates as ISO strings, Decimals as strings)
        ├── apps/web            infers its types: z.infer<typeof clientWire>
        └── apps/api            asserts its serialized output parses
```

Neither side declares the shape. The web cannot read a field the schema does
not have, and the API cannot stop sending one without a test failing. Drift
becomes impossible rather than detectable.

**Why the WIRE and not the service return type.** A Prisma `Decimal` and a
`Date` do not survive JSON. `gctRate` leaves the API as `"15"` and `issueDate`
as `"2026-08-03T00:00:00.000Z"`. The service's TypeScript type is therefore a
lie about what the web receives, and typing the web from it would move the
drift rather than remove it. The schema describes what actually arrives.

**Migration order** — smallest and least coupled first, so the pattern is proven
before it meets a nested document:

1. `Business`, `Client` — flat, few fields, many readers
2. `Project`, `LabourRate`, `MaterialFavourite`, `EquipmentItem`
3. `Invoice` — nested sections and line items, retention, payments, reminders
4. `Quote` — nested, plus variations and the client decision fields
5. The public views (`PublicQuoteView`, `PublicInvoiceView`) — these are
   **allow-lists and a security boundary**, so their schema is the specification
   of what an anonymous caller may read, and adding a field to one is a
   disclosure decision that should be visible in a diff

### Seam 2 — DTO ↔ persistence

**The problem.** A Zod DTO validates a field the service never writes. The
request succeeds, the value disappears. `Client.town` did this for months and
was found only because an export read the empty column.

**The fix: a source-scanning guard.** For every field in every `*.dto.ts`,
assert the corresponding service mentions it. Crude, and it catches the exact
failure — the field is either in the write or it is not. An allow-list carries
the deliberate exceptions (a field consumed rather than stored, like a legacy
`name` that is split into `firstName`/`lastName`), so each exception has to be
argued for in a diff rather than added silently.

This cannot be a type: Zod's inferred input type and the Prisma write type are
different shapes on purpose, and nothing requires them to overlap.

### Seam 3 — Prisma schema ↔ migrations ↔ live database

**Mostly solved already**, and worth keeping. `project-stage-migration.test.ts`
replays every migration into an in-process Postgres (PGlite) and compares the
result against `schema.prisma`. That test caught the ENQUIRY addition the day it
was made.

**Two rules it enforces the hard way, both learned from failures:**

- A `.sql` migration must never contain `///`. That is a Prisma doc comment, not
  SQL, and it produced a P3009 that blocked all migrations.
- An assertion about "the schema today" must read from a FULLY migrated
  database. Comparing a point-in-time replay against the current schema holds
  only until the next migration touches that object.

**Gap:** nothing compares the live database against the schema. Render applies
migrations on boot, so drift is unlikely — but "unlikely" is not "observable".
A read-only check against the live enum and column set, run manually before a
deploy, closes it cheaply.

### Seam 4 — core ↔ apps

**The problem.** `packages/core` owns totals, money formatting, settlement,
dates and vocabulary. Every time an app re-implemented one of those, it drifted:
`money()` that formatted without converting cents (a 100× error on screen), five
screens looking up units directly instead of via `lineUnitLabel`, nine surfaces
printing a raw TRN.

**The fix, and it is already the house pattern: source guards over the bypass.**
`unit-label-usage.test.ts`, `trn-display-usage.test.ts`,
`send-gate-usage.test.ts` and `error-message.test.ts` all work the same way —
they scan for the raw alternative and fail when a screen uses it. Each carries an
allow-list with a written reason.

**A second, subtler hazard.** `@jamquote/core` resolves to built `dist` for the
apps. A core change that is not rebuilt fails at runtime while every test
passes, because the tests inside core run from source. This has bitten twice in
one session. The build ordering is a real contract and deserves to be enforced
by the build, not remembered.

---

## 3. Managing drift — the standing plan

### Three lines of defence, in order of preference

**1. Make it impossible.** One owner for every shape and every rule. Seam 1's
wire schemas, and core owning all money and date logic. Prefer this always: it
fails at the keystroke.

**2. Make it fail the build.** Where the type system cannot express the
invariant, a source guard can. This repo has five, each of which has caught a
real defect. They are cheap, fast, and readable.

The rules for writing one, learned the hard way:

- **It must fail on the defect it describes.** Verify by reintroducing the bug
  and watching it go red. A guard that has never failed is a guard nobody knows
  works — two of the five were initially written wrong and passed vacuously.
- **It must find its own subjects.** Every guard asserts it located at least N
  call sites, so a rename cannot quietly empty it.
- **Allow-lists carry reasons.** An exception with a written justification is
  documentation; a bare path is a hole.
- **Comment the failure, not the rule.** "Screens bypassed this and printed 30
  units" outlives "always use lineUnitLabel".

**3. Make it visible.** `no-unused-vars` is an ERROR here, not a warning,
because that same warning marked three real defects and was read past every
time. **A warning among warnings is not an invariant.** The build is clean, and
keeping it clean is what makes the next warning mean something.

### The review agents

`.claude/agents/` holds nine independent reviewers — seven by section, one for
these four seams, one that enumerates every input field. They exist because
drift is easier to see from outside the module that caused it. They are
read-only: a reviewer that edits stops being able to report what it found.

`wiring-contract-reviewer` is the one aimed squarely at this document.

### What is deliberately NOT automated

- **Rule-pack verification.** No machine-readable feed of Jamaican tax rates
  exists; TAJ publishes prose. A scraper over a page that can be reworded would
  give confident wrong answers about tax, which is worse than an honest "last
  verified 14 months ago". Staleness is surfaced; judgement stays human.
- **Live-database schema comparison on every deploy.** Worth doing manually
  before a release. Automating it means credentials in CI for a production
  database, which buys less than it costs at this size.

---

## 3b. What building the first guard actually taught us

Worth recording, because it is the strongest argument in this document for the
"verify it fails" rule above. The DTO↔persistence guard passed **vacuously
twice** before it worked:

1. **First version** collected fields only from consts named `create*`/`update*`.
   It passed with `Client.town` deleted, because `town` lives in
   `clientContactFields` — a shared field group spread INTO those schemas. *The
   fields that actually broke were the ones the parser could not see.*
2. **Second version** read the field groups too, and immediately failed its own
   sanity check ("finds at least 30 fields") because the depth counter counted
   parens as well as braces, so `z.object({` jumped from depth 0 to 2 and no
   field was ever at depth 1.
3. **Third version** counted braces only, found the fields — and passed with
   `town` deleted AGAIN, because `clients.service.ts` carries a comment
   explaining that `town` had once been dropped. **The word appearing in a
   sentence about the bug counted as evidence the bug was fixed.**

Comments are now stripped before the search. The lesson generalises: a guard is
not finished when it passes. It is finished when you have watched it fail on the
defect it names, and the sanity assertion that it found its subjects is what
catches the version that silently checks nothing.

## 4. Status

| Seam | State |
|---|---|
| 1 — web ↔ API wire | **Untreated.** The plan above is agreed; migration order set. Largest remaining risk. |
| 2 — DTO ↔ persistence | **Guarded** (`apps/api/src/common/dto-persistence.test.ts`). Verified against the historical `Client.town` bug. It took THREE attempts to stop passing vacuously — see below. |
| 3 — schema ↔ migrations | **Guarded** by the PGlite replay. Live comparison is a manual step. |
| 4 — core ↔ apps | **Guarded** by four source guards. Build-ordering hazard is documented, not enforced. |
