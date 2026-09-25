# 0010 — Selective rebuild, and the repository split into `original-app/` and `new-app/`

**Date:** 2026-09-23
**Status:** Accepted
**Decided by:** the owner, on the evidence in `docs/PHASE-0-AUDIT.md` §7

## Context

The development brief presumed a full rebuild in `new-app/`. The Phase 0 audit found the
picture to be two-sided:

- **Sound:** money as integer minor units with no float in the money path; issued documents as
  genuine frozen snapshots; every shared rule spent once in `packages/core` with a guard that
  fails when one is restated; per-tenant currency already separate from platform billing
  currency; 2,602 unit tests and 39 cross-section flow tests against a real Postgres, each
  proved by planting the defect it catches.
- **Missing or thin:** no row-level security at all — application scoping is the only barrier
  between tenants; no entitlement layer, so `plan` is a two-value string with one numeric
  limit; no MFA anywhere, including the admin console that can impersonate tenants; 30-day
  sessions with no rotation or invalidation; authorisation opt-in per controller rather than
  default-deny; no approver/activator separation on manual payments; no outbound messaging
  service; `sync` unreviewed and untested at its seam; no support capability.

The gaps are in the **commercial** and **defensive** layers. The **domain** layer is the part
that was expensive to learn and is well tested.

There are no live tenants, so the usual reason a rebuild fails — migrating customers — does
not apply. But the usual reason a rebuild disappoints does: the replacement re-learns the
defects the original already survived, and the tests that made the original trustworthy do not
come with it.

## Decision

**Rebuild selectively.** Rebuild in `new-app/` exactly the layers the audit condemned:

1. Tenancy enforcement — `tenant_id` + Postgres row-level security + request-scoped
   application context.
2. The commercial layer — plans, entitlements and limits as data behind one resolver.
3. Authentication — default-deny routes, MFA, short sessions with rotation and invalidation.
4. Outbound messaging — one service, pluggable channels, delivery status, idempotency,
   consent.
5. Mobile sync — outbox, client-generated UUIDs, explicit per-entity conflict rules.
6. The web/API contract — generated from one definition instead of hand-mirrored.
7. Money as 64-bit minor units (ADR 0011) and day boundaries per jurisdiction.

**Port the rest deliberately:** `packages/core`, `packages/test-ast` and the guard suite, the
flow-test harness, the snapshot design, and the schema's domain knowledge. Each arrives as its
own reviewed change. Nothing is copied wholesale.

**Repository layout.** The existing application moved into `original-app/` by tracked `git mv`,
in one commit, so history survives as renames. `new-app/` and `docs/` sit beside it.

`original-app/` is **its own npm-workspace root** — it owns `package.json`,
`package-lock.json`, `turbo.json` and `tsconfig.base.json` — and `new-app/` will own its own.
Two workspace roots, one repository.

## Alternatives considered

**Full rebuild (option A).** Every structural gap is cheapest designed in from the first
commit, and there are no tenants to migrate. Rejected because it discards a working product
with 2,602 passing tests and 48 migrations of learned domain detail, to re-derive the same
domain rules less well tested.

**Evolve in place (option B).** Cheapest in the short term and the foundations are already
right. Rejected because RLS and default-deny authorisation are retrofits touching every table
and every controller, and retrofitted isolation is the kind of change that is 95% done and
therefore not done.

**One workspace root for both apps.** Simpler today: one `npm install`, one lockfile. Rejected
because the two applications will want different versions of the same dependencies, and a
shared lockfile makes every upgrade in one a risk to the other.

## Consequences

- The reorganisation is a 711-path rename commit. It shows as renames on GitHub, and the full
  gate was re-run from the new root before it landed: typecheck, lint, 7/7 turbo test tasks
  (2,602 tests) and the 39 integration flows, all green.
- **Deployment configuration changed in the same commit:** `render.yaml` gains
  `rootDir: original-app`, and the CI workflow runs every step with
  `working-directory: original-app` and caches against `original-app/package-lock.json`.
- **One change is not in the repository:** Vercel's **Root Directory** is a dashboard setting
  and must be repointed inside `original-app/` (to `original-app/apps/web`). Until the owner
  does that, the web deploy fails. This is called out in the reorganisation commit and in
  `original-app/README.md`.
- On Windows, npm writes `node_modules` workspace links as absolute junctions, so the move
  broke them and `npm install` had to recreate them. The lockfile content did not change.
- `original-app/` is read-only from now on (Rule 1.3) and excluded from Claude-proposed
  automation (Rule 15). It is deleted only on the owner's explicit confirmation, as its own
  commit.
- `new-app/`'s internal structure is still owed: it is proposed in Phase 1 and recorded as its
  own ADR before any code is written.
