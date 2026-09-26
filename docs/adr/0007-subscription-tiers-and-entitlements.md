# 0007 — Tiers are data; entitlements are enforced server-side and grandfathered per tenant

**Status:** Accepted (2026-09-20). This is the design for the first feature to ship under
the one-feature-at-a-time rule.

## Context
Today "paid" means one boolean: `Subscription.plan` is `free` or `pro`, and the only limit
in the product is `PricingConfig.freeQuotesPerMonth`, counted in the quotes service. The
owner wants three tiers (Free, Pro, Business) with features grouped per tier, features
released one at a time, and prices that will differ by country as the product leaves
Jamaica. Existing users must not lose a feature they already use when it becomes paid.

Two failure modes are already visible in this codebase and must not be repeated:
- a rule copied into a second place drifts (ADR 0004);
- a limit enforced only in the UI is not a limit.

## Decision

**1. A feature is a named entitlement, not a plan check.** Product code asks
`can(business, "invoice.send")`, never `if (plan === "pro")`. Adding a tier, or moving a
feature between tiers, then changes data — not call sites.

**2. Tier definitions live in core, prices in the database.**
- `packages/core/src/billing/entitlements.ts` holds the baseline: the tier ladder, which
  entitlements each tier grants, and each numeric limit. It is the floor, so a missing
  database row can never leave a tenant with no rules (same shape as the rule pack, ADR
  0005).
- Per-country prices and any commercial override live in a `PlanTierConfig` table keyed by
  `(countryCode, tierCode)`, admin-editable and audited, like `RulePackConfig`.

**3. Entitlements are enforced on the server, at the boundary.** One
`EntitlementsService` resolves a tenant's effective entitlements and asserts them in the
API. The web app reads the same resolved set to decide what to show and to explain what an
upgrade unlocks — as an additional surface, never as the only check.

**4. Limits are counted from the data, not from a counter column.** The monthly quote
allowance is already derived by counting quotes in the tenant's Jamaica month; a stored
counter would be a second source of truth to drift (ADR 0004). Where a limit is a state
rather than a rate — for example the number of users — it is counted at the moment of the
write.

**5. Grandfathering is explicit and per tenant.** A `BusinessEntitlementGrant` row
(`businessId`, `feature`, `grantedAt`, `grantedBy`, `reason`) adds an entitlement the
tenant's tier does not include. A tenant's effective set is *tier ∪ grants*. Grants are
audited and visible in the admin console, so "why can this tenant do that?" has an answer.

**6. Every refusal is a sales conversation, not an error.** An entitlement refusal returns
the feature, the tier that includes it, and plain wording ("Recording payments is on Pro").
The web app shows that, so the contractor learns what to buy rather than meeting a wall.

## Alternatives considered
- **Keep checking `plan` at each call site.** Rejected: it is the `if (country === "JM")`
  mistake in another costume, and every new tier would mean touching every call site.
- **Tier definitions in the database only.** Rejected: an empty or half-migrated table
  would silently entitle everyone, or no one. The core baseline is the floor.
- **A feature-flag service (LaunchDarkly and friends).** Rejected for now: entitlements are
  billing state that must be auditable and work offline in the mobile app, and an external
  flag service adds a network dependency to a rule that decides whether a contractor can
  send an invoice.
- **Enforcement in the web app only, with the API permissive.** Rejected: the API is the
  product's only real boundary; the mobile app and any future integration bypass the web
  entirely.

## Consequences
- The quote allowance moves from a bare `freeQuotesPerMonth` read to the entitlement
  resolver. `PricingConfig.freeQuotesPerMonth` becomes the Free tier's limit in
  `PlanTierConfig`, with a migration that carries today's value forward so no tenant's
  behaviour changes on deploy.
- Tier and grant changes are audited, and the audit details are financial, so they are
  redacted from admins without the financial capability (matching the existing rule).
- The mobile app must cache the resolved entitlement set to keep working offline, and treat
  the server's answer as authoritative on sync.
- Tests: a flow per tier boundary (a Free tenant refused at the limit, a grant letting one
  tenant through, a Business feature refused on Pro), and a guard that no product code
  compares `plan` to a literal.
