-- Row versions and tombstones, for the schema half of offline sync.
--
-- Rule 6: never edited once applied. Corrections are a new migration.
-- Design: docs/design/row-identity-and-versioning.md (approved 2026-09-24).
--
-- WHY THIS IS IN FOUNDATIONS RATHER THAN WITH SYNC
--
-- The brief puts it in step 1 deliberately: a sync model cannot be retrofitted onto rows
-- that were not built for it. A quote priced on a phone with no signal already has children
-- referencing it, so the client must choose the id, or the phone rewrites every local
-- reference after upload and a retry creates a SECOND quote. A write made against a stale
-- copy must be refused rather than silently winning. And a deleted row must leave something
-- behind, or a phone that has been offline cannot tell "deleted" from "not yet told about"
-- and brings it back.
--
-- There are 8 tables today and no live rows anywhere, so this is a plain migration with no
-- backfill. That window closes at the first tenant.
--
-- WHICH TABLES, AND WHY NOT ALL OF THEM
--
-- Tenant-owned BUSINESS data gets the convention. The authentication and infrastructure
-- tables do not: a tombstone on app_session or rate_limit_bucket would mean nothing, because
-- nothing syncs them and nothing references them historically. The exemptions are named with
-- reasons in db/test/row-convention.test.ts, the same way the row-level-security exemptions
-- are, so a ninth table cannot quietly skip this.

-- ---------------------------------------------------------------------------
-- tenant
-- ---------------------------------------------------------------------------

-- Compared on every write: `UPDATE ... SET version = version + 1 WHERE id = $1 AND version = $2`.
-- Zero rows affected means somebody else got there first, and the caller is told rather than
-- having their edit vanish. NOT updated_at: clocks disagree, two writes in the same
-- millisecond are indistinguishable, and a clock that moves backwards makes a stale write
-- look fresh.
ALTER TABLE "tenant" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- NULL means live. Soft delete where history matters (Rule 6), and the only way a client that
-- has been away can learn a row is gone.
ALTER TABLE "tenant" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- ---------------------------------------------------------------------------
-- app_user
-- ---------------------------------------------------------------------------
ALTER TABLE "app_user" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Distinct from deactivated_at, which means "may no longer sign in" while remaining a member
-- of the business. deleted_at means removed. A user can be deactivated without being deleted,
-- and the two answer different questions.
ALTER TABLE "app_user" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- ---------------------------------------------------------------------------
-- Indexes that know about the tombstone
--
-- The Phase 0 audit found the previous application had soft deletes on almost every table and
-- indexes that ignored them, so every list query filtered rows the index had already returned.
-- Partial indexes are the fix, and they are part of the convention rather than an
-- optimisation to add later: an index added without `WHERE deleted_at IS NULL` is the defect,
-- and db/test/row-convention.test.ts refuses one.
-- ---------------------------------------------------------------------------

-- The ordering every "what changed since X?" query wants, live rows only. The id breaks ties so
-- a page boundary cannot skip or repeat a row when two rows share a timestamp.
CREATE INDEX "tenant_live_updated_idx"
    ON "tenant" ("updated_at", "id")
    WHERE "deleted_at" IS NULL;

CREATE INDEX "app_user_live_updated_idx"
    ON "app_user" ("tenant_id", "updated_at", "id")
    WHERE "deleted_at" IS NULL;

-- The email uniqueness rule has to become partial too, or a deleted user's address is held
-- hostage forever: the business could never re-invite the same person, and could not explain
-- why. Dropped and recreated rather than altered, because Postgres cannot add a WHERE clause to
-- an existing unique index.
DROP INDEX "app_user_tenant_id_email_key";
CREATE UNIQUE INDEX "app_user_tenant_id_email_key"
    ON "app_user" ("tenant_id", "email")
    WHERE "deleted_at" IS NULL;

-- The tenant lookup index predates this migration and was NOT partial, which the convention
-- guard caught on its first run — a real gap in this very migration, found because the rule is a
-- test rather than a paragraph. Recreated with the predicate, so a tenant's user list stops
-- scanning rows it is going to discard.
DROP INDEX "app_user_tenant_id_idx";
CREATE INDEX "app_user_tenant_id_idx"
    ON "app_user" ("tenant_id")
    WHERE "deleted_at" IS NULL;
