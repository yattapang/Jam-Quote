# Design — the audit log

**Status: Proposed.** Awaiting the owner's approval (Rule 1.1). Nothing is built until then.

**Brief:** §18 step 1, Foundations — named there and missing. The second of the three gaps.
**Rules:** 4 (tenant isolation), 5 ("every money, permission or tenancy change is audited: who,
what, which tenant, when"), 5.1 (every staff action audited; **staff cannot edit or delete the
trail**), 6 (history), 2, 8.
**Threat model:** §4.4 — without this, none of the staff controls can be *detected*, only intended.
That is why it comes before staff MFA.

---

## 1. The problem

Three questions the system cannot currently answer:

1. **"Who changed this figure?"** A contractor disputes an invoice total, or a staff member changes
   a plan. Nothing records that it happened, so the answer is a guess.
2. **"Has anyone looked at my data?"** Rule 5.1 lets our staff impersonate a tenant. Without a
   trail, impersonation is invisible to the tenant and to us — and an invisible power is one that
   gets used casually.
3. **"What did the attacker do?"** After a compromise, the difference between "we know exactly
   which rows were touched" and "we are guessing" is whether this exists.

Detection is the point. Every staff safeguard in Rule 5.1 — least privilege, re-authentication,
same-day offboarding — is a *preventive* control, and preventive controls fail silently. An audit
trail is the only thing that notices.

## 2. What this must achieve

1. Every money, permission and tenancy change records **who, what, which tenant, when**.
2. **The application cannot alter or delete an entry.** Not "does not" — *cannot*, enforced by the
   database, because a trail the attacker can edit is a trail that will be edited.
3. An entry is **atomic with the change it describes**: no change without its entry, and no entry
   for a change that rolled back.
4. A tenant can see what was done **to their data, including by us**.
5. No credential, token or secret ever reaches an entry.
6. Reading the trail is tenant-isolated like everything else.

## 3. The shape

### 3.1 One table, tenant-scoped

```
audit_entry
  id            UUID PRIMARY KEY      -- newRowId(), ADR 0019
  tenant_id     UUID NOT NULL         -- the tenant whose data was affected
  occurred_at   TIMESTAMPTZ NOT NULL
  actor_kind    TEXT NOT NULL         -- 'tenant_user' | 'platform_staff' | 'system'
  actor_user_id UUID                  -- NULL for 'system'
  action        TEXT NOT NULL         -- 'invoice.voided', 'user.role_changed', 'tenant.suspended'
  subject_type  TEXT NOT NULL         -- 'invoice', 'app_user', 'tenant'
  subject_id    UUID                  -- NULL where the subject is the tenant itself
  summary       TEXT NOT NULL         -- one sentence a person can read
  details       JSONB NOT NULL        -- already redacted by the writer
  actor_ip      INET                  -- see §3.5
```

**`tenant_id` is NOT NULL, and that is a scoping decision.** Staff actions *against a tenant*
(impersonation, a plan change, a suspension) carry that tenant's id — which is exactly the set
Rule 5.1 says the tenant should be able to see. Row-level security then does the isolation with the
same canonical policy as every other table, and a tenant reading its own trail sees staff actions
against it without any special case.

**Staff actions with no tenant** — a staff sign-in, a change to global pricing — have nowhere to go
here. They need a separate `platform_audit_entry` with no tenant and its own capability-gated read
path, and it is **deliberately not built now**: there is no admin console, so it would be a table
nothing writes to, and Rule 8 calls a control with no subject worse than none. Recorded as owed, to
land with the console.

### 3.2 Append-only, enforced by the database

Two layers, because the second is the one that survives a bug in the first:

1. **Grants.** The application role gets `SELECT, INSERT` on `audit_entry` and **not**
   `UPDATE, DELETE`. It physically cannot rewrite history, whatever the code says.
2. **Policies.** The canonical tenant policy for `SELECT` and `INSERT`; no policy permits `UPDATE`
   or `DELETE`, so even a role that regained the grant is refused.

