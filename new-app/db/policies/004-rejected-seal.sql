-- Tenant isolation for `rejected_seal`, corrected (finding J16).
--
-- ## WHAT WAS WRONG
--
-- `20260926120000_rejected_seals/migration.sql` created ONE policy with no `FOR` clause. A policy
-- with no `FOR` clause applies to **ALL** commands, so it granted DELETE as well — and the row this
-- table exists to preserve is the price a contractor gave a client at a gate, on a device, which the
-- server then refused. A tenant could delete the evidence of what was quoted.
--
-- The migration's own comment said the table "needs an UPDATE policy" for its `resolution`, and that
-- was true. ALL was not the way to grant it. This is the same defect shape as J2 — a mechanism that
-- was reasoned about correctly and then attached too widely — and it is why the append-only tables
-- use two separate policies rather than one convenient one.
--
-- ## THE SHAPE, AND WHY THIS TABLE IS ITS OWN CATEGORY
--
-- Not append-only: a tenant genuinely resolves a rejected seal later, and that is an UPDATE. Not
-- ordinary either: everything except the resolution is frozen. So it is exactly SELECT, INSERT and
-- UPDATE, **with no DELETE policy at all**, and the absence of that policy is what makes the row
-- undeletable — the same technique ADR 0020 uses for the audit log rather than a promise in a
-- comment.
--
-- ## WHAT A POLICY CANNOT DO, AND WHAT DOES IT INSTEAD
--
-- Postgres policies cannot restrict an UPDATE to particular COLUMNS, so the original migration
-- admitted honestly that "a tenant who can resolve a rejected seal can also, at the database level,
-- rewrite the price it recorded" and left the application to prevent it. That admission is now
-- unnecessary: `rejected_seal_freeze()` is a BEFORE UPDATE trigger that refuses any change outside
-- `resolution`, `resolved_at` and `version`. The rule is enforced where it cannot be forgotten,
-- which is J2's lesson applied to this table.
ALTER TABLE "rejected_seal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rejected_seal" FORCE ROW LEVEL SECURITY;
CREATE POLICY rejected_seal_read ON "rejected_seal" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY rejected_seal_append ON "rejected_seal" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY rejected_seal_resolve ON "rejected_seal" FOR UPDATE
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
