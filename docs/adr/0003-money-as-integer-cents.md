# 0003 — Money is integer minor units plus a currency code

**Status:** Accepted (2026-07, recorded 2026-09-20)

## Context
Quotes run to millions of Jamaican dollars, tax applies per line and per document, and the
same total is computed on three surfaces. Floating point loses cents; strings invite
hand-formatting.

## Decision
Every amount is an integer number of minor units in a `...Cents` field, carried with a
currency code. Formatting happens only in `packages/core`. Percentages are `...Pct` on a
0–100 scale. Rounding is half-up per line, then applied to the document — stated once in
core and never re-implemented.

## Alternatives considered
- **Decimal columns for money.** Rejected: Prisma surfaces `Decimal` as a string-like object
  that gets `Number()`-ed at the edges, which is exactly where precision was lost before.
  Decimals remain for quantities and percentages, where the column's scale is the rule.
- **A money library.** Rejected for now: the value is in having one shared rule, not in a
  dependency, and a library would still need the same discipline about where formatting
  lives.

## Consequences
- Cents columns are 32-bit `Int`, so every cents input is capped at 2,147,483,647 and a
  larger figure is refused by name rather than failing at the database.
- Any hand-built amount string is a defect, and a guard looks for them.
- A second currency needs no schema change: the amount is minor units, and the code says
  which currency.
