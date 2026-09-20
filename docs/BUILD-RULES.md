# Build rules

These rules govern every change to Pryvis (the product formerly built as JamQuote - ADR
0009) from 2026-09-20 onward. They exist because two
things are now certain: **other people will maintain this codebase**, and **it will run in
more than one country**. Both fail the same way — someone makes a reasonable local change
that silently breaks a rule they could not see.

A rule here is only worth writing if something *enforces* it. Each one therefore names its
enforcement: a type, a test, a guard, or (last resort) a review checklist item.

Owner decisions live in `PLANNING.md`'s decisions table. Architecture choices and their
reasoning live in `docs/adr/`. This file is the standing rules; it is not a history.

---

## 1. Naming and folder structure

**Rule.** One shape, decided once, used everywhere.

| Concern | Convention |
|---|---|
| Workspace | `apps/<app>` for deployables, `packages/<name>` for shared code |
| API module | `apps/api/src/<domain>/` holding `<domain>.controller.ts`, `.service.ts`, `.dto.ts`, and `*.test.ts` beside the file it tests |
| Web route | `apps/web/app/(app)/<plural-noun>/` for signed-in screens; `app/<short>/[token]/` for public, unauthenticated pages |
| Shared rule | `packages/core/src/<area>/<concept>.ts` with `<concept>.test.ts` beside it |
| Test names | `<file>.test.ts` beside the source; cross-module flows in `apps/api/src/integration/` |
| Money | always `...Cents` on an integer field; never a float, never a string |
| Percentages | always `...Pct`, 0–100, never a 0–1 fraction |
| Dates | `...At` for an instant, `...Date` for a calendar day |
| Currency-bearing text | never assembled by hand; see rule 6 |
| Booleans | positive and specific (`gctRegistered`, not `notRegistered`) |
| Enum-ish columns | plain text plus a core enum, never a database enum (migrations across countries get easier) |

**Enforcement.** `packages/test-ast`-based guards already police money, bounds and label
rules. A new naming rule ships with a guard or it is not a rule.

## 2. Inline documentation explains WHY

**Rule.** A comment states the decision and the reason, especially the rejected
alternative. "What" is the code's job.

Required wherever a reader could reasonably "fix" the code and break it:

- a money or tax rule, and where it must be applied
- a tenancy or authorisation check
- anything that exists because of a real defect — name the defect
- a deliberate limit ("this does not prove…"), so the next person does not trust it further
  than it earns
- a country-specific value, with a pointer to the rule pack that owns it

**Enforcement.** Review. A fix without a stated reason is sent back.

## 3. Architecture decision log

**Rule.** Every structural choice gets a short ADR in `docs/adr/`, numbered, in the
format used by `docs/adr/0001-*.md`: context, decision, alternatives, consequences.

Write an ADR when the choice is expensive to reverse: a datastore, a framework, a
cross-cutting pattern, a tenancy or country model, a billing model. Do not write one for
an ordinary bug fix.

**Enforcement.** A pull request that changes the shape of the system without an ADR is
incomplete. The ADR index lists every decision in force.

## 4. Automated tests for core workflows, early

**Rule.** Three layers, each with a job:

1. **Unit** — one rule, executed. Beside the file.
2. **Cross-section flow** — the seams between modules, against a real Postgres:
   `apps/api/src/integration/`, run by `npm run test:integration`.
3. **Guards** — a class of defect cannot return. Built on the shared parser
   (`@jamquote/test-ast`), never on a regex over source text.

**A test is only real once it has been shown to fail.** Plant the defect, watch the test
catch it, restore from a backup copy. A test that passes with the fix removed is worse than
no test: it teaches false confidence.

**Enforcement.** `npm test` and `npm run test:integration`. Both must be green before a
commit, with nothing else heavy running.

## 5. Compliance and regulatory rules are DATA, not logic

**Rule.** Tax rates, statutory deductions, taxpayer-id formats, document requirements,
administrative regions and their labels belong to a **rule pack** keyed by country:
the static baseline in `packages/core/src/jurisdiction/`, with admin-editable overrides in
`RulePackConfig` (one row per country).

Therefore:

- no rate, threshold or statutory code is written into a service, a component or a DTO
- no `if (country === "JM")` in product code; ask the rule pack
- a new country ships as a rule pack plus its verification data, not as new branches in
  business logic
- the rule pack is versioned and auditable: a quote records what it charged, so a later
  rate change never rewrites history

**Enforcement.** The drift guard in `apps/api/src/integration/core-rules-drift.test.ts`
fails when a core rule is restated by hand. Extend it with each new rule.

## 6. Currency and localisation are abstracted

**Rule.** Money is an integer minor unit plus a currency code, formatted only by core
(`formatPlatformMoney`, `formatJmd` and friends). Never build an amount or a symbol by
hand, and never assume `$` or two decimal places.