This makes the `test-support` harness's blanket `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL
TABLES` wrong for this table — so the harness changes to grant per table, and the test asserts the
application role's `UPDATE` and `DELETE` are refused. **If that test can be made to pass by
changing only the harness, the control is theatre**, which is why it checks the grant itself rather
than only the behaviour.

### 3.3 Atomic with the change

`record(tx, entry)` takes the **transaction**, not a client. An audit entry written outside the
transaction that made the change produces one of two lies: a change with no entry (the write
committed, the entry failed) or an entry for a change that never happened (the entry committed, the
change rolled back). Both are worse than no trail, because both are trusted.

So the signature forces it, and the test rolls a transaction back and asserts the entry is gone
with it.

### 3.4 What must never be in `details`

A guard over the payload: no key matching `password`, `secret`, `token`, `hash`, `credential`,
`otp`, `mfa`, or a value that looks like our session or credential material. The audit trail is the
one table read by humans during an incident, and it is the last place a credential should be sitting.

Phase 0's lesson also applies: the old application's audit details held money figures readable by
any staff role, and had to be given redact-by-default. Here **the writer redacts**, and a
capability-gated read path is owed with the console. Recorded rather than half-built.

### 3.5 `actor_ip`, and the privacy consequence

An IP address is personal data. It is included because after a compromise "which address did this
come from" is the question, and it cannot be reconstructed later.

That has a consequence this design will not skip: **the privacy notice must say we keep it, and
why.** `content/legal.ts` currently does not mention IP addresses, so shipping this without
updating it would make the notice untrue — which the site's own guards exist to prevent. The
notice change is part of this work, not a follow-up.

### 3.6 Action names

A typed union in `@pryvis/core` (`AuditAction`), so a typo cannot silently invent a new action and
split one behaviour across two names that nobody thinks to search for. It grows by an explicit edit,
which is the point.

### 3.7 Retention

Not decided here, deliberately. An audit trail with no retention policy grows forever; one with a
short policy destroys the evidence it exists for. It needs the owner's answer and probably a
regulatory one, so this design leaves the rows in place and records the question — with a note that
retention is the *one* legitimate reason to ever delete an entry, and it must be a scheduled job
with its own audit entry, not an `UPDATE` grant.

## 4. Trade-offs

- **`details` as JSONB rather than typed columns.** Typed columns would be checkable; JSONB means
  the shape per action lives in the writer. Accepted, because the alternative is a column per action
  type. The typed `AuditAction` union plus the writer's own tests are where the shape is pinned.
- **No `UPDATE` grant at all** means a mistake in an entry can never be corrected, only
  supplemented by a later entry. That is the correct trade for a trail and a nuisance in every other
  table.
- **One table, not two.** Simpler policies and no double-write, at the cost of having nowhere to put
  tenant-less staff actions until the second table exists. Named as owed.
- **Writing an entry costs an insert inside every audited transaction.** Accepted: the audited
  actions are money, permission and tenancy changes, which are rare compared to reads.

## 5. How it will be proved

| Plant | Must fail |
|---|---|
| The app role regains `UPDATE` on `audit_entry` | the grant test |
| A policy permitting `UPDATE` or `DELETE` is added | the policy test |
| `record()` called with a client instead of a transaction | typecheck, and the atomicity test |
| The transaction rolls back after `record()` | the atomicity test (no orphan entry) |
| An entry written with no `actor_user_id` for a `tenant_user` action | the writer's validation test |
| `details` containing a `password` or `token` key | the redaction guard |
| A tenant reading another tenant's entries | the isolation test |
| An audited change committed with no entry | the "no change without its entry" test |

Plus: a tenant can read a **staff** action taken against it — the property Rule 5.1 asks for and
the one most likely to be quietly lost.

## 6. Scope

**In:** the table, its migration, grants and policies, `core/audit/record()`, the `AuditAction`
union, the redaction guard, the tests above, the privacy-notice update, and an ADR.

**Out, and owed:** `platform_audit_entry` for tenant-less staff actions (with the admin console);
capability-gated read redaction (same); retention (needs the owner); a UI; and any wiring into
actions that do not exist yet — there are no invoices to void. **This builds the mechanism and
audits the actions that exist**, which today means tenancy and user changes. A mechanism with one
real caller is honest; a mechanism with none would be untested scaffolding.
