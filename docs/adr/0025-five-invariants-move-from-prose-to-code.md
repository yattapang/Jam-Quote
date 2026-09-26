# ADR 0025 — Five invariants move out of prose, because prose cannot hold them

- **Status:** Accepted
- **Date:** 2026-09-25
- **Decided by:** the owner, choosing option (a) — resolve the five contradictions as decisions, then
  write them as a migration, a derived state definition and tests, rather than amend the documents a
  fourth time.
- **Delegation (Rule 16.5):** Opus — schema shape, money arithmetic and an immutability boundary.
- **Supersedes in part:** `design/domain-model.md` §6.2a, §6.3 and §8, and `PRD.md` R1.24/R1.30, **for
  these five things only**. Where this ADR and those documents differ, the code this ADR describes wins,
  and the documents are cut back to describing it.

## Context: three passes, and the medium was the defect

| Review | Findings | Blockers created by the previous pass's amendments |
|---|---|---|
| 1 | 19 | — |
| 2 | 17 | 4 of 5 |
| 3 | 20 | **11 of 20 findings were defects in the commit that closed review 2** |

Care was not the missing ingredient; all three passes were careful. **An invariant written in prose in
two places drifts every time**, and each amendment grew the surface of possible disagreement faster than
any reader could check it. Two findings marked *Closed* were not closed **in the document the finding
named**, and one fix re-committed the very defect it was fixing (M14, `honestClaims`).

Rule 7 says one rule lives in one place. What it did not say is that a **document is a poor place for a
rule that code can hold instead.** Code cannot hold two definitions of the same thing. These five now
live in code, and the documents point at them.

---

## Decision 1 — The ceiling says "recorded", and says it once

**The contradiction:** `PRD.md` R1.24d explains at length why it is *recorded* variations;
`domain-model.md` still said *accepted* variations in two places (H1, and G1 before it).

**Decided:** **recorded.** Release 1 builds no variation acceptance, so "accepted variations" describes a
thing that does not exist — an invariant reading stronger than it is, which is worse than a weak one
honestly labelled.

**Where it now lives:** one expression, in the migration, as the function every writer calls. Neither
document restates the arithmetic; both link to it. When release 2 makes variations signable, **one
expression changes** and the documents do not need to.

---

## Decision 2 — The writer set is enforced by grants, not by a list in a paragraph

**The contradiction:** §6.2a declared the `issue_balance` writer set "closed and named" and omitted the
acceptance transaction that creates the row — the exact fix the previous finding asked for (H2, G2).

**Decided:** a prose list of writers is unenforceable, so it stops being the control.

- `issue_balance` has **no UPDATE or INSERT grant to the application role at all.** Every change goes
  through one `SECURITY DEFINER` function that takes the row lock itself.
- The writers are therefore the function's callers, and the list cannot go stale because there is no
  other way in. The complete set: acceptance (creates), withdrawal, invoice issue, invoice void, credit
  note, variation, reconciliation.
- A **parser-based guard** asserts no other module writes the table — the same doctrine that proved
  tenant isolation.

This is the project's existing pattern: the audit log is append-only *by the absence of a policy*, not
by a comment asking politely.

---

## Decision 3 — A document's state is derived, never stored

**The contradiction:** `domain-model.md` §6.3 and §8 carried two different quote state machines, and §8's
diagram conflated `quote` with `quote_issue` (H6). Two state machines in one document is the same failure
as two documents disagreeing.

**Decided:** `quote_issue` gets **no state column.** Its state is a **function of rows that already
exist**, exactly as invoice status already is (§6.2):

| State | Is true when |
|---|---|
| sealed, awaiting number | no `issue_number` row |
| issued | an `issue_number` row exists |
| accepted | an `acceptance` row exists with no withdrawal |
| declined | a declining `acceptance` row exists |
| superseded | a later issue exists for the same quote |

**Why this is the right answer and not merely a tidy one:** a stored state is a second source of truth
that can disagree with the rows it summarises, which is how the old application reported a negative
amount due. And it makes H6 structurally impossible — **there is no state value to disagree about**,
because there is no state value.

The documents keep the *diagram*, as a picture of the function. The function is the definition.

---

## Decision 4 — Withdrawal is a new row, not a mutation (a genuine choice)

**The contradiction:** §6.3 listed "superseding an accepted issue" as impossible-and-tested five lines
above the withdrawal that requires it (H5), and withdrawal said nothing about the `issue_balance` row or
about variations already recorded (H4).

**The choice was:** (a) withdrawal is its own insert-only row, or (b) `acceptance` gains a nullable
`withdrawn_at`.

**Decided: (a).** `acceptance_withdrawal` — one row, insert-only, carrying the acceptance it withdraws,
the reason, who did it and when.

