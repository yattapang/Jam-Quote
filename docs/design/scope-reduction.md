# Design: reducing agreed scope after it has been invoiced

**Status: APPROVED by the owner 2026-09-26 · independent review OUTSTANDING (Rule 1.10, Rule 24.6).**

| Gate | Question | State |
|---|---|---|
| **Owner approval** | Is this what you want built? | ✅ **2026-09-26** — option 1 of the three put to the owner, and the default for a voided invoice's credit notes · ✅ **2026-09-27** — §3a, withdrawal after full credit (K4) · ✅ **2026-09-27** — §3b, withdrawal with variations (L1) |
| **Independent review** | Will this do what it says? | Re-reviews done 2026-09-26 (K1-K6) and 2026-09-27 (L1-L6), both appended to `PRD-REVIEW-4.md`; the L fixes await a **third** before J4 is closed |

Date: 2026-09-26 · Answers finding **J4** (`PRD-REVIEW-4.md`) · Delegation (Rule 16.5): **Opus** — money
arithmetic, one of the three named exceptions: it decides how much may be billed.

---

## 1. The problem

A client removes work that has already been billed. Accepted total 100,000; progress invoices 90,000; the
bathroom worth 20,000 comes out. The contractor records a variation of −20,000.

Review 4 executed that on 2026-09-26 and found the variation committed and then permanently uncounted.
**That is no longer what happens**, and the difference was found by re-running the scenario rather than
reading it: since J2, the variation's own insert fires `issue_balance_apply()`, the ceiling check raises,
and the row is rolled back. So the issue is not stranded. What remains is the blocker in the finding's
title — **there is no way to reduce scope below what is invoiced**:

- the variation is refused with a number the contractor cannot act on;
- a credit note, which the PRD names as the remedy, changes no figure the ceiling reads;
- the only thing that lowers the invoiced total is voiding a whole invoice that may be sent and part-paid.

## 2. What this must achieve

1. A scope reduction below what is already invoiced is **representable**, with one remedy the contractor
   already understands.
2. **No stuck state can be entered.** Every write that could leave invoiced above the ceiling is refused
   in its own transaction, so the ceiling check never fires against history it cannot change.
   **As first written this was false** and was argued write by write, not executed: sealing a third
   revision could drop an invoiced revision's ceiling to 0 (K6, a J10 defect). It is now executed by
   `new-app/db/test/no-stuck-state.test.ts`, a seeded random walk over every financial write. **Its first
   version could not carry this claim** (L3): it judged results with the functions it was testing, so
   double-subtracted credits and the original J10 defect both passed it, and it never reached withdrawal
   after money had moved. It now checks against an oracle of its own and asserts that reach. Still not
   proved, and stated: sequences the walk does not reach; real concurrency; and a stuck state entered by
   data older than a fix (K1, L2), which each migration answers but no walk over a fresh database can see.
3. A credit note **cannot be abused to manufacture room**: it cannot exceed what its invoice still has
   uncredited, and it cannot be raised against a voided invoice.
4. Voiding an invoice that carries credit notes does **not** subtract the credit twice.
5. The refusal tells the contractor **how much** must be credited.

## 3. The shape

**The invoiced figure the ceiling is compared with becomes net of credit notes.** For each issue: the sum,
over invoices that are not voided, of the invoice's amount less the credit notes against it. The ceiling
itself — `issue_ceiling_minor()` — does not change: it is still the accepted total plus recorded
variations, and nothing here raises it.

**The remedy is one transaction:** credit the excess against an invoice, then record the negative
variation. In the example: a credit note of 10,000, then the −20,000 variation — invoiced 80,000, ceiling
80,000. Either insert alone is checked on its own, so a credit note with no variation is also fine (it
frees room within the same ceiling), and a variation with no credit note is refused with the shortfall.

**Three refusals come with it, all taken under the issue's balance lock:**

- a credit note that would take its invoice's credits above the invoice amount;
- a credit note against an invoice that is already voided. The void has already removed the whole
  invoice, credits included, so the figure would not change; the refusal is because it records a
  reduction of nothing on a client's statement. (The first version said it would subtract money twice.
  It would not — K2.)
- and an invoice counts as never less than zero, so an over-credited invoice written before these checks
  existed contributes nothing rather than manufacturing room, and the over-credit check judges only the
  invoice being credited, never history elsewhere on the issue (K1);
- the existing ceiling refusal, now naming the amount by which the ceiling is exceeded.

**A voided invoice's credit notes drop out with it** (owner's decision). The invoice is excluded whole, so
its credits are too; counting them would subtract money twice.

**What this changes in meaning, stated plainly.** Until now a credit note deliberately moved nothing
(`documents-core.test.ts`, J12 block). It now moves `invoiced_total_minor` down. It still does not
*raise the ceiling* — the PRD's sentence about that stays true — but it frees room *within* it, so a
credited amount can be invoiced again. That is the same effect as voiding and re-issuing, at the
granularity of an amount rather than a whole invoice, and the client's documents show both the invoice and
the credit.