- the tenant's currency comes from `Business.currency`; the platform's own billing
  currency is separate and comes from pricing config
- dates and day boundaries go through core's Jamaica-aware helpers today, and through a
  per-country timezone once a second country ships (see ADR 0006)
- user-facing text is plain English written for a contractor; no jargon, no developer
  wording (guarded by the error-message flow guard)
- labels that differ by country (parish, TRN, GCT) come from the rule pack, not literals

**Enforcement.** Money-format and label guards; the error-wording guard; review.

## 7. Tenant- and country-aware data model

**Rule.** Every tenant-owned row carries `businessId`. Every country-dependent behaviour
resolves through `Business.countryCode` and its rule pack. No global default stands in for
a country's rules.

- reads and writes are scoped by `businessId` from the authenticated context, never from
  the request body
- an id supplied by a caller is checked for ownership before it is stored
  (`common/assert-owned.ts`), and a foreign id is indistinguishable from a made-up one
- public, token-addressed surfaces expose exactly one document and nothing else
- new tables are `businessId`-scoped unless they are platform-wide, and that exception is
  stated in the model comment

**Enforcement.** The tenancy flow in `apps/api/src/integration/` drives every id-taking
method with another tenant's id; ownership guards; review.

---

## 8. How features ship: one at a time

Agreed with the owner on 2026-09-20.

1. **One feature at a time.** Design, build, verify, launch, then start the next. No
   parallel half-features.
2. **Entitlement first.** A feature that belongs to a paid tier is wired into the
   entitlement system when it is built, not retrofitted (ADR 0007).
3. **Every feature ships with:** its rule-pack entries if it is country-dependent, its
   tests at all three layers, its ADR if it changes the system's shape, its entry in the
   tier matrix in `PLANNING.md`, and its user-facing wording reviewed as plain English.
4. **Definition of done:** the full gate green twice, a defect planted and caught per new
   test, an independent review by an agent that did not write it, and the register
   (`REVIEW-FINDINGS.md`) updated with what the change does *not* prove.

## 9. Independent review per module, and a test at every seam

Agreed with the owner on 2026-09-20. Rule 10 (the standing verification standard) says what
verification means; this rule says WHEN it is owed and what counts as done. The register is
[`docs/MODULE-SEAMS.md`](MODULE-SEAMS.md), updated in the same commit as the work.

### 9.1 A module is not complete until someone else has attacked it

**Trigger.** A module is "complete" when its own surface is finished: its endpoints, its
rules, its screens. Not when the last line is typed.

**Who.** A reviewer who did not build it. In this project that means a different agent,
briefed to attack rather than read, and in a review the author never sees first.

**What they must do, at minimum:**
- write the module's own target defect into the real source, run the tests, and confirm they
  fail — a module whose tests pass with its defect restored has no tests;
- attack the module's boundary: a foreign id, a missing id, the wrong tenant, an amount at
  the column's limit, a value the UI cannot type but the API accepts;
- check the module's claims: every comment saying "this is safe because…" is a hypothesis
  until executed;
- report what the module does NOT prove, which goes into `REVIEW-FINDINGS.md`.

**Done means** the findings are fixed or recorded with a reason, and the module's row in
`MODULE-SEAMS.md` names the review.

### 9.2 Every dependency between modules is tested at the seam

**Trigger.** Module A trusts module B's output — a price, an id, a status, a total, a
tenant scope, a date. That is a seam, and it gets its own test.

**What a seam test must be:**
- **Real, not mocked.** It drives the real services against a real Postgres
  (`apps/api/src/integration/`). A mock cannot disagree with the database, and every seam
  defect found here so far passed both modules' own unit tests.
- **About the invariant, not the path.** State what must hold across the boundary — "the
  quote line equals the job cost to the cent", "a second tenant's id is refused exactly as a
  made-up one" — and assert that, not the sequence of calls.
- **Proved.** Plant a defect in the real product code on ONE side of the seam and confirm
  the seam test fails. If it passes, the test is describing the path rather than the
  invariant, and it is not finished.
- **Registered.** Add the seam and its test to the table in `MODULE-SEAMS.md`. A seam with
  a blank in that column is work owed.

**Both directions count.** When A calls B, test that A survives B's refusals, empty answers
and errors — not only the happy answer.

### 9.3 Contract drift between surfaces is a seam too

The web app and the mobile app hold mirrors of the API's shapes. A mirror that compiles is
not a mirror that matches: proving a type is *referenced* says nothing about whether its
fields still match the endpoint. Treat each mirror as a seam with its own check.

### 9.4 What this rule costs, stated honestly

