# 0015 — Credentials live outside row-level security, and tenants sign themselves up free

**Date:** 2026-09-23
**Status:** Accepted
**Relates to:** ADR 0013 (sessions), ADR 0014 (hashing), ADR 0007 (tiers), Rules 4, 5, 13, 14

## Context

Two questions had to be answered to build sign-in, and the second was set by the owner
mid-build: **how does a tenant get an account in the first place?**

**The technical problem.** Sign-in must find a user *by email* before any tenant is known. Every
tenant-owned table is behind row-level security requiring `app.tenant_id`, so the lookup that
*starts* authentication cannot read `app_user` at all. This is the same boundary `app_session`
hit in ADR 0013.

**The product decision.** Tenants register themselves on the website, on the Free tier, with no
intervention from us, and upgrade when they choose. That makes registration an
**unauthenticated, public, abusable endpoint that creates a tenant** — a very different thing
from an admin creating accounts.

## Decision

### 1. Credentials get their own table, outside row-level security

`app_credential` holds the email, the password hash, the user id and the tenant id. It is the
**second and last** RLS exemption. Both exemptions are authentication bootstrap; both are named
with their reasons in `db/test/policy-parity.test.ts`, which also fails if an exempted table
stops existing, so a third cannot appear quietly.

What makes the exemption safe is the order of operations, identical to ADR 0013's: the tenant id
comes from **our own store**, and every read after it — including the user's own role and status
— happens under row-level security with that tenant set. A forged lookup buys one thin row.

**`app_user` no longer holds a password hash at all.** That is a benefit worth naming: the row
every module reads cannot leak a credential through a widened `SELECT`, because there is nothing
there to leak.

### 2. The sign-in email is globally unique

`app_credential.email` has a global unique index; `app_user.email` keeps its per-tenant unique
for display. So one address signs in to exactly one business.

**The cost, stated plainly:** a person who genuinely works for two contracting businesses needs
two addresses. Accepting that is a deliberate trade against the alternative — a "which business
do you mean?" step on every sign-in, or verifying a password against several candidate rows,
which leaks by construction.

### 3. Registration is self-service, free, and unauthenticated

- **Anyone can create a tenant on the Free tier from the website.** No approval, no sales call.
  Free is what makes the product spread (ADR 0007).
- Registration creates, in one transaction: the tenant, its first user as `owner`, that user's
  credential, and a **Free subscription**. A tenant is never in a state where it exists without
  a plan.
- **Upgrading is self-service when paid by card**, and entitlements change when the payment
  succeeds.
- **A manual payment does not upgrade anybody by itself.** It is recorded, approved by someone
  other than the activator, and verified against the bank record (Rule 13). The self-service
  path and the manual path meet at the same entitlement change; only the card path is automatic.
- **Registration must not confirm whether an email is already registered.** Because the email is
  globally unique, the naive implementation answers "that email is taken", which is an account
  enumeration oracle and also leaks that a competitor uses the product. So a duplicate
  registration responds exactly as a new one and **sends an email to the existing address**
  telling its owner someone tried. The honest answer goes to the person who owns the address,
  not to whoever typed it.

## Alternatives considered

**Keep the hash on `app_user` and give sign-in a privileged role that bypasses RLS.** Rejected:
a connection that can bypass the isolation rule is a connection every future bug can bypass it
through. The exemption is one thin table, not a superuser.

**Global email uniqueness on `app_user` instead of a separate table.** Rejected: it would make
the sign-up conflict visible on the table every module reads, and would still leave the password
hash where reporting queries can reach it.

**Invitation-only or approved registration.** Safer against abuse, and the easier thing to
build. Rejected: it contradicts the Free tier's purpose. A contractor who has to wait for
approval is a contractor who never comes back.

**Free trial of the paid tier rather than a permanent Free tier.** Rejected here because ADR 0007
already settled it: Free stays genuinely useful, and invoicing is the Pro line.

## Consequences

- **Registration is an unauthenticated endpoint that writes rows, so it needs defences that do
  not exist yet**, and they are owed before launch rather than after: rate limiting per IP and
  per email, email verification before the account does anything that costs us money (sending
  mail, generating documents), a bound on tenants created per address, and abuse monitoring.
  This is now the largest open item in the sign-up path, and it is recorded here rather than
  discovered later.
- Sign-in costs ~67 MB and ~150 ms by design (ADR 0014). On an unauthenticated endpoint that is
  a denial-of-service lever, which makes **rate limiting on sign-in mandatory, not optional**.
- The duplicate-registration rule means registration **depends on outbound email**, so the
  messaging service has to exist before sign-up ships, or the endpoint leaks by omission.
- Self-service upgrade needs the entitlement resolver (ADR 0007, Rule 14) to be the only thing
  gating features, so a plan change takes effect without a deploy.
- `app_user.email` and `app_credential.email` can drift apart. They are written together and
  should stay equal; a guard asserting that is owed.
