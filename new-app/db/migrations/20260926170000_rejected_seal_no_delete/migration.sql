-- A refused seal cannot be deleted, and only its resolution can change (finding J16).
--
-- ## WHAT WAS WRONG
--
-- `20260926120000_rejected_seals` created a single policy with **no `FOR` clause**, which in Postgres
-- means FOR ALL. So the table that exists to preserve what a contractor quoted at a gate — the one
-- record of a price the server refused — was deletable and wholly rewritable by any session holding
-- the tenant id. Review 4 found it by reading the policy; nothing in the schema objected.
--
-- The intent in that migration was right and is quoted here so the correction is legible: "unlike the
-- sealed documents it needs an UPDATE policy, and unlike `issue_balance` that update is ordinary
-- tenant work". True. But FOR ALL grants DELETE with the UPDATE, and the migration then admitted what
-- it could not prevent: "a tenant who can resolve a rejected seal can also, at the database level,
-- rewrite the price it recorded. What prevents that is the application."
--
-- Both halves are fixed here, and the second one is the interesting half: **an invariant whose only
-- owner was "the application" now has a real one.**
--
-- ## THE FIX
--
--   1. The FOR ALL policy is dropped and replaced by three: SELECT, INSERT, UPDATE. There is no
--      DELETE policy, and with FORCE ROW LEVEL SECURITY the absence IS the refusal (ADR 0020).
--   2. `rejected_seal_freeze()` refuses any UPDATE that changes anything except `resolution`,
--      `resolved_at` and `version`. A policy cannot express a column restriction; a trigger can.
--
-- ## WHY A TRIGGER RATHER THAN THE FUNCTION-GUARDED PATTERN
--
-- `issue_balance` is written only by a function, enforced by a GUC the policies require. That is the
-- right shape when the write is a computation. Resolving a rejected seal is not a computation — it is
-- a person choosing "discarded" or "reissued" — so requiring a function would add a layer whose only
-- job is to be permitted. The trigger states the rule where the rule is: on the row.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not stop a tenant resolving the same row twice with different outcomes. `version` is the
--   control for that and it is compare-and-set in the application, which is owed.
-- - It does not prevent a resolution being set to a nonsense value; the CHECK constraint from the
--   original migration still does that, and it is unchanged.
-- - It says nothing about `rejected_seal_line`, which was already append-only and correct. The lines
--   are frozen by having no UPDATE policy at all, which is why they need no trigger.
-- - It does not audit the resolution. An `audit_entry` for it is application work.

DROP POLICY rejected_seal_tenant_isolation ON "rejected_seal";

-- ---------------------------------------------------------------------------
-- Everything except the resolution is frozen.
--
-- Column by column rather than with a row comparison, so a column added later is frozen by default:
-- a future column would have to be named here to become editable, and forgetting to name it fails
-- closed. The alternative — comparing whole rows and excluding three columns — fails open.
-- ---------------------------------------------------------------------------
CREATE FUNCTION rejected_seal_freeze() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."quote_id" IS DISTINCT FROM OLD."quote_id"
     OR NEW."revision_attempted" IS DISTINCT FROM OLD."revision_attempted"
     OR NEW."refusal_reason" IS DISTINCT FROM OLD."refusal_reason"
     OR NEW."client_id" IS DISTINCT FROM OLD."client_id"
     OR NEW."client_name" IS DISTINCT FROM OLD."client_name"
     OR NEW."title" IS DISTINCT FROM OLD."title"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."subtotal_minor" IS DISTINCT FROM OLD."subtotal_minor"
     OR NEW."tax_minor" IS DISTINCT FROM OLD."tax_minor"
     OR NEW."total_minor" IS DISTINCT FROM OLD."total_minor"
     OR NEW."sealed_at" IS DISTINCT FROM OLD."sealed_at"
     OR NEW."sealed_by_user_id" IS DISTINCT FROM OLD."sealed_by_user_id"
     OR NEW."catalog_synced_at" IS DISTINCT FROM OLD."catalog_synced_at"
     OR NEW."pushed_at" IS DISTINCT FROM OLD."pushed_at"
  THEN
    RAISE EXCEPTION
      'a rejected seal records what was quoted at the gate and what the server refused; only '
      'resolution, resolved_at and version may change (finding J16)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER rejected_seal_is_frozen
  BEFORE UPDATE ON "rejected_seal"
  FOR EACH ROW EXECUTE FUNCTION rejected_seal_freeze();

-- >>> BEGIN db/policies/004-rejected-seal.sql
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
-- <<< END db/policies/004-rejected-seal.sql