Seam tests are slower to write and slower to run than unit tests, which is why the flow
suite is its own task. The trade is deliberate: of the defects that reached a customer in
this codebase, the expensive ones were seams — a stale price into a quote, a placeholder
cost becoming a quoted price, a supplier crossing tenants, a renewal date that two screens
computed differently. Every one passed its module's own tests.

## 10. Security is part of every module, from its first commit

Agreed with the owner on 2026-09-20. Security is not a phase before launch and not a
separate module; it is a property each module either has on its first commit or never gets.
A module that stores money, a tenant's client list, or a document a client will open is a
security surface even when it looks like plumbing.

### 10.1 The rules a module must satisfy

**Authorisation is default-deny.** Every route declares how it is protected. A route with no
guard is a bug, not a public route; a genuinely public route says so explicitly and is
listed. Admin capability, tenant scope and impersonation are separate decisions and are each
stated per route.

**Tenant scope comes from the token, never from the request.** `businessId` is read from the
authenticated context. A body, a query string or a header may not choose whose data is
touched. Any caller-supplied id is ownership-checked before it is stored or read
(`common/assert-owned.ts`), and a foreign id is answered exactly as a non-existent one - no
403-versus-404 oracle, no timing difference worth reading.

**Input is validated at the boundary, by a schema.** Every endpoint's body and query go
through a DTO that bounds length, range, scale and shape. Cents fields are capped at the
column's limit. A value the screen cannot type is still refused by the API, because the
screen is not the boundary.

**Output is projected, not filtered.** A public or lower-privilege surface builds its own
narrow shape and returns only what that surface needs. "Take the row and delete a field"
leaks the next field someone adds. This is why the share-token pages have their own
projection and why financial details in the audit trail are withheld by capability.

**Secrets live in the environment.** No key, token or password in code, in a migration, in a
log line, or in a test fixture that looks real. Passwords are hashed with bcrypt and never
logged; share tokens are unguessable, revocable, scoped to one document, and never reused
across documents.

**Errors say what the user needs and nothing more.** No stack trace, no SQL, no internal
path, no raw upstream message on a user-facing surface. The plain-English rule (rule 6) and
the error-flow guard exist for this reason as much as for tone.

**Rate limits are on by default.** The API applies an identity-aware throttle globally;
anything that can be brute-forced or abused for cost - login, registration, password reset,
public token reads, email and card-payment endpoints - declares a tighter limit of its own
and says why.

**Every mutation of money, permissions or tenancy is audited.** Who, what, which tenant,
when. Audit rows are written in the same transaction as the change where the database
allows it, and audit reads respect the same capability rules as the data they describe.

**Uploads and external content are hostile until proven otherwise.** Type, size and
dimensions are validated server-side; a rendered document is built from validated values,
never from a client-supplied URL or markup. Any link we render is checked against the
scheme allow-list in core, not by looking for "http".

**Dependencies and migrations are reviewed like code.** A new dependency states why it is
needed and what it can reach. An applied migration is never edited. A destructive migration
states what it deletes and is run behind a read-only audit query first.

### 10.2 What a module must ship to be called secure

1. **A stated threat note in the module's own docblock:** what an attacker would want here,
   and which rule above stops them. One short paragraph, not a document.
2. **Negative tests, not only happy paths:** for each route, a test that the wrong tenant,
   the missing capability and the absent session are each refused - and refused identically
   to a non-existent record where that matters.
3. **A seam test for anything it trusts** (rule 9.2), including what it does when the other
   side refuses.
4. **An independent attack pass** (rule 9.1) that includes the security surface: the
   reviewer tries the foreign id, the missing guard, the oversized value, the hostile
   upload, the leaked message.
5. **A row in `docs/MODULE-SEAMS.md`** recording that the security pass happened.

### 10.3 Enforcement, and where it is weak today

- A guard asserts that every API route declares a guard or is on the explicit public list,
  and that admin routes declare a capability. Extend it with each new controller.
- The tenancy flow drives every id-taking method with a second tenant's id.
- The error-flow guard keeps raw error text off the screen.
- `helmet` sets the API's headers; the throttle guard is global.
- **Weak today, stated honestly:** there is no automated dependency-vulnerability check in
  the gate, no secret-scanning hook, and `sync` - the one module that replays writes the
  server did not originate - has neither an independent review nor a seam test. These are
  recorded in `docs/MODULE-SEAMS.md` as owed.

## 11. Verification standard (standing)

- **Each section** is reviewed independently, by attacking it, not reading it.
- **The seams between sections** are tested with real services against a real database.
- **Drift is reverted, not merged.** A change outside the stated scope is drift, however
  reasonable it looks. Say so and revert it.
- **A claim without an execution is a hypothesis.** "Audited, none missing" has been wrong
  here before; record the search, not the conclusion.
