# `new-app/` — the rebuild

Empty on purpose. This is where the rebuilt layers land.

The owner chose **selective rebuild** (option C of `docs/PHASE-0-AUDIT.md` §7, recorded as
ADR 0010): the layers the audit condemned are rebuilt here, and the layers it found sound are
**ported deliberately** — reviewed and adapted as they arrive, never copied wholesale from
`original-app/`.

## Rebuilt here

- Tenancy enforcement: `tenant_id` + Postgres row-level security + request-scoped application
  context, so a forgotten `where` clause cannot leak across tenants.
- The commercial layer: plans, entitlements and limits as data behind one resolver.
- Authentication: default-deny routes, MFA, short sessions with rotation and invalidation.
- Outbound messaging: one service, pluggable channels, delivery status, idempotency, consent.
- Mobile sync: an outbox, client-generated UUIDs, explicit per-entity conflict rules.
- The web/API contract, generated from one definition rather than hand-mirrored.
- Money as 64-bit minor units (ADR 0011) and day boundaries per jurisdiction.

## Ported after review

`packages/core`, `packages/test-ast` and its guard suite, the integration flow-test harness,
the issued-document snapshot design, and the domain knowledge in the schema. Each arrives as
its own reviewed change, not a bulk copy.

## Structure

Proposed in Phase 1 and recorded as an ADR before any code is written (Rule 1.1). The starting
point from the brief is `api/`, `web/`, `mobile/`, `db/`, `infra/`, plus a project context file
at this level for whoever — person or Claude — reads the code next.

This folder will be **its own npm-workspace root**, separate from `original-app/`.
