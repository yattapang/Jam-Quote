# ADR 0031 — A revision keeps its quote's number

- **Status:** Accepted
- **Date:** 2026-10-02
- **Decided by:** the owner, resolving drift D-1 of the planning baseline audit (`docs/PLANNING-AUDIT.md` §5).
- **Affects:** `docs/PRD.md` R1.14, R1.15, R1.32; the numbering part of the GCT-and-documents design (ADR 0030,
  design 1); `issue_number`'s allocation.
- **Delegation (Rule 16.5):** Opus — a product rule with a schema consequence.

## Context

The original brief (§10) says the assigned number "is fixed as part of the immutable snapshot … and never
changes on revision". The approved PRD made a revision a new issue taking the **next** number from the series,
and the schema allocates one `issue_number` row per issue, unique per series. The two contradicted each other.

## Decision

**A revision keeps its quote's number, with a revision suffix** — Q-0042, then "Q-0042 rev 2". The number is
allocated once per **quote**, when its first issue is numbered; every later revision of that quote carries it.
Clients and accountants cite one number per job. Each revision is still its own immutable issue (R1.15).

## Alternatives considered

A new number per revision (the PRD as approved): simpler allocation, but one job carries several numbers — and
it contradicted the owner's brief.

## Consequences

- The free-tier meter is unchanged: it already counts distinct quotes numbered, not numbers (PRD R1.32).
- Gaplessness is per quote number: a revision allocates nothing.
- `issue_number` today is one row per issue, unique on (series, number), so a second revision cannot carry its
  quote's number. The numbering design (ADR 0030, design 1) changes the allocation — for example, the number
  held per quote and the issue keyed by (quote number, revision) — in a new migration (Rule 6). Nothing is built
  until that design is approved.
- A rejected seal of a revision (PRD R1.18c) never took a number, so it is unaffected.
