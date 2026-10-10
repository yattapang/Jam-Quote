# Brief: final check of `tools/check_mechanical_claims.py` — are its docstring's claims true? (Rule 24.7, Rule 21.4)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: a bounded check of named claims, with named plants).
**Under check:** `tools/check_mechanical_claims.py` at the commit that adds this brief, and M47's third addendum in
`docs/MISTAKES.md` ("And its limits stated, not chased").
**Do not touch:** anything in the working tree. Plants run only in a disposable worktree.

## Background, and what this check is not

Two re-checks (`docs/briefs/2026-10-10-mechanical-claims-recheck.md`, `docs/briefs/2026-10-10-mechanical-claims-recheck-2.md`)
found ways to disguise the phrase "Mechanical now" from the tool. The tool's docstring now states its **threat model**:
it guards against an author's honest over-claim in any formatting, not deliberate disguise by someone with commit
access, which a reviewed diff shows; and it **lists the disguises that still pass**. This check is bounded to that:
**is every claim in the docstring true of the tool?** — both what it says it catches and what it says it does not.
Finding a new deliberate disguise is reportable only if the docstring claims to catch it, or if it is something an
honest author would plausibly write by accident.

## What to do

1. Run `python3 tools/run_brief.py docs/briefs/2026-10-10-mechanical-claims-recheck-3.md` and report its full output.
2. In a disposable worktree (`git worktree add --detach <your scratch dir>/mc HEAD`; remove it with
   `git worktree remove --force` and `git worktree prune` at the end), for **each sentence** of the docstring's "What it
   does" (items 1-4) and "What it does NOT prove", plant one input that tests it in `docs/design/api-layer.md`, run the
   tool, restore from a backup, and prove the restore with `diff -q`. Include the second re-check's M1 (a split inside
   a blockquote and a list), M2 (`<span></span>`, `<b></b>`, `<!-- -->` inside the phrase), M3 (U+034F, U+FE0F, U+3164,
   U+2800), M5 (a hard-break backslash), and "cannot mechanical now". Report each claim **true** or **untrue**, with
   the input and the output.
3. Try **three honest-author inputs** of your own choosing — formatting a careful author might really use in a design
   (for example a verdict in a nested list, in a table cell with a link, or after a footnote marker) — and report each.
4. Read M47's third addendum: is each claim in it true?
5. Do not edit, commit, stash, `git checkout --` or `git restore` anything in the working tree.

## Report

The runner's output; each docstring claim, true or untrue, with input and output; the three honest-author inputs; the
M47 check; and a last line, **closable** or **not closable**. Then `git status --short` and `git worktree list`.

## Expectations

```check
$ grep -c "What it guards against" tools/check_mechanical_claims.py; grep -c "And its limits stated, not chased" docs/MISTAKES.md
1
1
```

```check
$ python3 tools/check_mechanical_claims.py | tail -1
Every 'Mechanical now' line cites a brief whose check ran against its design (Rule 24.7; its docstring lists what that does not prove).
```

```check
$ git status --short
```
