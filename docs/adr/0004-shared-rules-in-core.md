# 0004 — Every money, tax and settlement rule lives once in `packages/core`

**Status:** Accepted (2026-07, reinforced 2026-09-19)

## Context
The same question — what does this quote total, is this invoice settled, what tax applies,
when does this term renew — is asked by the API, the web app, the PDF renderer and the
mobile app. Each copy of an answer is a future disagreement.

## Decision
One function per rule in `packages/core`, imported by every surface. No surface restates a
rule, not even the same expression inline for speed.

## Alternatives considered
- **Duplicating small expressions** where the copy is obviously identical. Rejected by
  evidence: the web app's GCT default and the API's had already drifted — the web fell back
  to a hardcoded 15% where the API produced `NaN` — and a job's placeholder cost flowed into
  a quote price because two places decided what "invalid" meant.

## Consequences
- Core has no framework dependencies, so every surface can import it.
- `apps/*` consume core's built `dist`; a core change needs a rebuild before the other
  workspaces see it.
- A drift guard (`apps/api/src/integration/core-rules-drift.test.ts`) fails when a rule is
  restated, with an exact-count allow-list for the copies not yet folded in.
