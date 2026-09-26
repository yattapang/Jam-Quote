-- Tenant isolation for `document_render`, as row-level security.
--
-- Separate from `002-documents-isolation.sql` for a mechanical reason rather than a conceptual one:
-- 002 is embedded verbatim in a migration that is already committed, and Rule 6 forbids editing a
-- committed migration. A new table therefore brings its own policies file, embedded verbatim in the
-- migration that creates it, and `db/test/policy-parity.test.ts` checks this copy against that one.
--
-- `document_render` is **append-only**, expressed the way every other sealed document here expresses
-- it (ADR 0020): a SELECT policy, an INSERT policy, and no UPDATE or DELETE policy at all. With
-- FORCE ROW LEVEL SECURITY a row that no policy permits cannot be updated even by the table owner,
-- so the immutability is enforced rather than requested. Two separate policies rather than one
-- FOR ALL, because a FOR ALL policy would grant UPDATE and DELETE as well — which is finding J16's
-- defect in `rejected_seal`, and it is not repeated here.
ALTER TABLE "document_render" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_render" FORCE ROW LEVEL SECURITY;
CREATE POLICY document_render_read ON "document_render" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY document_render_append ON "document_render" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
