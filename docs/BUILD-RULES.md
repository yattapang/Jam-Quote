# Build rules

These rules govern every change to JamQuote from 2026-09-20 onward. They exist because two
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

## 9. Verification standard (standing)

- **Each section** is reviewed independently, by attacking it, not reading it.
- **The seams between sections** are tested with real services against a real database.
- **Drift is reverted, not merged.** A change outside the stated scope is drift, however
  reasonable it looks. Say so and revert it.
- **A claim without an execution is a hypothesis.** "Audited, none missing" has been wrong
  here before; record the search, not the conclusion.
