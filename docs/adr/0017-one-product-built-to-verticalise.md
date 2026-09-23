# 0017 — One product, built to verticalise: trade behaviour is data, not code

**Date:** 2026-09-24
**Status:** Accepted
**Decided by:** the owner, answering the brief's §5 product-scope question
**Relates to:** ADR 0005 (country rules as data), ADR 0007 (tiers), Rule 3, Rule 19

## Context

The brief requires the owner to decide product scope before Phase 1, choosing between one product
as scoped, a second product with a different feature set, or full integration. The Phase 0 audit
recommended one product: all 34 inventory items serve a single story, and there was no second
feature set hiding in the code.

The owner chose **one product, built to verticalise later** — the recommendation with a constraint
attached, and the constraint is the decision. Plain "one product" would have permitted the build to
hard-code construction into names, tables and logic, and a second trade would then have required a
second codebase. The option would have been spent without anyone deciding to spend it.

The parallel is exact and already proven here. The audit found the previous application's
**country** behaviour was already data — a jurisdiction rule pack, no `if (country === "JM")` — and
that this is why Trinidad & Tobago is configuration rather than a project. **Trade** now gets the
same treatment.

## Decision

**One product.** Quoting, invoicing, payment and job profit for contractors. No second product is
planned, and the tier ladder in ADR 0007 is unchanged: Free, Pro, Business, invoicing at Pro, team
features at Business.

**Trade-specific behaviour is a trade pack — data, resolved per tenant, alongside the jurisdiction
rule pack.** What belongs in it:

| In the trade pack | Why it varies by trade |
|---|---|
| Unit vocabulary and their labels | A builder buys by the bag and the sheet; an electrician by the metre and the drum |
| Material categories and their attributes | "Thickness" and "coverage per unit" mean nothing to a plumber pricing fittings |
| The labour trade list and rate shapes | Day rates, hourly rates, per-point pricing |
| Default job recipes and starter catalog | What a new tenant sees on day one, and the fastest route to a first quote |
| Document wording and the default detail level | Some trades itemise for the client; some quote a single price and must not reveal margins |
| Quoting style | Itemised build-up versus a sized instant estimate from a few inputs |

**Product code never branches on a trade**, exactly as it never branches on a country (Rule 3). A
trade is a key into data.

**No entity, table, column or type is named for construction.** `Job`, `JobComponent`, `Quote`,
`Customer` are already trade-neutral; the pressure will come later, when a trade-specific field
looks harmless in a shared table. It is not harmless: it is the first branch.

**A trade pack is not a tier, and not a product.** It does not gate features, does not appear in
pricing, and does not create a second ladder. Construction is the first trade and the only one
populated; adding another is configuration plus content, not a release.

## Alternatives considered

**One product, construction hard-coded** (the simplest reading of the audit's recommendation).
Rejected by the owner's decision, and rightly: it is cheaper this week and forecloses the option.
The cost of keeping the option open is design discipline, not code — the boundaries are the same
boundaries the country work already needs.

**A second product sharing a core.** Rejected: it doubles product, marketing and support surface
for a market nobody has named, and the shared-core arrangement tends to become a coupling that
neither product can change.

**Integrate everything, widest possible feature set.** Rejected: it makes the product harder to
explain, and the audit had just recommended *dropping* a feature (the regulatory feed) on
maintenance-cost grounds.

**A plugin architecture for trades.** Rejected as premature. A rule pack of data is the
lightest thing that preserves the option; an extension mechanism with one implementation is
speculative design, and a pattern used once is a pattern to remove (Rule 2).

## Consequences

- **A `TradePack` abstraction is owed in `packages/core`**, beside the jurisdiction rule pack, with
  one populated pack (construction) and a guard that fails when product code branches on a trade —
  mirroring the existing rule that fails on a country branch. **A single populated pack proves
  nothing about extensibility**, so the honest test is to sketch a second pack's *data* during the
  catalog work, before committing to the shape.
- **Tenant onboarding gains a question:** which trade. That affects the sign-up flow already
  designed in ADR 0015, and a tenant must be able to change it early without losing data.
- **The catalog and job modules carry the most risk of leaking trade assumptions**, because that is
  where units, attributes and recipes live. They are where the guard matters most.
- **The PRD must be written in trade-neutral language**, with construction as the worked example.
  Writing it as "a construction quoting product" would undo this decision in prose and then in code.
- Slightly more indirection now, for readers and for me: one extra lookup between "this tenant" and
  "this unit label". Rule 2 applies — the indirection must be obvious and commented, not clever.
- **The option can still be lost quietly.** Nothing stops a future change from putting a
  construction-only column in a shared table with a plausible justification. The guard is the
  control; this ADR is the reason it exists.
