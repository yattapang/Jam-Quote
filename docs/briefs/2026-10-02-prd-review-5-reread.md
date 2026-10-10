# Brief: independent re-read of the amended PRD, before the owner approves it

**Agent:** commit-reviewer, **Opus** (Rule 16.5: product judgement over the plan of record; adversarial —
in every earlier round most blockers were created by the amendments that closed the round before, and a
cheaper tier would check that sentences moved, not whether the plan still holds). **Asked by the owner,
2026-10-02.**

**Under review:** `docs/PRD.md` as amended against PRD review 5 (findings B1-B28) and the owner's decisions
in ADR 0027 and ADR 0028 — commits `c000c78` and `9c4d86c`, and the approval note after them — together with
every other document those commits changed.

## The questions

1. **Did each fix reach its finding?** For each of B1-B28, read the finding in `docs/PRD-REVIEW-5.md`, its
   row in that file's disposition table, and the text now in the documents. Say per finding: **closable**,
   **not closable** (why), or **closable with a stated limit**. B10 is recorded open on purpose (its GCT
   design is owed); check that the PRD says so consistently.
2. **What did the amendments break?** This is the main question. Look for:
   - contradictions the amendments created, inside the PRD or between it and `docs/TIERS.md`, the ADRs
     (especially 0022, 0023, 0024, 0025, 0026, 0027, 0028), the designs in `docs/design/`,
     `docs/THREAT-MODEL.md`, `docs/SERVICE-REGISTER.md` and the site's copy in `new-app/web/content/`;
   - sentences left stale by ADR 0028 — the web app launches online first, and the mobile app brings
     offline sealing — anywhere a requirement, measure, risk, tier row or site line still assumes offline
     at the first launch;
   - requirements added in the amendments (R1.21b-c, R1.25a, R1.37a-f, R1.43-R1.49, N11, §9 items 6-10,
     §11) that cannot be tested as written, or that depend on something nobody has decided;
   - money: the tax-exclusive ceiling decision (ADR 0027 D7) against the ceiling as built and every
     sentence that describes it; over-payments (R1.26) against the ceiling and invoice status;
   - the claims in the code changes: migration `20260928010000_number_series_never_resets` and its test,
     and the site guard in `new-app/web/test/site-guards.test.ts` — execute both, and try to make the guard
     pass on a page that over-claims.
3. **Is it approvable?** One line: approve, approve after named changes, or not yet — and why.

## How to work

- Read the PRD in full, then the documents the amendments touched (`git show --stat c000c78 9c4d86c`).
- **The only file you may change is `docs/PRD-REVIEW-5.md`, and only by appending** a new section at its end,
  titled `## Re-read of the amended PRD`, with your summary first and then the findings. Append each finding
  as you find it (Rule 1.10). Do not edit anything else, commit, stash, `git checkout --` or `git restore`.
- Number new findings **C1, C2, …**. Each has a heading `## C<n> · <one-line claim> — severity: blocker /
  major / minor`, a `**Where:**` line naming every file it concerns, the claim under attack quoted, the
  evidence (file and line, or a command and its output), and a **Recommendation**.
- To execute a test with a planted defect, copy the file to a backup outside the repository, edit, run, copy
  the backup back and prove it with `diff -q`. Real PostgreSQL is at
  `postgres://postgres@127.0.0.1:55440/postgres` if a test needs it.
- Synthetic data only; no personal data and no secrets.

## What to report

The approvability line; the per-finding verdicts for B1-B28; the new findings by severity; the decisions only
the owner can make, with options and your recommendation; what you did not examine; and `git status --short`,
which must show only `docs/PRD-REVIEW-5.md` modified.

## Expectations, run on the HEAD this brief is launched at

The review-5 disposition table has a row for each of the 28 findings, 27 of them fixed with a re-review owed:

```check
$ grep -cE "^\| \*\*B[0-9]+\*\* \|" docs/PRD-REVIEW-5.md; grep -c "Fixed, re-review owed" docs/PRD-REVIEW-5.md
28
27
```

No document uses the C numbering yet:

```check
$ grep -lE "^## C[0-9]+ " docs/*.md; echo "exit $?"
exit 1
```

The two decision records exist, and the PRD marks its mobile-only requirements:

```check
$ test -f docs/adr/0027-prd-review-5-decisions.md && test -f docs/adr/0028-web-first-then-mobile.md && echo both; grep -c "\[mobile" docs/PRD.md
both
6
```

The two code changes' tests pass:

```check
$ cd new-app/db && npx vitest run test/documents-core.test.ts -t "B20" 2>&1 | grep -oE "Tests +[0-9]+ passed \| [0-9]+ skipped \([0-9]+\)"
Tests  3 passed | 137 skipped (140)
```

```check
$ cd new-app/web && npx vitest run test/site-guards.test.ts 2>&1 | grep -oE "Tests +[0-9]+ passed \([0-9]+\)"
Tests  12 passed (12)
```
