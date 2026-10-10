# Brief: re-check of the step index that answers M46 at its root

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: named plants and break attempts against two small tools).
**Under check:** `tools/check_build_plan.py` and `tools/check_deferrals.py` after commit `08de97d`, with the new index
`docs/build-plan-manifest.json`. The previous re-check (`docs/briefs/2026-10-10-plan-parser-recheck.md`) was **not
closable**: five tick shapes and a full-width id still slipped through. The answer stopped recognising shapes: **the
steps the plan parses must be exactly the ids in the index**, so a step whose line stops parsing is reported missing
whatever was done to it; changing the plan's steps on purpose means `python tools/check_build_plan.py --update`. Ids
are read in ASCII after NFKC normalisation; an evidence line with no tick directly above it fails. Only the builder's
plants have run against it (Rule 24.6).

## How to plant — never in the working tree

A session restart once killed a plant run and left a planted defect in the real build plan (`docs/MISTAKES.md` M46).
So **every plant in this check runs in a disposable worktree**, never in `C:\dev\JamQuote` itself:

```
git -C C:/dev/JamQuote worktree add --detach <scratch>/recheck-wt HEAD
```

where `<scratch>` is a directory outside the repository (your session scratchpad). Run the tools from inside the
worktree (`cd <scratch>/recheck-wt && python3 tools/check_build_plan.py`). Back up each file you change inside the
worktree first, restore from that backup after each plant, and show `diff -q`. When finished, remove the worktree with
`git -C C:/dev/JamQuote worktree remove --force <scratch>/recheck-wt` and show `git -C C:/dev/JamQuote worktree list`.
On this machine Windows Python cannot open `/c/...` paths — use `C:/...` or relative paths — and set
`PYTHONIOENCODING=utf-8` when capturing the tools' output.

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-10-step-index-recheck.md` and report
   its full output. Every check must PASS.
2. **Plants, in the worktree.** For each, record both tools' exit codes:
   - in the plan, replace `- [x] A5 · ` with each of: `- [ x] A5 · `, `- [] A5 · `, `- [xx] A5 · `, `- ( x ) A5 · `,
     `- ☑ A5 · `, `- [x] a5 · `, `1. [x] A5 · `, `> - [x] A5 · `, `- [X] A5 · `, `- [x] **A5** · `, and a plain
     `- A5 · ` → **both** tools must exit non-zero;
   - replace it with `- [x] A５ · ` (full-width five) **and** append `Plant: chosen in A5.` to
     `docs/design/api-layer.md` → `check_build_plan.py` passes, `check_deferrals.py` must fail naming that line;
   - add a new line `- [ ] A14 · Extra` before the A7 line → both must fail; then run `--update` in the worktree → both
     must pass;
   - remove the A5 tick's line but keep its evidence line → both must fail;
   - delete the A5 line and its evidence line entirely, without `--update` → both must fail.
3. **Try to make either tool go silent, or make the two read the plan differently**, once more — including ways to
   defeat the index (for example, editing the plan and the index together, or an index that is not valid JSON). Report
   each attempt, its result, and whether a docstring states it.
4. **Compare each docstring's claims with what you observed** (Rule 21.1).
5. Do not edit, commit, stash, `git checkout --` or `git restore` anything in `C:\dev\JamQuote` itself.

## Report

The runner's output; each plant with both exit codes; the `diff -q` results and the final `git worktree list`; the
silence attempts; the docstring comparison; and a last line, **closable** or **not closable**. Then
`git -C C:/dev/JamQuote status --short`, which must be empty.

## Expectations

```check
$ python3 tools/check_build_plan.py | tail -2; python3 tools/check_deferrals.py | head -1; python3 tools/check_deferrals.py | tail -1
6 steps done, 58 open, in docs/BUILD-PLAN.md (64 parsed; the index holds 64)
Every ticked step carries its evidence.
ticked steps: A1, A2, A3, A4, A5, A6
No deferral names a decided step, in the forms this tool checks (its docstring lists what it does not).
```

```check
$ python3 -c "import json; d=json.load(open('docs/build-plan-manifest.json',encoding='utf-8')); print(len(d['steps']), d['steps'][0], d['steps'][-1])"
64 A1 K1
```

```check
$ grep -c "^def read_plan" tools/check_build_plan.py; grep -c "from check_build_plan import read_plan" tools/check_deferrals.py; python3 -c "d=open('tools/check_build_plan.py','rb').read()+open('tools/check_deferrals.py','rb').read(); print(sum(1 for b in d if b < 9 or 13 < b < 32))"
1
1
0
```

```check
$ git worktree list | wc -l
1
```

```check
$ git status --short
```
