# 0011 — Money columns are 64-bit, with a validated ceiling of 999,999,999.99

**Date:** 2026-09-23
**Status:** Accepted
**Decided by:** the owner, on finding 15 of `docs/PHASE-0-AUDIT.md`

## Context

Every money column in the existing schema is a Postgres `Int` holding minor units (cents). A
32-bit signed integer caps at 2,147,483,647, so **no document can exceed $21,474,836.47**. In
JMD that is not an absurd ceiling — it is a plausible one for a large commercial contract, and
the audit flagged it as a real defect rather than a theoretical limit.

The owner's requirement: **Jamaican figures up to approximately 999,999,999.99 JMD.** That is
**99,999,999,999 cents**, roughly 46× what a 32-bit column holds.

One arithmetic fact decides the shape of this: 99,999,999,999 is far below JavaScript's
`Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). Integer arithmetic on cents at this
magnitude is **exact** in a JavaScript `number` — no precision is lost, and totals summed from
many such lines stay exact with several orders of magnitude of headroom. So the problem is the
**column width**, not the language's number type.

## Decision

1. **Money columns are 64-bit** (`BigInt` in Prisma, `bigint` in Postgres).
2. **The documented business ceiling is 99,999,999,999 minor units** (999,999,999.99), and it
   is **validated at the boundary**, not left to the column. A value above it is refused with a
   plain-English message, in one shared place, the same way negative amounts already are. A
   type that merely *permits* a number is not a rule about what the product accepts.
3. **Cents cross into the application as `number`, converted once at the persistence
   boundary**, after the ceiling is asserted. `packages/core` keeps doing exact integer
   arithmetic in `number`, unchanged.
4. **The ceiling is one value in core**, expressed in minor units, and every schema, DTO and
   form bound derives from it. It is not restated per field.
5. This lands in `new-app/`. It is **not** retrofitted to `original-app/`, which is read-only
   from the start of the audit (Rule 1.2).

## Alternatives considered

**`BigInt` all the way through to the domain.** Prisma's `BigInt` yields a JavaScript `bigint`
in the client, which is the most literally correct option. Rejected: `bigint` does not
serialise to JSON, does not mix with `number` in arithmetic without explicit conversion, and
would touch every total, every zod schema and every rendering path — a large, risky change
that buys nothing, because the values in question are exactly representable as `number`
anyway. Converting once at the boundary gets the storage width without the blast radius.

**`Decimal(13,2)` holding major units.** Rejected outright: it abandons integer minor units
(ADR 0003, Rule 3), and decimal arithmetic in JavaScript is where rounding defects come from.

**Keep 32-bit and scale the minor unit.** Rejected: it redefines what "cents" means per
currency and would silently misread every existing row.

**Widen only the document totals.** Rejected: a total is a sum of lines, so a line must be
able to hold what the total can. A mixed-width money model is a defect waiting for the one
column somebody forgot.

## Consequences

- Money is 64-bit in storage and `number` in the domain, with **one conversion point** that is
  the only place the ceiling is checked. That conversion point needs a test proved by planting
  a value above the ceiling and watching the refusal.
- The ceiling must be **stated in the UI where it bites**, not only enforced: a contractor
  typing a large contract value deserves to be told the limit, not to have the save refused.
- The ceiling is a **per-jurisdiction value** in the rule pack, not a global constant. Nine
  hundred million is the right order of magnitude for JMD; it is the wrong one for TTD or USD,
  where the same sum of money is a much smaller number. Rule 3 applies: this is data.
- Reporting and platform-wide aggregates sum many documents, so their intermediate totals can
  exceed a single document's ceiling. Those sums stay in `number` — the headroom to
  `MAX_SAFE_INTEGER` is about 90,000 documents at the maximum, and far more in practice — but
  any aggregate that could approach it needs its own explicit bound rather than an assumption.
- If a currency ever needs figures beyond `MAX_SAFE_INTEGER` in minor units, this decision is
  revisited rather than stretched. That is a deliberate boundary, recorded so the next reader
  does not trust it further than it earns.
