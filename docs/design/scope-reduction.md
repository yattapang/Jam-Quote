# Design: reducing agreed scope after it has been invoiced

**Status: APPROVED by the owner 2026-09-26 · independent review OUTSTANDING (Rule 1.10, Rule 24.6).**

| Gate | Question | State |
|---|---|---|
| **Owner approval** | Is this what you want built? | ✅ **2026-09-26** — option 1 of the three put to the owner, and the default for a voided invoice's credit notes |
| **Independent review** | Will this do what it says? | **Outstanding** — J4 is not closed until someone who did not write this checks it |

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
- a credit note against an invoice that is already voided (the void has already removed the whole invoice
  from the figure, so a credit there is either meaningless or a second subtraction);
- the existing ceiling refusal, now naming the amount by which the ceiling is exceeded.

**A voided invoice's credit notes drop out with it** (owner's decision). The invoice is excluded whole, so
its credits are too; counting them would subtract money twice.

**What this changes in meaning, stated plainly.** Until now a credit note deliberately moved nothing
(`documents-core.test.ts`, J12 block). It now moves `invoiced_total_minor` down. It still does not
*raise the ceiling* — the PRD's sentence about that stays true — but it frees room *within* it, so a
credited amount can be invoiced again. That is the same effect as voiding and re-issuing, at the
granularity of an amount rather than a whole invoice, and the client's documents show both the invoice and
the credit.

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

New migration `20260926200000_scope_reduction`, never an edit to a committed one (Rule 6), and executed
tests in `new-app/db/test/documents-core.test.ts`: a negative variation within the room left; one below
what is invoiced, refused, with no row left behind and the shortfall named; the credit-then-reduce
transaction accepted; over-crediting refused, including across several notes; a credit against a voided
invoice refused; a voided invoice's credits not subtracted twice; and J12's credit-note assertion changed
explicitly, because the decision behind it changed. Each guard is planted against before it is reported
(Rule 1.5, Rule 21.2).

## 7. What this does not prove (Rule 21.4)

- **Concurrency.** The checks run under the balance row lock, and the suite is one PGlite connection, so
  that serialisation is read rather than raced. The two-connection Postgres test remains owed.
- **The application.** Nothing yet offers "reduce scope" as one action; the database refuses the outcomes,
  it does not build the flow.
- **The reconciliation job**, which does not exist yet. When it is built it must use this same net figure,
  and the way to guarantee that is for it to call `issue_balance_apply()` rather than re-derive the sum.