## 3a. A wrong document, once money has been demanded (K4 — owner's decision 2026-09-27)

The re-review found the "credit note and a fresh quote" remedy for a wrong document *reopened* the
ceiling: crediting the wrong issue's invoice in full made its whole ceiling billable again, and nothing
could close it — withdrawal was refused because an invoice existed, and J10 refused a new revision. So
the fresh quote had to be a separate quote, and one job carried two live ceilings.

**Decision:** an acceptance may be withdrawn once every invoice against the issue is voided or fully
credited, and no variation exists. Withdrawal drops the ceiling to 0, and J10 ignores a withdrawn
acceptance, so the fresh quote is the next revision of the same quote. (Variations still blocked
withdrawal here, per H4; §3b removes that.) This also answers J15, where a voided invoice blocked withdrawal forever. Enforced by
`acceptance_withdrawal_guard()`, which now takes the balance row lock so a withdrawal and an invoice
cannot each miss the other.

**Rejected:** a separate "close issue" record — a second concept for the same job.

## 3b. A wrong document that already has variations (L1 — owner's decision 2026-09-27)

The second re-review found §3a's fix failed whenever the issue had a variation: fully credited, it could
be neither withdrawn (H4) nor revised (J10), so the fresh quote was a separate quote and the old issue
then took another 110,000 invoice — two live ceilings on one job again.

**Decision:** withdrawal is allowed once nothing is still billed, whether or not variations exist. H4's
reason for refusing was that the variations would become a live second copy of agreed work on a dead
issue. Since K6's twin check, a withdrawn or superseded issue takes no new variation and has a ceiling of
0, so its variations are inert history, still readable; the live agreement is whatever the next revision
carries, with the agreed work re-priced into its lines by the tenant.

**And the J10 guard judges only the latest revision** (L2, L6): it is the only one that can hold a live
ceiling, so older superseded revisions — including one given a variation by code older than the twin
check — can no longer block the quote. The seal takes that revision's balance lock, so a variation
racing the seal waits and is then refused. Migration `20260927100000_withdrawal_with_variations`.

**Rejected:** a separate "close issue" record (a second concept for the same job), and keeping the
refusal (a wrong document with variations would have no correction at all).

## 4. Trade-offs, and what was rejected

- **Option 2: refuse only when an invoice raises the invoiced total**, letting a variation leave the issue
  over-invoiced for the reconciliation job to flag. Rejected: it makes a state where the client's documents
  show more billed than agreed a normal outcome, and depends on a nightly job to raise it.
- **Option 3: no negative variations in release 1** (`CHECK ("amount_minor" > 0)`). Rejected: it breaks
  PRD R1.22a, and removing scope is ordinary in construction.
- **Netting in the ceiling instead of the invoiced figure** (ceiling + credits). Same arithmetic, rejected
  because it would make a credit note *raise the ceiling* in name, which is the one thing R1.25 says it
  never does.

## 5. Deliberately excluded

- **Which invoice receives the credit.** The contractor chooses; that is the application layer, not built.
- **A credit on a fully paid invoice** becomes money owed back to the client. That is invoice status,
  derived from payments and credits (R1.25), and it is not built either.
- **Signable variations** remain release 2.

## 6. How it is proved

Migrations `20260926200000_scope_reduction`, `20260926210000_live_ceiling_every_revision` (K6) and
`20260926220000_withdrawal_after_full_credit` (K4, J15, K1, K2), never an edit to a committed one
(Rule 6), and executed
tests in `new-app/db/test/documents-core.test.ts`: a negative variation within the room left; one below
what is invoiced, refused, with no row left behind and the shortfall named; the credit-then-reduce
transaction accepted; over-crediting refused, including across several notes; a credit against a voided
invoice refused; a voided invoice's credits not subtracted twice; and J12's credit-note assertion changed
explicitly, because the decision behind it changed. After the re-review: credits net only against their
own issue (K3); an old over-credit strands nothing (K1); withdrawal after full credit or void, refused
while anything is billed (K4, J15, L1); a variation left on a superseded revision no longer blocks
the quote (L2); and the random walk for stuck states (K6), judged since L3 by an oracle of its own rather
than by the functions under test.
Each guard is planted against before it is reported (Rule 1.5, Rule 21.2).

## 7. What this does not prove (Rule 21.4)

- **Concurrency.** The checks run under the balance row lock, and the suite is one PGlite connection, so
  that serialisation is read rather than raced. The two-connection Postgres test remains owed.
- **The application.** Nothing yet offers "reduce scope" as one action; the database refuses the outcomes,
  it does not build the flow.
- **The reconciliation job**, which does not exist yet. When it is built it must use this same net figure,
  and the way to guarantee that is for it to call `issue_balance_apply()` rather than re-derive the sum.
