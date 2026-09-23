# 0013 — Default-deny routes, identity re-resolved per request, and revocable sessions

**Date:** 2026-09-23
**Status:** Accepted
**Answers:** Phase 0 audit findings 7, 8 and 9, and Rule 5

## Context

The audit found four connected weaknesses in the previous application's authentication:

1. **Authorisation was opt-in per controller.** A route written without a guard was
   unguarded, looked normal, and nothing in the gate failed. The question "is this endpoint
   protected?" could only be answered by reading every controller and noticing an absence.
2. **A 30-day session with no rotation and no way to invalidate a live one** short of
   suspending the whole tenant.
3. **No second factor anywhere**, including the admin console that can impersonate tenants.
4. Three kinds of route existed in practice — authenticated, share-token addressed, and
   genuinely public — and **none of them were named**, so the third kept being confused with
   the second.

## Decision

**1. Protection is declared, and the default is refusal.** Three decorators, and exactly
three: `@Authenticated()`, `@ShareTokenRoute()`, `@PublicRoute(reason)`. A global
`DefaultDenyGuard` refuses any route that declares nothing, logging the route by name.
`route-protection-coverage.test.ts` refuses it at build time as well, and prints the full
route inventory with its protection on every run — so reviewing every public surface is a
glance, not an audit.

**2. `@PublicRoute` requires a reason of at least ten characters**, validated at
class-definition time so a rubber stamp fails on import rather than on the first request. A
health probe and a payment-gateway callback are both public for entirely different reasons,
and only one of them is safe without a signature check.

**3. The guard decides access, not business rules.** It answers "is this route declared, and
is there a live caller?" and attaches the caller to the request. Roles, capabilities and
entitlements are separate questions for `core/entitlements` and each module — a guard that
knew every business rule would become where every rule ended up.

**4. Identity is re-resolved from the database on every request.** The token carries a session
id and a version; the role, the tenant's status and the user's status are read fresh. A
demotion, a deactivation or a suspension therefore bites on the next request rather than in up
to thirty days.

**5. Sessions are revocable through a version counter.** `app_user.session_version` is
compared against the version the session was issued at. Bumping it — on password change,
sign-out-everywhere, or suspected compromise — invalidates every token already in the wild,
with no blacklist to maintain and nothing to expire. `app_session` also carries a short
`expires_at` and a `revoked_at`, and is revoked rather than deleted.

**6. Every refusal tells the caller the same sentence** ("Please sign in again"). The specific
reason — unknown session, superseded, deactivated, tenant suspended — goes to the log and the
audit trail. Distinguishing them in a response hands anyone holding a discarded token facts
about an account they no longer have access to.

**7. `app_session` is the one table outside row-level security, and the exemption is
structural.** Authentication happens before any tenant is known, so a policy requiring
`app.tenant_id` would make the table unreadable exactly when it is needed. Four things keep
that safe, and they only make sense together:

- the tenant id comes from **our own session store**, never from a caller — this is the single
  point at which a tenant id enters a request;
- **everything after** that read, including the user's own role, happens under row-level
  security with the tenant this row supplied, so a forged session id buys one thin row and
  nothing more;
- the row is deliberately thin — ids, a version, timestamps; no name, email or document;
- the exemption is **named with its reason** in `db/test/policy-parity.test.ts`, which also
  fails if the exempted table stops existing, so a second table cannot join it quietly.

## Alternatives considered

**A guard per controller, as before.** Conventional in NestJS and less machinery. Rejected:
this is the audit finding, and its failure mode is silence.

**Allow undeclared routes and rely on the build-time guard alone.** Rejected: the build-time
guard cannot see a route added by middleware or a raw handler, and "the test will catch it" is
not a control at runtime. Both layers, so forgetting produces a broken route rather than an
open one.

**Stateless JWTs carrying role and tenant, with a short expiry instead of a lookup.** The
standard answer, and it saves one indexed query per request. Rejected: it cannot revoke, and
"short expiry" means a demoted user keeps their old powers for the length of that window.
Correctness here is worth one query.

**A token blacklist for revocation.** Rejected: it grows forever, needs its own expiry
policy, and fails open if the store is unavailable. A version integer on the user cannot fail
open.

**A second factor now.** Rejected *for this step*, not for the product — it needs enrolment,
recovery codes and a sign-in flow, none of which exist yet. It is owed before the first
tenant, and mandatory for our own staff (Rule 5).

## Consequences

- One indexed query per authenticated request. Accepted deliberately; it is the price of
  revocation and of a role that is current.
- **Sign-in does not exist yet**, so nothing issues sessions: the tests insert session rows
  directly. Token format, cookie handling and rotation-on-use are the next step, behind the
  `SessionReader` port so nothing above it changes.
- **Password hashing is not decided here.** It arrives with sign-in, and the choice (argon2id
  versus Node's built-in scrypt) is its own ADR, because a native dependency affects every
  deployment target.
- **MFA is still absent**, and remains the largest open gap in Rule 5. It is now cheap to add:
  a factor check sits in the resolver's step 4, and a bumped `session_version` forces
  re-authentication.
- `DefaultDenyGuard` must be registered globally when the application module lands. Until
  then, global registration is asserted by review, and the guard's test says so explicitly —
  an unregistered global guard would make every one of those tests meaningless in production.
- Ports rather than concrete classes (`CallerResolver`, `SessionReader`, `ProtectionReader`)
  mean the guard's tests need no database and no Nest container, while the resolver's tests run
  against real Postgres. Each layer is tested where the truth lives.
