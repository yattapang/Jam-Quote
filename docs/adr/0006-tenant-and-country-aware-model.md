# 0006 — Every row is tenant-scoped; country behaviour resolves per business

**Status:** Accepted (2026-07, reinforced 2026-09-20)

## Context
One deployment serves many contractors, and will serve several countries. The defects that
cost most here have all been tenancy or country assumptions: an id from a request body used
as a scope, a supplier from another tenant copied onto a quote, a date computed in the
server's timezone rather than Jamaica's.

## Decision
- Every tenant-owned row carries `businessId`, and reads and writes are scoped by the
  authenticated context, never by an id in the request body.
- A caller-supplied id is ownership-checked before it is stored, and a foreign id is
  indistinguishable from one that does not exist.
- `Business.countryCode` selects the rule pack. `Business.currency` is the tenant's own
  currency, separate from the platform's billing currency.
- Day boundaries and calendar arithmetic use an explicit zone — today Jamaica's — and become
  per-country when the second country ships.

## Alternatives considered
- **A database per tenant.** Rejected at this scale: migrations and platform-wide reporting
  get expensive, and the audit surface multiplies.
- **A country column only on documents.** Rejected: the rules apply to the business, and a
  document must record what was applied rather than re-deriving it later.

## Consequences
- Public, token-addressed pages project exactly one document, so they keep their own narrow
  read path.
- Tenancy is tested as a flow, with a second tenant attempting every id-taking method.
- Timezone is a known gap for country two: it is Jamaica-wide today and must become a
  rule-pack value.
