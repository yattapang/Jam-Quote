-- Pryvis initial migration: the tenant, its users, and the isolation that makes
-- them tenants rather than rows that happen to have a foreign key.
--
-- Rule 6: once applied, this file is never edited. A correction is a new
-- migration. Prisma checksums it, and editing it breaks every database that has
-- already run it.

-- The tenant is the unit of isolation.
CREATE TABLE "tenant" (
    "id"           UUID         NOT NULL,
    "name"         TEXT         NOT NULL,
    "country_code" CHAR(2)      NOT NULL,
    "currency"     CHAR(3)      NOT NULL,
    "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- "app_user", not "user": `user` is reserved in Postgres, and a table needing
-- quotes forever is a table someone will eventually fail to quote — including
-- inside the policy SQL below, where the slip would fail silently.
CREATE TABLE "app_user" (
    "id"            UUID         NOT NULL,
    "tenant_id"     UUID         NOT NULL,
    "email"         VARCHAR(320) NOT NULL,
    "password_hash" TEXT         NOT NULL,
    "role"          TEXT         NOT NULL,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- Unique per tenant, not globally: see the comment in db/schema.prisma. A global
-- unique would leak another tenant's user through a sign-up error.
CREATE UNIQUE INDEX "app_user_tenant_id_email_key" ON "app_user" ("tenant_id", "email");

-- Every query is tenant-scoped, so the tenant column leads the index.
CREATE INDEX "app_user_tenant_id_idx" ON "app_user" ("tenant_id");

ALTER TABLE "app_user"
    ADD CONSTRAINT "app_user_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- The isolation rule.
--
-- Everything between the two markers below is db/policies/001-tenant-isolation.sql
-- verbatim. It is duplicated here because a migration must be self-contained SQL,
-- and db/test/policy-parity.test.ts fails if the two ever disagree — so the
-- readable copy cannot rot into a description of something that is no longer
-- true.
-- ---------------------------------------------------------------------------

-- >>> BEGIN db/policies/001-tenant-isolation.sql
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
-- <<< END db/policies/001-tenant-isolation.sql
