# Architecture decision log

One short record per structural choice, numbered in the order the decision was taken.
Format: **Context → Decision → Alternatives considered → Consequences**, including the
consequences we dislike.

Write an ADR when a choice is expensive to reverse: a datastore, a framework, a
cross-cutting pattern, the tenancy or country model, the billing model, the brand. Do not
write one for an ordinary bug fix — that belongs in `REVIEW-FINDINGS.md`.

Rules that follow from these decisions are in `docs/BUILD-RULES.md`. Owner decisions on
product questions are in `PLANNING.md`'s decisions table.

| # | Decision | Status |
|---|---|---|
| [0001](0001-monorepo-and-stack.md) | npm-workspaces monorepo, TypeScript everywhere, NestJS + Next.js + Expo | Accepted |
| [0002](0002-postgres-and-prisma.md) | Postgres via Prisma, migrations checked in, no database enums | Accepted |
| [0003](0003-money-as-integer-cents.md) | Money is integer minor units plus a currency code | Accepted |
| [0004](0004-shared-rules-in-core.md) | Every money, tax and settlement rule lives once in `packages/core` | Accepted |
| [0005](0005-regulatory-rules-as-data.md) | Country rules are a versioned rule pack (data), never branches in logic | Accepted |
| [0006](0006-tenant-and-country-aware-model.md) | Every row is tenant-scoped; country behaviour resolves per business | Accepted |
| [0007](0007-subscription-tiers-and-entitlements.md) | Tiers are data; entitlements are enforced server-side and grandfathered per tenant | Accepted |
| [0008](0008-guards-and-flow-tests.md) | Defect classes are held by parser-based guards and real-database flow tests | Accepted |
| [0009](0009-brand-pryvis.md) | The product is **Pryvis** (pryvis.com); JamQuote was the working name | Accepted |
| [0010](0010-selective-rebuild-and-repo-layout.md) | Rebuild selectively; the repo splits into `original-app/` and `new-app/`, each its own workspace root | Accepted |
| [0011](0011-money-ceiling-64-bit-minor-units.md) | Money columns are 64-bit; the ceiling is 999,999,999.99, validated at the boundary | Accepted |
| [0012](0012-new-app-structure.md) | `new-app/` layout: modules behind a public surface, schema in `db/`, generated contract, `@pryvis/*` | Accepted |
| [0013](0013-default-deny-auth-and-session-revocation.md) | Routes declare their protection and default to refusal; identity re-resolved per request; sessions revocable by version | Accepted |
| [0014](0014-password-hashing.md) | Passwords hashed with Node's scrypt, parameters stored in the hash, rehash on successful sign-in | Accepted |
| [0015](0015-credentials-and-self-service-signup.md) | Credentials in their own table outside RLS; sign-in email globally unique; tenants sign themselves up free and upgrade by card | Accepted |
| [0016](0016-rate-limiting.md) | Token buckets in Postgres, per IP and per hashed email, checked before the expensive hash | Accepted |
| [0017](0017-one-product-built-to-verticalise.md) | One product; trade behaviour is a data pack, never a branch in product code | Accepted |
| [0018](0018-marketing-website.md) | The marketing site is static pages in our own Next.js app on free hosting — not a site builder | Accepted |
| [0019](0019-row-identity-and-versioning.md) | Client-generated UUIDv7 ids, a `version` compared on write, tombstones with partial indexes | Accepted |
| [0020](0020-audit-log-and-retention.md) | The audit log is append-only by the absence of a policy, atomic with its change, kept seven years | Accepted |
| [0021](0021-staff-second-factor.md) | A second factor: TOTP written against the RFC vectors, secrets sealed with a rotatable key, required of staff and enforced in the resolver | Accepted |
| [0022](0022-one-tenant-per-user-and-no-client-logins.md) | One tenant per user with one email each, so global email uniqueness enforces the owner's rule; a tenant's clients have no login and meet us through a scoped share link | Accepted |
