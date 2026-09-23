-- Tenant isolation, as row-level security.
--
-- WHY THIS FILE EXISTS SEPARATELY FROM THE MIGRATION
--
-- These policies are the tenancy rule (docs/RULES.md rule 4). The Phase 0 audit
-- found the previous application had `businessId` on every table and correct
-- application scoping, and *nothing else* — one forgotten WHERE clause was a
-- live cross-tenant read. This file is the second line of defence, and it is
-- kept here, readable in one piece, because a reviewer must be able to check the
-- isolation rule without reconstructing it from a sequence of migration diffs.
--
-- The authoritative copy is THIS file. Each migration that changes the policies
-- embeds it verbatim, and `db/test/policy-parity.test.ts` fails when the applied
-- migration and this file disagree — so this cannot quietly become documentation
-- of something that is no longer true.
--
-- WHAT IT ASSUMES
--
-- The request sets `app.tenant_id` for the duration of its transaction, via
-- core/tenancy. Nothing else is trusted: not a claim in a token, not a value in
-- a WHERE clause written by a developer.

-- ---------------------------------------------------------------------------
-- The tenant table itself
-- ---------------------------------------------------------------------------
ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;

-- FORCE, not just ENABLE. Postgres exempts a table's OWNER from its own
-- policies, and the application's migration role owns these tables, so ENABLE
-- alone would leave RLS switched on and doing nothing for exactly the connection
-- that matters. This single word is the difference between a real control and a
-- checkbox.
ALTER TABLE "tenant" FORCE ROW LEVEL SECURITY;

-- A tenant may see and change only its own row.
--
-- `current_setting('app.tenant_id', true)` returns NULL when the setting was
-- never set, rather than raising. NULL = NULL is NULL, not true, so a query with
-- no tenant context matches NOTHING. Default-deny falls out of the comparison
-- instead of depending on someone remembering to add a check.
--
-- `nullif(..., '')` is not decoration. There are two ways to have no tenant: the
-- variable was never set (NULL), and the variable was set to an empty string,
-- which is what a request for an anonymous caller produces. Casting '' to uuid
-- RAISES rather than denying, so without nullif the anonymous case fails with a
-- database error instead of returning zero rows. It still fails closed, but it
-- fails as a 500 that leaks a database message, and it makes an ordinary public
-- request look like a fault. The first run of
-- db/test/tenant-isolation.test.ts found exactly this.
CREATE POLICY tenant_self_isolation ON "tenant"
  USING ("id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- Tenant-owned tables
-- ---------------------------------------------------------------------------
-- Every tenant-owned table gets exactly this shape. It is spelled out per table
-- rather than generated in a loop, because a reviewer should be able to read the
-- list and see which tables are covered — and because a table missing from this
-- file is caught by `db/test/policy-parity.test.ts`, which asks the database
-- which tables carry a tenant_id column and fails on any that has no policy.

ALTER TABLE "app_user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "app_user" FORCE ROW LEVEL SECURITY;

-- USING governs what the caller can READ (and which rows UPDATE/DELETE can
-- reach). WITH CHECK governs what it can WRITE. Both are required: USING alone
-- would let a caller INSERT a row belonging to another tenant, which it then
-- could not see — a write leak instead of a read leak, and a far nastier one,
-- because the data is in the wrong tenant's table and nobody is looking at it.
CREATE POLICY app_user_tenant_isolation ON "app_user"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
