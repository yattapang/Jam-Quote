-- Sessions, and the three columns that make a live session revocable.
--
-- Rule 6: never edited once applied. Corrections are a new migration.
--
-- WHY THESE EXIST
--
-- The Phase 0 audit recorded three findings with one root cause: a 30-day token
-- with no rotation, no way to invalidate a live session, and a role trusted from a
-- token claim. All three are answered by resolving identity from the database on
-- every request, which needs somewhere to resolve it from.

-- Bumping this makes every token already issued for this user stale on its next
-- request. Password change, sign-out-everywhere, suspected compromise: one UPDATE,
-- no token blacklist to maintain, nothing to wait for.
ALTER TABLE "app_user" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;

-- A user who may no longer sign in, without deleting the row their documents and
-- audit entries refer to.
ALTER TABLE "app_user" ADD COLUMN "deactivated_at" TIMESTAMPTZ(6);

-- A tenant whose access is suspended - non-payment, or an investigation. Their data
-- stays intact and their users stop getting in on the next request, not in thirty
-- days.
ALTER TABLE "tenant" ADD COLUMN "suspended_at" TIMESTAMPTZ(6);

-- ---------------------------------------------------------------------------
-- app_session
--
-- A DELIBERATE EXCEPTION TO ROW-LEVEL SECURITY, and the only one in the schema.
--
-- Every other tenant-owned table is protected by a policy that reads
-- `app.tenant_id`. This table cannot be, because it is what ESTABLISHES
-- app.tenant_id: authentication happens before any tenant is known, so a policy
-- requiring a tenant would make the table unreadable at exactly the moment it is
-- needed. Chicken and egg, resolved by keeping the bootstrap outside the rule it
-- bootstraps.
--
-- What keeps that honest:
--
--   1. The tenant_id here comes from OUR OWN session store, never from a caller. It
--      is the one place a tenant id legitimately enters a request.
--   2. Nothing else is read without a tenant. core/auth reads this row, derives the
--      tenant, and every subsequent read - including the user's own role - happens
--      under row-level security with that tenant set. So a forged or stale session
--      buys nothing beyond this one row.
--   3. The row is deliberately thin: ids, a version, timestamps. No name, no email,
--      no document. A read of every row in this table reveals that sessions exist,
--      and nothing about anybody's business.
--   4. db/test/policy-parity.test.ts names this table as an explicit, reasoned
--      exemption. It is not missing from the policy file by accident, and a second
--      table cannot join it quietly.
-- ---------------------------------------------------------------------------
CREATE TABLE "app_session" (
    "id"           UUID NOT NULL,
    "user_id"      UUID NOT NULL,
    -- Denormalised from app_user on purpose: reading it from app_user would require
    -- a tenant to already be set, which is the problem this table solves.
    "tenant_id"    UUID NOT NULL,
    -- The value of app_user.session_version when this session was issued. A
    -- mismatch on any later request means the session was superseded.
    "version"      INTEGER NOT NULL,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- When this session stops working regardless of anything else. Short, and
    -- rotated on use, rather than the thirty days the audit found.
    "expires_at"   TIMESTAMPTZ(6) NOT NULL,
    -- Revoked, never deleted: a session that was used to do something is history.
    "revoked_at"   TIMESTAMPTZ(6),

    CONSTRAINT "app_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "app_session_user_id_idx" ON "app_session" ("user_id");

ALTER TABLE "app_session"
    ADD CONSTRAINT "app_session_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_session"
    ADD CONSTRAINT "app_session_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
