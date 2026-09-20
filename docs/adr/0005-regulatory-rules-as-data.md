# 0005 — Country rules are a versioned rule pack (data), never branches in logic

**Status:** Accepted (2026-08, reinforced 2026-09-20 for multi-country)

## Context
GCT, NHT, NIS, education tax, taxpayer-id formats, parish lists and document requirements
are Jamaican specifics that change by statute and differ in every other market. Trinidad &
Tobago has VAT, its own registration rules and its own currency. A codebase that encodes
Jamaica in `if` statements cannot be maintained by someone in another market, and cannot be
audited when a rate changes.

## Decision
Country behaviour is data: a static baseline per country in
`packages/core/src/jurisdiction/`, with admin-editable overrides in `RulePackConfig`, one
row per ISO 3166-1 alpha-2 country code. Product code asks the rule pack; it never tests a
country code. A document records the rates it used, so a later rate change cannot rewrite
history.

## Alternatives considered
- **A country module per market with code branches.** Rejected: it moves the `if` rather
  than removing it, and a support engineer could not change a rate without a deploy.
- **Rates in the database only.** Rejected: a missing row would leave a tenant with no rules
  at all. The static baseline is the floor; the database holds overrides.

## Consequences
- Adding a country is a rule pack plus verification data, with no change to the code path.
- Every statutory value needs an admin surface and an audit entry. That exists for Jamaica
  and is the pattern for the next country.
- The rule pack is a contract inside the codebase: renaming a field there is a data
  migration, not just a type change.
