-- Tenant isolation for the Documents context, as row-level security.
--
-- WHY THIS FILE EXISTS SEPARATELY FROM THE MIGRATION
--
-- Same reason as `001-tenant-isolation.sql`: these policies ARE the tenancy rule (Rule 4), and a
-- reviewer must be able to read the isolation rule in one piece rather than reconstruct it from a
-- sequence of migration diffs. The authoritative copy is THIS file; the migration embeds it
-- verbatim, and `db/test/policy-parity.test.ts` fails when the two disagree.
--
-- WHAT IS DIFFERENT HERE, AND IT IS THE POINT
--
-- Most of these tables are **append-only**, and that is expressed the way the audit log expresses
-- it (ADR 0020): by the ABSENCE of an UPDATE or DELETE policy. A table with `FORCE ROW LEVEL
-- SECURITY` and only a SELECT/INSERT policy cannot be updated even by a role holding an UPDATE
-- grant, because no policy permits the row. So immutability is not a comment asking politely, and
-- it does not depend on every future query being careful — which is the argument the whole
-- Documents model rests on (ADR 0025, decision 3 and 4).
--
-- `issue_balance` is the exception and is protected differently again — see the migration, and
-- ADR 0025 decision 2. It is the one table here that is legitimately mutable, and it is mutable
-- only through a function.

-- ---------------------------------------------------------------------------
-- Directory: the tenant's own records. Ordinary read/write isolation.
-- ---------------------------------------------------------------------------
ALTER TABLE "client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "client" FORCE ROW LEVEL SECURITY;
CREATE POLICY client_tenant_isolation ON "client"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "number_series" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "number_series" FORCE ROW LEVEL SECURITY;
CREATE POLICY number_series_tenant_isolation ON "number_series"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- The working quote. Editable, versioned, mergeable — the only mutable
-- document in this context, because it is worth nothing to anybody outside the
-- tenant until it is sealed.
-- ---------------------------------------------------------------------------
ALTER TABLE "quote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote" FORCE ROW LEVEL SECURITY;
CREATE POLICY quote_tenant_isolation ON "quote"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "quote_section" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_section" FORCE ROW LEVEL SECURITY;
CREATE POLICY quote_section_tenant_isolation ON "quote_section"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "quote_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY quote_line_tenant_isolation ON "quote_line"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- APPEND-ONLY FROM HERE DOWN.
--
-- SELECT and INSERT are scoped to the tenant. There is deliberately NO UPDATE
-- and NO DELETE policy, so those operations are refused for every row, for
-- every role, forever. That is how `quote_issue` keeps the property the model
-- claims for it (§6.1), and it is why the model can say "no UPDATE path" and
-- mean it literally.
--
-- Note the shape: `FOR SELECT` and `FOR INSERT` as separate policies rather
-- than one permissive `FOR ALL`. `FOR ALL` would cover UPDATE and DELETE too.
-- ---------------------------------------------------------------------------
ALTER TABLE "quote_issue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_issue" FORCE ROW LEVEL SECURITY;
CREATE POLICY quote_issue_read ON "quote_issue" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY quote_issue_append ON "quote_issue" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "quote_issue_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quote_issue_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY quote_issue_line_read ON "quote_issue_line" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY quote_issue_line_append ON "quote_issue_line" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "issue_number" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "issue_number" FORCE ROW LEVEL SECURITY;
CREATE POLICY issue_number_read ON "issue_number" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY issue_number_append ON "issue_number" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "acceptance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acceptance" FORCE ROW LEVEL SECURITY;
CREATE POLICY acceptance_read ON "acceptance" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY acceptance_append ON "acceptance" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "acceptance_withdrawal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acceptance_withdrawal" FORCE ROW LEVEL SECURITY;
CREATE POLICY acceptance_withdrawal_read ON "acceptance_withdrawal" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY acceptance_withdrawal_append ON "acceptance_withdrawal" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "variation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "variation" FORCE ROW LEVEL SECURITY;
CREATE POLICY variation_read ON "variation" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY variation_append ON "variation" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "invoice" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice" FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_read ON "invoice" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY invoice_append ON "invoice" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "invoice_void" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_void" FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_void_read ON "invoice_void" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY invoice_void_append ON "invoice_void" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "credit_note" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_note" FORCE ROW LEVEL SECURITY;
CREATE POLICY credit_note_read ON "credit_note" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY credit_note_append ON "credit_note" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- ---------------------------------------------------------------------------
-- issue_balance: the one mutable table here, and writes need a flag only a
-- function sets.
--
-- WHY NOT THE OBVIOUS THINGS
--
-- *Grants* cannot carry this. The test harness grants SELECT/INSERT/UPDATE/DELETE
-- on every table after migrations run, so a REVOKE in a migration is undone by
-- the harness — and a control a harness can defeat is not a control, it is a
-- control that is never tested (ADR 0025 decision 2).
--
-- *SECURITY DEFINER alone* cannot carry it either, and this is the trap worth
-- writing down: `FORCE ROW LEVEL SECURITY` binds the table's OWNER too — that is
-- the entire reason 001 uses FORCE — so a definer function running as owner is
-- refused by its own policies exactly like anyone else. Dropping FORCE for this
-- one table would work and would cost the property FORCE exists to provide.
--
-- SO: the write policies carry the canonical tenant expression AND a
-- transaction-local flag. `issue_balance_apply()` sets the flag, does its work,
-- and clears it. A direct UPDATE from anywhere else fails the policy however it
-- is granted and whoever runs it.
--
-- There is deliberately **no DELETE policy**: a balance row is recomputed, never
-- removed. Deleting it would reintroduce the empty-lock hole, because a
-- `SELECT … FOR UPDATE` matching no row takes no lock at all.
--
-- The flag is not a secret and does not pretend to be. Anyone who writes
-- `set_config('pryvis.balance_write', 'on', true)` by hand defeats it — which is
-- why `db/test/policy-parity.test.ts` asserts the predicate is present, and a
-- separate guard asserts the flag is set in exactly one place: the function.
ALTER TABLE "issue_balance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "issue_balance" FORCE ROW LEVEL SECURITY;

CREATE POLICY issue_balance_read ON "issue_balance" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY issue_balance_create ON "issue_balance" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
              AND current_setting('pryvis.balance_write', true) = 'on');

CREATE POLICY issue_balance_amend ON "issue_balance" FOR UPDATE
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
         AND current_setting('pryvis.balance_write', true) = 'on')
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
              AND current_setting('pryvis.balance_write', true) = 'on');
