# Brief: independent read of the environments and operations design (build plan A4)

**Agent:** commit-reviewer, **Opus** (Rule 16.5: operations and security — where real data lives, backups, secrets,
and the three approval gates for Claude-assisted maintenance are judgement-class; this is adversarial reading of a
design, not a mechanical check).
**Under review:** `docs/design/environments-and-operations.md`, approved by the owner on 2026-10-06 (OP1-OP12), against
Rules 10 and 15 (`docs/RULES.md`), ADRs 0026, 0030 (decision 5), 0033 and 0035, `docs/DATA-PROTECTION-READING.md`,
`docs/design/api-layer.md`, `docs/design/support-and-feedback.md`, `docs/design/privilege-model.md`,
`docs/SERVICE-REGISTER.md`, `docs/THREAT-MODEL.md`, `docs/OWNER-ACTIONS.md`, the CI workflows in `.github/workflows/`,
and `render.yaml`.

**As with A2 and A3, the owner relies on our judgement:** besides finding gaps, say for each of OP1-OP12 whether you
would recommend the same, and if not, what and why.

## What to attack

1. **The three approval gates (OP8, Rule 15).** Find the path by which Claude-assisted work reaches `main` or
   production without the administrator's approval. Consider:
   - the signed-approval check — key custody, replay of one approval for a different task, a Claude pull request that
     is not recognised as Claude's;
   - GitHub rulesets and the administrator's bypass;
   - workflow files that Claude itself can change in a pull request, including one that would print or exfiltrate the
     production environment's secrets;
   - `pull_request_target`, forked branches, and self-hosted runners;
   - the deploy environment's branch rules.
2. **Production data never leaves production (OP1).** Find the path by which real data reaches staging, development,
   CI or a model. Consider the restore drill, backups, logs and error tracking, smoke-test tenants, and support.
3. **Backups and restore (OP6).** Are the key custody, the "write but not delete" bucket, the 35-day expiry, the
   backup role's exception to row-level isolation, and the drill's checks sound? What does the plan lose if the
   owner's offline key is lost? Is "deletion means at most 35 days" true given point-in-time history?
4. **The region choice (OP2-OP3).** Is the Toronto recommendation honest about what is unverified? Is the claim that
   Vercel holds no personal data checkable, and is the proposed test enough? Do the cost figures add up across §3,
   §4 and OP10? Does anything still assume Render, Neon or Frankfurt?
5. **The pipeline (OP5).** Expand-then-contract with the privilege model's migrations, the pre-deploy step's
   credential, smoke checks against production with a synthetic tenant, and rollback.
6. **Consistency and gaps.** Every place this design disagrees with the rules, the ADRs, the other designs, the
   register, the threat model or the owner actions; and anything a builder of B1-B4 would have to make up.

## How to work

- Read; do not edit anything, commit, stash, `git checkout --` or `git restore`. Write your findings only in your
  reply. Synthetic data only. You may search the web to check a provider's capability or price.

## What to report

Findings numbered **OR1, OR2, …**, each with severity (blocker / major / minor), where, the evidence, and a
recommendation. Then a table OP1-OP12: **agree** / **disagree** (with your alternative, one line). Then one line:
**the design is sound to build from**, or **sound after the named changes**, or **not yet**. Then
`git status --short`, which must be empty.

## Expectations

```check
$ grep -c "^## [0-9]*\. OP[0-9]* ·" docs/design/environments-and-operations.md
12
```

```check
$ grep -c "APPROVED by the owner, 2026-10-06 — every recommendation, OP1-OP12" docs/design/environments-and-operations.md
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
