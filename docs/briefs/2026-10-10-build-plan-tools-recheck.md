# Brief: re-check of the fail-open fixes to the two build-plan tools (M46)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: mechanical — named plants against two small tools). **Under check:**
`tools/check_build_plan.py` and `tools/check_deferrals.py` after commit `0e81c76`, which answered three gaps the deferral
checker's independent check found (`docs/briefs/2026-10-10-deferral-checker-check.md`; `docs/MISTAKES.md` M46): a step
line in any other form, or an unclosed fence, made a step vanish from both tools; and the backward deferral form was
case-sensitive. A fix to a guard is unreviewed work until someone else plants against it (Rule 24.6).

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-10-build-plan-tools-recheck.md` and
   report its full output. Every check must PASS.
2. **Plant, yourself, and restore** (Rule 1.5). Copy `docs/BUILD-PLAN.md` and `docs/design/api-layer.md` to backups
   **outside the repository** first. For each plant, change the file, run **both** tools, record each exit code and its
   last line, then copy the backup back — and do the restore even if a command fails (a harness that died mid-plant
   left the plan mutated once already). After all plants, show `diff -q` against each backup reports nothing. Never
   `git checkout` or `git restore`.
   - In the plan, change `- [x] A5 · ` to `* [x] A5 · ` → **both** tools must fail;
   - to `- [x]  A5 · ` (two spaces) → both must fail;
   - to `- [X] A5 · ` (capital X) → both must fail;
   - to `+ [x] A5 · ` → both must fail;
   - insert a line containing only three backticks just before the A5 line → both must fail;
   - append to the design `Plant: A5 Confirms the price.` → `check_deferrals.py` must fail, `check_build_plan.py` pass;
   - the plan untouched, append to the design `Plant: decided in A9.` → both must pass.
3. **Try once more to make either tool go silent** — a step line it skips without failing, or a tick it misreads — and
   report what you tried and what happened.
4. Do not edit, commit, stash, `git checkout --` or `git restore` anything beyond the plant-and-restore of step 2.

## Report

The runner's output; each plant with both exit codes and last lines; the final `diff -q` results; the silence
attempts; and a last line, **closable** or **not closable**. Then `git status --short`, which must be empty.

## Expectations

```check
$ python3 tools/check_build_plan.py | tail -1; python3 tools/check_deferrals.py | tail -1
Every ticked step carries its evidence.
No deferral names a decided step, in the forms this tool checks (its docstring lists what it does not).
```

```check
$ grep -c "LOOSE_STEP" tools/check_build_plan.py; grep -c "a code fence is never closed" tools/check_build_plan.py tools/check_deferrals.py; grep -c "^### M46 ·" docs/MISTAKES.md
2
tools/check_build_plan.py:1
tools/check_deferrals.py:1
1
```

```check
$ python3 -c "import sys; d=open('tools/check_build_plan.py','rb').read()+open('tools/check_deferrals.py','rb').read(); print(sum(1 for b in d if b < 9 or 13 < b < 32))"
0
```

```check
$ git status --short
```
