# Briefs

A brief tells an agent what to do and, for a check, exactly what it should find (Rule 16.7). It lives here,
committed, so the version the agent read is the version in the history.

## The format

Prose for whoever reads it — the checker, or a person. Every expected output is a fenced block tagged
`check`: the first line is the command after `$ `, and every line after it is the exact standard output
expected (no lines means "no output"). Commands run with `bash -c` from the repository root.

## Before launch

1. Commit the brief. Nothing else may be uncommitted.
2. Run `python3 tools/run_brief.py docs/briefs/<brief>.md`. It refuses a dirty tree, prints the HEAD,
   runs every check, and fails if one does not hold or if the tree is changed afterwards.
3. Record the brief's path, the HEAD and the count in the launch entry in `docs/BRIEF-STATUS.md`, and add
   the launch to `docs/DELEGATION-LOG.md` when its outcome is known (Rule 16.8).

The checker runs the same command and reports its output. What the runner does not prove is in its header.
