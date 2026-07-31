-- Admin RBAC: super-admin flag + granular per-admin capabilities.
-- Values in "adminCapabilities" come from core's AdminCapability (plain
-- strings, validated in the app layer — deliberately not a DB enum so adding
-- a capability never needs a schema migration).
ALTER TABLE "User" ADD COLUMN "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "adminCapabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill: every existing internal admin becomes a super-admin, so the
-- current sole admin (yattapang) keeps full authority and can't be locked out
-- of the newly capability-gated routes. New admins created via the console
-- start with no capabilities until the super-admin grants them.
UPDATE "User" SET "isSuperAdmin" = true WHERE "role" = 'ADMIN';
