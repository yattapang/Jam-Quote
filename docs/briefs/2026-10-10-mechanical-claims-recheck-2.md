# Brief: second re-check of `tools/check_mechanical_claims.py`, after its shape was replaced (Rule 24.7, Rule 21.9)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: a small guard, with named plants and break attempts).
**Under check:** `tools/check_mechanical_claims.py` at the commit that adds this brief; Rule 24.7's mechanism line in
`docs/RULES.md`; the second addendum to M47 in `docs/MISTAKES.md` ("And replaced, not patched a third time"); and the
reworded legend lines in `docs/design/outbound-messaging.md` §13 and `docs/design/document-settings-and-pdf.md` §11.
**Do not touch:** anything in the working tree. Plants run only in a disposable worktree.

## Background

The first re-check (`docs/briefs/2026-10-10-mechanical-claims-recheck.md`) found the tool not closable: E1 a row
after `>` and four spaces; E2 a backticked `<!--`; E3 an unclosed inline `<!--`; E4 a zero-width space, soft hyphen or
`&nbsp;` inside the phrase. Two misses of one class, so the tool no longer reads Markdown structure: every line of every
tracked design that says the verdict, after normalisation (entities decoded, NFKC, invisible characters both dropped
and read as spaces, `*` `_` and backtick removed, whitespace collapsed), must cite a tracked brief whose check block
names the design. A phrase split over two lines fails. It is stricter than Markdown on purpose.

## What to do

1. Run `python3 tools/run_brief.py docs/briefs/2026-10-10-mechanical-claims-recheck-2.md` and report its full output.
2. In a disposable worktree (`git worktree add --detach <your scratch dir>/mc HEAD`; remove it with
   `git worktree remove --force` and `git worktree prune` at the end), append each case to `docs/design/api-layer.md`,
   run the tool, restore from a backup copy, and prove the restore with `diff -q`:
   - every escape from both earlier checks, each expected to **fail**: an indented row, a blockquoted row, `>` plus four
     spaces, a nested quote, `**Mechanical** now`, a double space, a non-breaking space, the comment-fence trick, a
     backticked `<!--` on the row, an unclosed inline `<!--` with the row on the next line, a zero-width space between
     the words and inside a word, a soft hyphen, `&nbsp;`;
   - expected to **pass**: a clean baseline; `**Not** mechanical now`; a verdict row citing
     `docs/briefs/2026-10-02-api-layer-closing-check.md` (whose checks name `docs/design/api-layer.md`).
3. **Try to defeat it again** (Rule 21.2), at least eight new attempts — for example other invisible or combining
   characters, a look-alike letter, other HTML entities (`&#77;`, `&#x20;`), the phrase split across three lines, a
   citation that only looks like a brief path, a brief whose check block names the design inside a comment line of the
   block. For each, say whether a reader would see the verdict, whether the tool catches it, and whether its docstring
   states the limit.
4. Read the M47 addendum and Rule 24.7's mechanism line: is each claim true of the tool?
5. Do not edit, commit, stash, `git checkout --` or `git restore` anything in the working tree.

## Report

The runner's output; each case and attempt with its result; the claims check; and a last line, **closable** or **not
closable**. Then `git status --short` and `git worktree list`, which must show a clean tree and no extra worktree.

## Expectations

```check
$ grep -c "def says_verdict" tools/check_mechanical_claims.py; grep -c "And replaced, not patched a third time" docs/MISTAKES.md; grep -c "fails when any line of a" docs/RULES.md
1
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
