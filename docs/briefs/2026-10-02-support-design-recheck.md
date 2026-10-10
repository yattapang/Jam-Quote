# Brief: re-check of SR5 in the support and feedback design

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — three sentences to find and one judgement to make).
**Why:** the closing check (`docs/briefs/2026-10-02-support-design-closing-check.md`, HEAD `7d69e45`) found SR1-SR4
and SR6-SR15 answered and SR5 answered only in part. Its words: the design "does not record reconciling ADR 0030
decision 4 and Rule 25.3 in the A3 ADR". It also noted, as a residue under SR8, that the design did not say which
audit trail records staff actions on an unconfirmed support-inbox ticket. Both are fixed at the commit that adds this
brief. Rule 24.6: a finding is closed only after an independent check.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-02-support-design-recheck.md` and
   report its full output. Every check must PASS, and the tree must be clean afterwards.
2. Read SF5 of `docs/design/support-and-feedback.md`, decision 4 of `docs/adr/0030-planning-directions.md` with its
   note, and Rule 25.3 of `docs/RULES.md`. Report whether the conflict between ADR 0030 decision 4 (version and tier
   behind consent) and SF5 (version and tier always) is now **recorded, with which document governs** — quoting the
   sentences — and whether Rule 25.3 is consistent with SF5 as the design claims.
3. Read SF3's "How staff reach tickets". Report whether it now says which trail records staff actions on a ticket
   still in the support inbox, quoting the sentence.
4. Do not edit, commit, stash, `git checkout --` or `git restore` anything.

## Report

The runner's output; items 2 and 3 with their quotes; and a last line, **SR5 closable** or **SR5 not closable**.

## Expectations

```check
$ grep -c "This changes ADR 0030 decision 4" docs/design/support-and-feedback.md; grep -c "finding SR5" docs/adr/0030-planning-directions.md
1
1
```

```check
$ grep -c "platform trail only" docs/design/support-and-feedback.md
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

```check
$ git status --short
```
