-- Tenant isolation for `acceptance_evidence` and `document_settings`, as row-level security.
--
-- A new file because the earlier ones are embedded in committed migrations (Rule 6); this copy is
-- embedded verbatim in the migration that creates both tables, and `db/test/policy-parity.test.ts`
-- checks the two agree.
--
-- `acceptance_evidence` is **append-only**: a SELECT policy, an INSERT policy, and no UPDATE or DELETE
-- policy at all. Under FORCE ROW LEVEL SECURITY a row no policy permits cannot be updated even by the
-- table owner. That is what lets the grade be derived from these rows: a row cannot be rewritten to
-- raise or lower it (finding J6). Two policies, not one FOR ALL, which would grant UPDATE and DELETE too
-- (finding J16).
--
-- `document_settings` is a tenant's own mutable preferences, so it takes the one FOR ALL policy every
-- mutable tenant table takes. Deleting the row is harmless: the defaults it held are what an absent row
-- means, and no sealed issue reads it after its seal (finding J8).
ALTER TABLE "acceptance_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acceptance_evidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY acceptance_evidence_read ON "acceptance_evidence" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY acceptance_evidence_append ON "acceptance_evidence" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "document_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_settings" FORCE ROW LEVEL SECURITY;
CREATE POLICY document_settings_tenant_isolation ON "document_settings"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
