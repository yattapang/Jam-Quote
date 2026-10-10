# Brief: re-check of `tools/check_mechanical_claims.py` after A7's closing check (Rule 24.7)

**Rule 0 first:** read `docs/RULES.md` and state which rules apply before starting. **You have no subagents; you do
this work yourself** (Rule 16.6).

**Agent:** general-purpose, **Sonnet** (Rule 16.9: a small guard, with named plants and break attempts).
**Under check:** `tools/check_mechanical_claims.py` at the commit that adds this brief, and the addendum to M47 in
`docs/MISTAKES.md` ("And the tool's own gaps").
**Do not touch:** anything in the working tree. Plants run only in a disposable worktree.

## Background

A7's closing check (`docs/briefs/2026-10-10-document-design-closing-check.md`) found the tool closable, but three
inputs got past it without its docstring saying so: a table row indented or inside a blockquote (`> | ...`); variants
of the phrase (`**Mechanical** now`, a double space, a non-breaking space); and a fence mark inside an HTML comment
that hid a visible row. The fix removes HTML comments first, reads rows and fences through blockquote markers and up to
three spaces of indent, and matches the phrase after Unicode normalisation with `*` and `_` dropped and spaces
collapsed.

## What to do

1. Run `python3 tools/run_brief.py docs/briefs/2026-10-10-mechanical-claims-recheck.md` and report its full output.
2. In a disposable worktree (`git worktree add --detach <your scratch dir>/mc HEAD`; remove it with
   `git worktree remove --force` and `git worktree prune` at the end), append each case to `docs/design/api-layer.md`,
   run the tool, and restore the file from a backup copy before the next, proving the restore with `diff -q`:
   - the three escapes the closing check found, each now expected to **fail**: an indented verdict row; a blockquoted
     verdict row; `**Mechanical** now`, a double space, a non-breaking space; and the HTML-comment fence trick (a
     comment holding a fence line, a visible verdict row, a comment holding the closing fence);
   - and these expected to **pass**: a verdict row inside a single HTML comment; `**Not** mechanical now`; a verdict
     row inside a closed fence; a clean baseline.
3. **Try to defeat it again** (Rule 21.2): at least six new attempts — for example a comment opened and closed on the
   same line as the row, `<!--` inside backticks, four spaces of indent (a code block in Markdown, which should *not*
   count), HTML table markup, a zero-width character inside the phrase, a fullwidth letter. For each, say whether
   Markdown renders a visible verdict row, whether the tool catches it, and whether its docstring states the limit.
4. Read the addendum to M47: is each claim in it true of the tool?
5. Do not edit, commit, stash, `git checkout --` or `git restore` anything in the working tree.

## Report

The runner's output; each case and attempt with its result; the M47 check; and a last line, **closable** or **not
closable**. Then `git status --short` and `git worktree list`, which must show a clean tree and no extra worktree.

## Expectations

```check
$ grep -c "def visible_lines" tools/check_mechanical_claims.py; grep -c "And the tool's own gaps" docs/MISTAKES.md
1
1
```

```check
$ python3 tools/check_mechanical_claims.py | tail -1
Every 'Mechanical now' row cites a brief whose check ran against its design (Rule 24.7; its docstring lists what that does not prove).
```

```check
$ git status --short
```
