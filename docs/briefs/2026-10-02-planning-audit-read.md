# Brief: independent read of the planning baseline audit

**Agent:** general-purpose, **Sonnet** (Rule 16.9: the work is mechanical — every claim in the audit names
the file it rests on, and the task is to open that file and say whether it says so; no product judgement is
asked). **Approved by the owner, 2026-10-02.** **Under review:** `docs/PLANNING-AUDIT.md`, written by the
builder about the builder's own work, against `docs/DEVELOPMENT-BRIEF.md` and the files each row names.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-02-planning-audit-read.md`
   and report its last line. It must say every expectation holds, and the tree must be clean.
2. Read `docs/DEVELOPMENT-BRIEF.md` in full, then `docs/PLANNING-AUDIT.md` in full.
3. **Coverage.** List every owner requirement (brief §2, items 1-10) and every recommendation in brief §§7-17a.
   For each, say whether the audit has a row or sentence for it. A requirement or recommendation the audit
   omits is a finding.
4. **Truth.** For every row in the audit's §2 (the ten requirements) and §4 (the recommendations), open the
   files the row names and check each factual claim — "built", "owed", "decided", "no rule", "holds only …",
   a status, a count. Say per row **true**, **false** (quote what the file actually says) or **cannot tell**.
   Check §0 (what was resolved since) the same way: Rule 25 exists in `docs/RULES.md`; Rules 6, 11 and 12 carry
   the dated amendments; `docs/adr/0031-revision-keeps-its-number.md` exists; the brief has the three dated
   notes; the two design headers and `new-app/CLAUDE.md`'s MFA line are corrected.
5. **The owed list.** For §7's twelve designs, check that each "unblocks" claim matches the PRD
   (`docs/PRD.md`) and that nothing the PRD requires before building is missing from the list.
6. Do not edit, commit, stash, `git checkout --` or `git restore` anything.

## Report

Findings numbered **PA1, PA2, …**, each with the audit's line, what the file actually says, and the file and
line you read. Then the coverage list (step 3) as a table, the per-row truth verdicts (step 4), and a last line:
**the audit is accurate**, or **the audit is accurate except PA…**. Then `git status --short`, which must be
empty.

## Expectations

```check
$ test -f docs/PLANNING-AUDIT.md && test -f docs/DEVELOPMENT-BRIEF.md && test -f docs/adr/0031-revision-keeps-its-number.md && echo present
present
```

```check
$ grep -c "^## 25\. Customer service and feedback" docs/RULES.md; grep -c "Note 2026-10-02, Rule 23.5" docs/DEVELOPMENT-BRIEF.md
1
3
```

```check
$ grep -c "^| [0-9]* |" docs/PLANNING-AUDIT.md
37
```

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
```
