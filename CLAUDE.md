# CLAUDE.md

Orientation for Claude Code (and people) at the repository root. Deliberately short: each fact below has
one home elsewhere, and this file points to it rather than restating it (ADR 0025, Rule 21.10).

## What this repository is

**Pryvis** — quoting and invoicing for contractors, Jamaica first. It holds two applications:

- **`new-app/`** — the selective rebuild, where all work happens. **Read `new-app/CLAUDE.md` before
  changing anything**: layout, tenant isolation, commands, the test gate, and what is not built yet.
- **`original-app/`** — the earlier application (JamQuote), **read-only and frozen**. Never edit it,
  never import from it, and do not delete it without the owner's explicit confirmation.

Until 2026-10-01 this file described the old JamQuote app as if it were current; that text is in git
history.

## Read before any task

1. `docs/RULES.md` — the rules; cite the ones that apply before starting (Rule 0).
2. `docs/MISTAKES.md` — the ledger of what went wrong and what now prevents it.
3. `new-app/CLAUDE.md` — the codebase.
4. `docs/BRIEF-STATUS.md` — where the work stands and the owner's latest decisions; `docs/BUILD-PLAN.md` —
   the build order, with the checklist a step must meet before it is ticked.
5. `docs/PRD-REVIEW-5.md` and `docs/PRD-REVIEW-4.md` — the disposition tables at the top: the open review findings.
6. `docs/OWNER-ACTIONS.md` — every action only the owner can take, sent in complete batches when their stage is
   reached, never one at a time (the owner's instruction, 2026-10-02). A new one goes into the next unsent batch.

## The gate, before every commit

From `new-app/`: `npm run typecheck && npm test` (workspace root, never one package). Then from the
repository root, the six checkers in `tools/` — `check_rules.py`, `check_dispositions.py`,
`check_citations.py`, `check_schema_citations.py`, `check_build_plan.py`, `check_deferrals.py` (added 2026-10-10, M45). Read the counts, not the exit codes. The race suite needs
real PostgreSQL via `PRYVIS_PG_URL` (see `new-app/CLAUDE.md`).

## Non-negotiables (details in `docs/RULES.md`)

- Never `git checkout --` or `git restore`. Plant a defect from a backup copy, restore from it, prove it
  with `diff -q`.
- Never edit a committed migration (Rule 6); correct it in a new one.
- A guard or control is not closed until a planted defect proves it fails.
- A finding is Closed only after an independent check (Rule 24.6).
- An agent's brief is a committed file whose expectations `tools/run_brief.py` runs on the HEAD it names
  before launch (Rule 16.7); every launch goes in `docs/DELEGATION-LOG.md` (16.8); pick the cheapest tier
  that can do it reliably as briefed (16.9).
- Never send tenant or client personal data, or secrets, to any model.
