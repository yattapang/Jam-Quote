# Brief: independent read of the tax and documents design (build plan A1)

**Agent:** commit-reviewer, **Opus** (Rule 16.5: money arithmetic and the most important invariant in the product
— the ceiling — are named judgement-class; this is adversarial reading of a design, not a mechanical check).
**Under review:** `docs/design/tax-and-documents.md`, approved by the owner on 2026-10-02 (T1-T9), against the
approved `docs/PRD.md`, ADRs 0005, 0025, 0027, 0030 and 0031, `docs/design/domain-model.md`,
`docs/design/scope-reduction.md`, and the schema as built (`new-app/db/schema-objects.json` and the migrations).

## What to attack

1. **The arithmetic.** Work examples by hand, with synthetic figures:
   - a mixed job (exempt building work plus standard-rated installation) billed as a 40% deposit, a progress claim
     and a final invoice, with a rate change between the progress claim and the final invoice — do T5's bases
     add up exactly, and is the final invoice's rounding remainder bounded?
   - a negative variation after a progress claim, then a credit note — does T4's net ceiling still hold, and does
     T6's reversal use the right rates?
   - an over-payment, a withholding, and a client credit applied to a second invoice (T7) — is every cent
     accounted for, and can any path make an invoice read "paid" when money is missing, or "overdue" when it is
     not?
2. **The ceiling under the change.** T4 changes `issue_balance` from the tax-inclusive total to the net. Read the
   current balance functions and their tests: what must change, what could break the lock or the race guarantees
   (`new-app/CLAUDE.md`, "Financial writes"), and is anything in the design silent where it must not be?
3. **Numbering (T9).** One number per quote, revisions carry it; invoice and credit-note series gapless. Find the
   case that breaks: a rejected seal, a withdrawn acceptance then the next revision, two revisions numbered
   concurrently, a blocked Free seal released next month.
4. **Consistency.** Every place the design and the PRD, the ADRs, the domain model or the scope-reduction design
   disagree — including any document still describing a tax-inclusive ceiling or per-issue numbers without a
   pointer to this design.
5. **Rule 15 and the tax-name guard (T1).** Is the guard's scope stated precisely enough to build and test?
6. **What it leaves undecided** that a builder of W3, W4 or W7 would have to make up.

## How to work

- Read; do not edit anything, commit, stash, `git checkout --` or `git restore`. Write your findings only in your
  reply. Synthetic figures only.
- Statements about Jamaican tax law are labelled unverified in the design on purpose; attack the design's
  **consistency with its own stated reading**, not the law itself.

## What to report

Findings numbered **TD1, TD2, …**, each with severity (blocker / major / minor), where, the evidence (quote or
worked example), and a recommendation. Then one line: **the design is sound to build from**, or **sound after the
named changes**, or **not yet**. Then `git status --short`, which must be empty.

## Expectations

```check
$ test -f docs/design/tax-and-documents.md && grep -c "^### T[1-9] ·" docs/design/tax-and-documents.md
9
```

```check
$ grep -c "APPROVED by the owner, 2026-10-02 — every recommendation, T1-T9" docs/design/tax-and-documents.md
1
```

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations check_build_plan; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
Every ticked step carries its evidence.
```
