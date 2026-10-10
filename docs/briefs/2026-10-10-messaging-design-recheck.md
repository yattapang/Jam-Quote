# Brief: re-check of the fixes to the outbound messaging design's closing-check defects (D1-D6)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — six named defects, each with its text to read and an
executed expectation). **Why it exists:** the closing check (`docs/briefs/2026-10-09-messaging-design-closing-check.md`)
found A6 closable for MR1-MR24 and listed six defects in the amendments themselves, D1-D6. Their fixes are unreviewed
work until someone else checks them (Rule 24.6; M16, M17).
**Brief step:** build plan A6 (`docs/BUILD-PLAN.md`), phase A.
**Do not touch:** anything. This is a reading check.

## The six defects, as the closing check reported them, and where each fix is

- **D1** — MS6 said Postmaster Tools is read weekly "on the operations calendar (OP12)", but OP12 had no such row. *Fix:*
  OP12's Monday row in `docs/design/environments-and-operations.md`.
- **D2** — §12 said production "stays within A5's about US$76-95 a month"; with email it is about US$80-99. *Fix:* §12's
  costs paragraph in `docs/design/outbound-messaging.md`, and OA1 in `docs/OWNER-ACTIONS.md`.
- **D3** — §13 claimed mechanism for rows whose answer is a C1 test or a person. *Fix:* every §13 row carries one of
  three verdicts — Mechanical now, C1 test, Not mechanical — and M45 in `docs/MISTAKES.md` records the repeat.
- **D4** — `message_secret` had no stated lifetime for a message that fails, is suppressed, or whose worker stops. *Fix:*
  MS2 item 3.
- **D5** — how a client's own code passes SES's tenant-level suppression after a complaint was unstated. *Fix:* MS3's
  suppression bullet.
- **D6** — "three accounts" left in A5's text. *Fix:* `docs/design/third-party-register.md`, RG7's decision row and OA6's
  line in its §11.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-10-messaging-design-recheck.md` and
   report its full output. Every check must PASS.
2. For each of D1-D6, read the fix and report **fixed** or **not fixed**, quoting the sentence. For D2, add up the
   figures yourself (OP3's US$45-60, A5's added US$31-35, A6's about US$4) and say whether US$80-99 follows. For D3,
   read each §13 row marked "Mechanical now" and confirm the check it names exists (a file, or the closing check's
   sweep).
3. Do not edit, commit, stash, `git checkout --` or `git restore` anything.

## Report

The runner's output; D1-D6, each fixed / not fixed with its quoted sentence; and a last line, **closable** or **not
closable**. Nothing else.

## Expectations

```check
$ grep -c "Postmaster Tools" docs/design/environments-and-operations.md; grep -c "about US\$80-99" docs/design/outbound-messaging.md; grep -c "about US\$80-99" docs/OWNER-ACTIONS.md
1
1
1
```

Every §13 row carries one of the three verdicts (the count of rows without one; this check was planted against —
a row with its verdict removed counts 1):

```check
$ awk '/^## 13\./{f=1;next} /^## 14\./{f=0} f && /^\| \*\*/ { if ($0 !~ /(Mechanical now|C1 test|Not mechanical|\| — \|$)/) n++ } END{print n+0}' docs/design/outbound-messaging.md
0
```

```check
$ grep -c "a sweep deletes any secret older than one hour" docs/design/outbound-messaging.md; grep -c "SES suppresses for bounces only" docs/design/outbound-messaging.md; grep -c "five since A6: OA6" docs/design/third-party-register.md; grep -c "two more added by A6 for email" docs/design/third-party-register.md; grep -c "And once more, inside the amendments" docs/MISTAKES.md
1
1
1
1
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
