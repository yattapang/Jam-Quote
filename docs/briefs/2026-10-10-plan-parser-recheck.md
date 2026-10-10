# Brief: re-check of the shared plan parser that replaced the shape patches (M46, Rule 21.9)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: named plants and break attempts against two small tools).
**Under check:** `tools/check_build_plan.py` (its `read_plan` parser) and `tools/check_deferrals.py` (which imports it),
after commit `4b7da6c`. The previous re-check (`docs/briefs/2026-10-10-build-plan-tools-recheck.md`) found seven tick
shapes that still vanished silently from both tools; by Rule 21.9 the shape list was replaced by a positive rule — **any
line outside a code fence that carries a one-character bracket must be a well-formed step `- [ ] A1 · …` or
`- [x] A1 · …`, or both tools fail** — read by one parser. Only the builder's own plants have run against it; a fix to a
guard is not proved until someone else plants against it (Rule 24.6).

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-10-plan-parser-recheck.md` and report
   its full output. Every check must PASS.
2. **Plant, yourself, and restore** (Rule 1.5). Back up `docs/BUILD-PLAN.md` and `docs/design/api-layer.md` **outside the
   repository** first; for each plant, change the file, run **both** tools, record both exit codes, and restore from the
   backup **even if a command fails** (use a `finally` block or a shell `trap`). After all plants, show `diff -q` against
   each backup reports nothing. Never `git checkout` or `git restore`. On this machine Windows Python cannot open
   `/c/...` paths — use `C:\...` or relative paths — and set `PYTHONIOENCODING=utf-8` if you capture the tools' output
   from Python.
   - In the plan, replace the A5 line's `- [x] A5 · ` with each of: `- [x] a5 · `, `- [x] **A5** · `, `1. [x] A5 · `,
     `> - [x] A5 · `, ``- [x] `A5` · ``, `- [x] L5 · `, `- [x] The third-party register · `, `* [x] A5 · `,
     `- [X] A5 · `, `- [✓] A5 · ` → **both** tools must exit non-zero;
   - insert a line of three backticks, then separately a line of three tildes, before the A5 line → both must fail;
   - insert a closed tilde-fenced block containing `- [x] B9 · example` before the A5 line → both must pass;
   - append to the design `Plant: A5 Confirms the price.` → `check_deferrals.py` must fail, `check_build_plan.py` pass.
3. **Try to make either tool go silent once more** — any tick, in any shape, that leaves A5 ticked in the plan's meaning
   but out of the tools' count, or that the two tools read differently. Report each attempt and its result, and whether
   the tools' docstrings state it.
4. **Compare each docstring's claims with what you observed** (Rule 21.1): report any sentence that claims more than the
   tool does.
5. Do not edit, commit, stash, `git checkout --` or `git restore` anything beyond the plant-and-restore of step 2.

## Report

The runner's output; each plant with both exit codes; the final `diff -q` results; the silence attempts; the docstring
comparison; and a last line, **closable** or **not closable**. Then `git status --short`, which must be empty.

## Expectations

```check
$ python3 tools/check_build_plan.py | tail -2; python3 tools/check_deferrals.py | head -1; python3 tools/check_deferrals.py | tail -1
6 steps done, 58 open, in docs/BUILD-PLAN.md
Every ticked step carries its evidence.
ticked steps: A1, A2, A3, A4, A5, A6
No deferral names a decided step, in the forms this tool checks (its docstring lists what it does not).
```

The two tools share one parser:

```check
$ grep -c "^def read_plan" tools/check_build_plan.py; grep -c "from check_build_plan import read_plan" tools/check_deferrals.py; grep -c "LOOSE_STEP" tools/check_build_plan.py tools/check_deferrals.py
1
1
tools/check_build_plan.py:0
tools/check_deferrals.py:0
```

No stray control bytes in either tool (this check was proved able to fire on a planted backspace):

```check
$ python3 -c "d=open('tools/check_build_plan.py','rb').read()+open('tools/check_deferrals.py','rb').read(); print(sum(1 for b in d if b < 9 or 13 < b < 32))"
0
```

```check
$ git status --short
```
