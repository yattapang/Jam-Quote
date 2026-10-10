# Brief: independent check of the deferral checker (M45)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: a small guard, checked against a written design with named plants;
mechanical). **Under check:** `tools/check_deferrals.py` against `docs/design/deferral-checker.md`, its step in
`.github/workflows/verify.yml` (`docs` job), the gate list in the root `CLAUDE.md`, and the 13 resolutions it forced in
`docs/design/api-layer.md`, `docs/design/environments-and-operations.md`, `docs/design/support-and-feedback.md`,
`docs/design/third-party-register.md` and `docs/adr/0032-support-model.md`.
**Why it exists:** a new guard is unreviewed work, and its own first version is suspect (Rule 21.9's note; M21) — this
one's was wrong once already (it read a fenced example as a tick).

## What to do

1. From the repository root, run `python3 tools/run_brief.py docs/briefs/2026-10-10-deferral-checker-check.md` and report
   its full output. Every check must PASS, and the tree must be clean afterwards.
2. **Plant, yourself, and restore** (Rule 1.5): copy `docs/design/api-layer.md` to a backup outside the repository; for
   each plant below, append the line(s), run `python3 tools/check_deferrals.py`, record the exit code and the line it
   names; then copy the backup back and show `diff -q` reports nothing. Never `git checkout` or `git restore`.
   - `Plant: the store is priced in A5.` → must fail;
   - `Plant: A6 will confirm it.` → must fail (backward form);
   - `Plant: designed in A9.` → must pass (A9 is not ticked);
   - `Plant: chosen in A5 (Pointer 2026-10-10: RG2).` → must pass;
   - a line whose only "pointer" is the word without a date, `Plant: chosen in A5 (pointer: later).` → must fail.
3. **Try to break it** in ways the design does not list, and report any you find: a step id inside a word, a ticked
   step written in lower case, a phrase split across two lines, a tick line written differently in the plan, a fenced
   block left unclosed. Say for each whether the tool's docstring already states the gap.
4. Read the 13 resolutions: does each pointer name the design that actually decided it (spot-check at least five against
   the cited section)?
5. Do not edit, commit, stash, `git checkout --` or `git restore` anything except the plant-and-restore of step 2.

## Report

The runner's output; each plant with its exit code and named line, and the final `diff -q`; each break attempt and
whether the docstring states it; the resolution spot-checks; and a last line, **closable** or **not closable**. Then
`git status --short`, which must be empty.

## Expectations

```check
$ python3 tools/check_deferrals.py | tail -2
28 deferral phrases found; 24 name a ticked step; resolved: 8 by quotation, 13 by dated pointer, 3 by cites the deciding design
No deferral names a decided step, in the forms this tool checks (its docstring lists what it does not).
```

```check
$ python3 tools/check_deferrals.py | head -1
ticked steps: A1, A2, A3, A4, A5, A6
```

```check
$ python3 -c "import yaml; d=yaml.safe_load(open('.github/workflows/verify.yml',encoding='utf-8')); print([s.get('run') for s in d['jobs']['docs']['steps'] if s.get('name')=='No deferral names a decided step'])"
['python3 tools/check_deferrals.py']
```

```check
$ grep -c "check_deferrals.py" CLAUDE.md; grep -c "^\*\*Built, 2026-10-10, at the owner's word" docs/MISTAKES.md
1
1
```

```check
$ for t in check_rules check_dispositions check_citations check_schema_citations check_build_plan check_deferrals; do python3 tools/$t.py 2>&1 | tail -1; done
All citations resolve, and no rule has changed unreviewed.
Every Closed disposition cites every document its finding named.
Every cited filename and symbol resolves. (Paths are checked by tools/check_schema_citations.py, not here.)
Every citation in the forms this tool checks resolves (its docstring lists them, and what it does not check).
Every ticked step carries its evidence.
No deferral names a decided step, in the forms this tool checks (its docstring lists what it does not).
```

```check
$ git status --short
```
