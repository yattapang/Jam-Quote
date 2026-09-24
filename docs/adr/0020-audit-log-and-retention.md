# 0020 — The audit log, append-only by policy, kept for seven years

**Date:** 2026-09-24
**Status:** Accepted
**Design:** `docs/design/audit-log.md` (approved by the owner, 2026-09-24, with retention delegated
to my recommendation and open to revision)
**Closes:** the second of the three Foundations gaps (brief §18 step 1)

## Context

Every staff safeguard in Rule 5.1 — least privilege, re-authentication, same-day offboarding — is
**preventive**, and preventive controls fail silently. The threat model (§4.4) puts it plainly:
without a trail, none of those controls can be *detected*, only intended. That is why this came
before staff MFA rather than after it.

## Decision

**1. Append-only, enforced by the absence of a policy — not by grants.**

The design proposed withholding `UPDATE` and `DELETE` grants from the application role. That works
and has a weakness: it lives with whoever provisions the role, outside the repository, so a
permissive `GRANT ALL` in an ops script silently removes the control.

So it is enforced in the migration instead. With `FORCE ROW LEVEL SECURITY` and policies for
`SELECT` and `INSERT` only, Postgres refuses `UPDATE` and `DELETE` **even to a role that holds the
grant**, because no policy permits those commands. The test asserts the grant is present and then
shows the command still fails — a stronger claim than a test that passes only because the grant was
withheld. Grants remain a sensible second layer; the control does not depend on them.

**2. `record(tx, entry)` takes the transaction.** An entry written outside the transaction that
made the change produces one of two lies — a change with no entry, or an entry for a change that
rolled back — and both are worse than no trail, because both are trusted during an incident.

**3. `tenant_id` is NOT NULL.** A staff action against a tenant carries that tenant's id, which is
exactly the set Rule 5.1 says the tenant should see, so the ordinary tenant policy lets a tenant
read what we did to them with no special case. Tenant-less staff actions need
`platform_audit_entry`, deliberately not built: with no admin console it would be a table nothing
writes to, and Rule 8 calls a control with no subject worse than none.

**4. `details` is redacted by the writer, and a guard refuses credentials** — nested, because the
realistic mistake is `details: { user: requestBody }` where the body still holds a password.

**5. Retention: seven years, and nothing is deleted before then.**

The owner delegated this with the condition that it can change later. One number, not three:

- **Why seven years.** The trail describes money and permission changes, so it should outlive the
  documents it describes. Business record-keeping obligations in Jamaica are commonly stated as six
  to seven years; seven clears that without needing the exact figure to be right, and it is simple
  enough to honour. **This is not legal advice** — an accountant should confirm it, and the number
  is a rule-pack value per jurisdiction rather than a constant, because Trinidad & Tobago may
  differ.
- **Why not shorter.** A short policy destroys the evidence the trail exists for, and the incident
  that needs it is always older than expected.
- **Why not forever.** A trail nobody can ever delete accumulates personal data (`actor_ip`) with
  no end, which is the opposite of a defensible privacy position.
- **Deletion, when it comes, is the one legitimate exception** to append-only: a scheduled
  maintenance job, running as an identity that is *not* the application role, which **records its
  own entry naming what it is about to remove, before removing it**. Never an `UPDATE` grant to the
  application, and never a manual `DELETE`.
- **Tenant deletion does not delete the trail.** A closed account's history is what we would need
  to defend ourselves, and the privacy notice says so.

**The job does not exist yet**, and that is recorded rather than implied: rows accumulate until it
is built. At current volumes that is measured in kilobytes a month, so the order is deliberate —
the policy first, the mechanism when there is something to prune.

## Alternatives considered

**Grants as the enforcement.** Rejected as the *primary* control, kept as a second layer: it lives
outside the repository, where a change cannot be reviewed alongside the code it protects.

**A trigger raising an exception on UPDATE.** Equivalent protection and more machinery: a trigger is
code that can be disabled, and `ALTER TABLE … DISABLE TRIGGER` is a smaller step than adding a
policy. The absence of a policy is harder to remove by accident.

**Two tables from the start** (tenant trail and platform trail). Rejected for now: the platform one
would have no writer, and a double write for impersonation is complexity bought before it is needed.

**Typed columns instead of `details` JSONB.** Checkable, at the cost of a column per action type.
The typed `AuditAction` union plus the writer's tests are where shape is pinned instead.

**Storing no IP address.** Simpler and more private. Rejected: after a compromise, "which address
did this come from" is the question, and it cannot be reconstructed afterwards. The cost is a real
obligation — see below.

## Consequences

- **The privacy notice had to change in the same commit.** `actor_ip` is personal data and
  `content/legal.ts` did not mention IP addresses, so shipping the table without the notice would
  have made the notice untrue — which the site's own guards exist to prevent. Retention is named
  there too, because "we keep this for seven years" is exactly what a person is entitled to know.
- **The policy-parity guard learned a stricter rule, not a looser one.** Its default requirement is
  that a policy applies to ALL commands, so a SELECT-only policy cannot leave writes unguarded. An
  append-only table inverts that deliberately, so those tables are now required to have *exactly* a
  canonical SELECT and a canonical INSERT and nothing else — a policy for ALL, UPDATE or DELETE
  appearing on one is now a failure.
- **`audit_entry` is exempt from the row convention** (ADR 0019): a `version` column would describe
  edits that cannot happen, and a tombstone would be a soft delete the application is forbidden to
  perform. Named in the guard with that reason.
- **A mistaken entry can never be corrected, only supplemented** by a later one. Correct for a
  trail; it would be intolerable anywhere else.
- **Owed, and stated rather than implied:** `platform_audit_entry`; capability-gated read redaction
  (the Phase 0 lesson that staff should not all see money figures); the retention job; a guard that
  every audited action actually calls `record()` — which cannot exist until there are modules
  performing those actions; and any read route, since there is no HTTP surface for the trail.

## What building it found

**A defect in `core/tenancy`, and it would have been total.** `assertTenantId` carried its own regex
requiring UUID version 1–5, written before ADR 0019 chose v7. The moment ids became v7, `withTenant`
would have refused **every genuine tenant id** — every request, every test. It surfaced only because
the audit tests used realistic v7 ids instead of hand-written v4 fixtures.

The fix is the rule that was already written down: one definition, one place (Rule 7). `@pryvis/core`
now exports `isUuid` ("a uuid we can hold", v1–v8) beside `isRowId` ("a uuid we made", v7 only), and
tenancy imports the first. Two copies of a rule diverge at exactly the moment one of them changes.