**Why:** (b) needs an UPDATE grant on `acceptance`, and the moment that grant exists, "issued documents
are immutable" depends on every future query being careful — which is the argument this whole model is
built on. (a) needs no UPDATE anywhere, and it is the same shape already chosen for `issue_number`: a
fact *about* an immutable row lives in its own row. It also gives withdrawal an audit trail for free,
because the row *is* the record.

**And the two things withdrawal was silent about, now decided:**

- **The `issue_balance` row is not deleted.** Deleting it would reintroduce Decision 2's empty-lock
  hole.
- ~~`accepted_total` returns to zero while the issue is not accepted.~~ **CORRECTED 2026-09-26: this
  contradicted Decision 2**, which says `accepted_total` is written once, "never again". Both cannot
  hold, and the contradiction sat inside one ADR — the same failure the ADR was written to stop, one
  level up. Resolved in favour of Decision 2, because an immutable column is what makes the copy safe
  at all (Rule 7): it is safe *precisely because* the issue it derives from cannot change.

  **Nothing is mutated on withdrawal. `issue_ceiling_minor()` is state-aware instead** — it returns
  zero unless an un-withdrawn acceptance exists (migration `20260926110000_withdrawal_preconditions`).
  So a withdrawal drops the ceiling immediately, the balance row survives and is simply inert, and the
  rule changed in **one expression** with no document needing an edit. That is the payoff this ADR was
  arguing for, collected.
- **Withdrawal is refused while any variation exists**, not only while an invoice exists — and this is
  now enforced by a trigger rather than stated, because a precondition a caller can forget is not a
  precondition (finding H4). A recorded variation is agreed extra work, and withdrawing would leave it
  immutable, pointing at a superseded issue, unbillable and unmovable.

  **The product consequence, stated rather than discovered:** once extra work has been agreed on top of
  an acceptance, the cheap typo remedy is gone and the path is a credit note and a fresh quote. A wrong
  client name found late costs more than one found early. That is worse for the tenant than a
  withdrawal and better than a remedy that silently orphans an agreement.

---

## Decision 5 — A pending registration is not a user (a genuine choice)

**The contradiction:** R1.30e lets two people hold pending claims on one address; the model says
`app_user.email` is **unique globally**, and R1.30c cited "the unique index that already exists" as the
enforcement. Both cannot be true, and no entity held a pending claim (H8).

**Decided:** a pending registration is **not a user and never becomes one by waiting.**

- New table `registration_claim`: the address, a hashed token, `expires_at`, `created_at`. **No unique
  constraint on the address** — many people may attempt the same one.
- **The user row is inserted at verification**, not at registration. So `app_user.email` keeps its global
  unique index untouched, and **"first to verify wins" becomes a database guarantee** rather than
  application logic: the loser's insert violates the index and is answered with the same
  non-enumerating message as any duplicate.
- Claims expire in 72 hours and expired ones are deleted, so the table cannot become a shadow user list.

**Why this is better than the alternatives:** it changes no existing index, it needs no "pending" state
on `app_user` (which would be a nullable column every query must reason about), and it makes the race
unwinnable by construction. ADR 0022's rule — one business per verified address — is enforced by the
index it always claimed to be enforced by, which is now finally true.

---

## Consequences

- **The documents shrink.** `domain-model.md` §6.2a, §6.3 and §8, and `PRD.md` R1.24 and R1.30, are cut
  back to describing what the migration defines, with a link. Less prose is the point, not a side effect.
- **Two new tables** (`acceptance_withdrawal`, `registration_claim`) and one function-guarded table
  (`issue_balance`). The first migration to create business tables, so it also fixes the shape of
  `quote`, `quote_issue`, `issue_number`, `variation`, `acceptance` and `invoice`.
- **Each decision ships with a planted defect** proving its guard fires (Rule 21.2): two concurrent
  invoices against one issue · an invoice after a withdrawal · a second `issue_number` for one issue ·
  two devices sealing one revision · two registrations verifying the same address.
- **Reversible until the first tenant exists.** There are no live tenants (brief §19), so a decision here
  is a migration away from being changed. That is why they were taken rather than queued behind another
  round trip — and why the owner can reverse any of the five cheaply.

## What this ADR does not settle

- The remaining eighteen findings from review 3 (H9, H10, H12, H14, H15, H17 and the rest). They are
  real and stay open; these five were chosen because they are what the schema cannot be written without.
- **Whether prose-to-code should apply more widely.** It is now proved for five invariants. Doing it to
  the whole model without evidence would be the same over-reach in the opposite direction.
- The acceptance channel problem (H9 — nothing requires a client to have an email address), which is a
  product decision and is the next thing the owner needs to rule on.
