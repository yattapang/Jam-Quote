-- The audit log.
--
-- Rule 6: never edited once applied.
-- Design: docs/design/audit-log.md (approved 2026-09-24, with retention per ADR 0020).
--
-- WHY THIS COMES BEFORE STAFF MFA
--
-- Every staff safeguard in Rule 5.1 - least privilege, re-authentication, same-day offboarding -
-- is PREVENTIVE, and preventive controls fail silently. This is the only thing that notices. The
-- threat model (§4.4) says the staff controls cannot be detected without it, only intended.
--
-- ── APPEND-ONLY, AND HOW ─────────────────────────────────────────────────────────────────────
--
-- The design proposed enforcing this with grants: give the application SELECT and INSERT and
-- withhold UPDATE and DELETE. That works, and it has a weakness worth naming - it lives in
-- whoever provisions the role, outside this file, so a permissive `GRANT ALL` somewhere in ops
-- silently removes the control.
--
-- So it is enforced HERE instead, by the absence of a policy. With FORCE ROW LEVEL SECURITY and
-- policies for SELECT and INSERT only, Postgres refuses UPDATE and DELETE **even to a role that
-- has been granted them**, because no policy permits those commands. The test grants UPDATE and
-- DELETE deliberately and shows they still fail - which is a stronger claim than a test that
-- passes only because the grant was withheld.
--
-- Grants remain the second layer (ops should still withhold them), but the control does not
-- depend on them.

CREATE TABLE "audit_entry" (
    -- newRowId() - a UUIDv7, so entries sort chronologically by primary key (ADR 0019). For a
    -- table read in time order during an incident, that is the whole index strategy.
    "id" UUID NOT NULL,

    -- The tenant whose data was affected. NOT NULL, and that is a scoping decision: a staff
    -- action against a tenant carries THAT tenant's id, which is exactly the set Rule 5.1 says
    -- the tenant should be able to see. So the ordinary tenant policy lets a tenant read what we
    -- did to them, with no special case.
    --
    -- Staff actions with no tenant (a staff sign-in, a global pricing change) have nowhere to go
    -- here and need platform_audit_entry, which lands with the admin console. Building it now
    -- would be a table nothing writes to.
    "tenant_id" UUID NOT NULL,

    -- When it happened, as the application saw it. Separate from any insert time: an entry
    -- written by a retried job describes the moment of the action, not the moment of the write.
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- 'tenant_user' | 'platform_staff' | 'system'. Text, not an enum: actor kinds grow (an API
    -- key, an integration) and a new one should not need a migration (ADR 0002).
    "actor_kind" TEXT NOT NULL,

    -- NULL only for 'system'. A human action with no actor is a gap in the trail, so the writer
    -- refuses it and there is a CHECK here as the second line.
    "actor_user_id" UUID,

    -- 'tenant.suspended', 'user.role_changed'. A typed union in @pryvis/core is what stops a typo
    -- silently inventing a new action and splitting one behaviour across two names nobody thinks
    -- to search for.
    "action" TEXT NOT NULL,

    "subject_type" TEXT NOT NULL,
    -- NULL where the subject IS the tenant.
    "subject_id" UUID,

    -- One sentence a person can read during an incident, without decoding the details.
    "summary" TEXT NOT NULL,

    -- Already redacted by the writer. A guard refuses a payload carrying a password, token,
    -- secret or hash: this is the one table humans read under pressure, and it is the last place
    -- a credential should be sitting.
    "details" JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Personal data, kept deliberately: after a compromise "which address" is the question, and
    -- it cannot be reconstructed later. The privacy notice says we keep it and why - that edit
    -- ships with this migration, because shipping one without the other would make the notice
    -- untrue.
    "actor_ip" INET,

    CONSTRAINT "audit_entry_pkey" PRIMARY KEY ("id"),

    -- A human action with no actor is not an audit entry, it is a rumour.
    CONSTRAINT "audit_entry_actor_present" CHECK (
        ("actor_kind" = 'system' AND "actor_user_id" IS NULL)
        OR ("actor_kind" <> 'system' AND "actor_user_id" IS NOT NULL)
    )
);

ALTER TABLE "audit_entry"
    ADD CONSTRAINT "audit_entry_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- The read a tenant actually performs: their own trail, newest first. `id` doubles as the time
-- order because v7 ids sort chronologically.
CREATE INDEX "audit_entry_tenant_time_idx" ON "audit_entry" ("tenant_id", "occurred_at" DESC, "id" DESC);

-- "What has been done to this invoice?" - the question asked during a dispute.
CREATE INDEX "audit_entry_subject_idx" ON "audit_entry" ("tenant_id", "subject_type", "subject_id");

-- NOTE: no partial index predicate here, and no deleted_at column. An audit entry is never
-- deleted by the application (see below), so there is no tombstone to filter and the row
-- convention does not apply. db/test/row-convention.test.ts names this exemption with the reason.

-- ---------------------------------------------------------------------------
-- Isolation, and append-only by omission
-- ---------------------------------------------------------------------------
ALTER TABLE "audit_entry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_entry" FORCE ROW LEVEL SECURITY;

-- Reading: the canonical tenant expression, so a tenant sees its own entries and nobody else's -
-- including the entries recording what OUR staff did to them.
CREATE POLICY audit_entry_tenant_read ON "audit_entry"
    FOR SELECT
    USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- Writing: same expression, so an entry cannot be planted in another tenant's trail.
CREATE POLICY audit_entry_tenant_append ON "audit_entry"
    FOR INSERT
    WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- THERE IS DELIBERATELY NO POLICY FOR UPDATE OR DELETE.
--
-- That absence IS the control. Postgres denies a command with no permissive policy, whatever the
-- role has been granted, so history cannot be rewritten by the application even by accident. The
-- only legitimate deletion is retention (ADR 0020), which runs as a separate maintenance identity
-- and records its own entry before it deletes anything.
