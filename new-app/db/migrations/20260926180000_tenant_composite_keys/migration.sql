-- A child row cannot belong to a different tenant than its parent (finding J3).
--
-- ## WHAT WAS WRONG, AND IT IS THE ONLY CROSS-TENANT DEFECT FOUND SO FAR
--
-- Every foreign key in this schema was single-column, and PostgreSQL is explicit that "referential
-- integrity checks, such as unique or primary key constraints and foreign key references, always
-- bypass row security" (ddl-rowsecurity). A row's policy compares the row's OWN tenant_id to the
-- session's; nothing compared it to its parent's. So:
--
--   1. Tenant A learns the id of tenant B's `quote_issue`. Ids here are client-generated (ADR 0019)
--      and travel through sync payloads, PDFs, share links and exports, so this is a leaked
--      identifier rather than a guessed one.
--   2. A inserts an `acceptance` with tenant_id = A and issue_id = B's issue. The INSERT policy
--      passes, because the row's own tenant is A. The foreign key passes, because it bypasses RLS.
--   3. `acceptance_issue_key` was global, so that issue now HAS an acceptance.
--   4. **B can never accept their own quote.** B's insert fails on the unique index. B cannot see the
--      offending row, cannot update it (no UPDATE policy) and cannot delete it (no DELETE policy --
--      the immutability design working against its owner). Recovery needed a superuser.
--
-- The same move worked on `quote_issue` itself, on `issue_number`, and on every append-only child.
-- And it is not only an attack: one repository method stamping the session tenant onto a row whose
-- parent came from a different query produces the same unremovable row. Rule 4 asks for three
-- layers; here the application was the only one holding.
--
-- ## THE FIX: MAKE IT UNREPRESENTABLE RATHER THAN INVISIBLE
--
--   1. Every parent gets UNIQUE (id, tenant_id) -- redundant as a uniqueness claim, since id is
--      already the primary key, and that is the point: it exists so a composite foreign key can
--      reference the PAIR.
--   2. Every parent-child foreign key becomes (child_id, tenant_id) -> parent (id, tenant_id). The
--      database now refuses a child whose tenant differs from its parent's, and it refuses it
--      whatever the policies say, because a foreign key is not a policy.
--   3. Every tenant-owned unique index is scoped to the tenant. With composite keys in place this is
--      belt-and-braces, and it is what turns the remaining failure mode from "permanent" to
--      "impossible": even if a cross-tenant child could exist, it could no longer consume the slot
--      its rightful owner needs.
--
-- ## THE ONE FOREIGN KEY DELIBERATELY LEFT SINGLE-COLUMN, WITH ITS REASON
--
-- `audit_entry.actor_user_id` stays as it is. `audit_entry.tenant_id` is **the tenant whose data was
-- affected**, and the audit migration says so explicitly: "a staff action against a tenant carries
-- THAT tenant's id". The actor of such an entry is a platform staff user belonging to a different
-- tenant, so a composite key here would make staff accountability -- the thing Rule 5.1 requires --
-- unrecordable. Its integrity is the plain foreign key to `app_user` added in
-- `20260926160000_unenforced_references`, not tenant equality.
--
-- `app_credential_email_key` also stays global, because a login address identifies one credential
-- across the whole product; scoping it per tenant would let two tenants hold the same sign-in.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not stop a tenant READING another tenant's data. That is the policies' job and
--   `db/test/tenant-isolation.test.ts` covers it. This closes the WRITE direction, which the suite
--   did not state at all: it tested that a row stamped with another tenant's id is refused (it is,
--   by WITH CHECK) and never that a row stamped with one's OWN id but hung off another tenant's
--   parent is refused (it was not).
-- - It does not make ids secret. It makes a leaked id useless, which is the stronger property.
-- - It does not cover `platform_capability`, `mfa_totp` or `mfa_recovery_code`, whose children are
--   not tenant-owned: their parent is a person, not a business.
-- - MATCH SIMPLE is the default and is deliberate. Where the child column is nullable
--   (`acceptance.document_render_id`, `quote_line.section_id`), a NULL leaves the constraint
--   unenforced, which is what "no parent" should mean.

-- ---------------------------------------------------------------------------
-- 1. Each parent can be referenced as (id, tenant_id).
-- ---------------------------------------------------------------------------
ALTER TABLE "acceptance" ADD CONSTRAINT "acceptance_id_tenant_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_id_tenant_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "client" ADD CONSTRAINT "client_id_tenant_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "document_render" ADD CONSTRAINT "document_render_id_tenant_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_id_tenant_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "number_series" ADD CONSTRAINT "number_series_id_tenant_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "quote" ADD CONSTRAINT "quote_id_tenant_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "quote_issue" ADD CONSTRAINT "quote_issue_id_tenant_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "quote_section" ADD CONSTRAINT "quote_section_id_tenant_key" UNIQUE ("id", "tenant_id");
ALTER TABLE "rejected_seal" ADD CONSTRAINT "rejected_seal_id_tenant_key" UNIQUE ("id", "tenant_id");

-- ---------------------------------------------------------------------------
-- 2. Every parent-child foreign key carries the tenant.
--
-- Dropped and recreated rather than edited: Rule 6 forbids editing a committed migration, and a
-- constraint has no ALTER that changes its columns.
-- ---------------------------------------------------------------------------
ALTER TABLE "acceptance" DROP CONSTRAINT "acceptance_document_render_id_fkey";
ALTER TABLE "acceptance" ADD CONSTRAINT "acceptance_document_render_id_fkey"
    FOREIGN KEY ("document_render_id", "tenant_id") REFERENCES "document_render" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance" DROP CONSTRAINT "acceptance_issue_id_fkey";
ALTER TABLE "acceptance" ADD CONSTRAINT "acceptance_issue_id_fkey"
    FOREIGN KEY ("issue_id", "tenant_id") REFERENCES "quote_issue" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance_withdrawal" DROP CONSTRAINT "acceptance_withdrawal_acceptance_id_fkey";
ALTER TABLE "acceptance_withdrawal" ADD CONSTRAINT "acceptance_withdrawal_acceptance_id_fkey"
    FOREIGN KEY ("acceptance_id", "tenant_id") REFERENCES "acceptance" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_credential" DROP CONSTRAINT "app_credential_user_id_fkey";
ALTER TABLE "app_credential" ADD CONSTRAINT "app_credential_user_id_fkey"
    FOREIGN KEY ("user_id", "tenant_id") REFERENCES "app_user" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "app_session" DROP CONSTRAINT "app_session_user_id_fkey";
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_user_id_fkey"
    FOREIGN KEY ("user_id", "tenant_id") REFERENCES "app_user" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_note" DROP CONSTRAINT "credit_note_invoice_id_fkey";
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_invoice_id_fkey"
    FOREIGN KEY ("invoice_id", "tenant_id") REFERENCES "invoice" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_render" DROP CONSTRAINT "document_render_issue_id_fkey";
ALTER TABLE "document_render" ADD CONSTRAINT "document_render_issue_id_fkey"
    FOREIGN KEY ("issue_id", "tenant_id") REFERENCES "quote_issue" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_render" DROP CONSTRAINT "document_render_rendered_by_user_id_fkey";
ALTER TABLE "document_render" ADD CONSTRAINT "document_render_rendered_by_user_id_fkey"
    FOREIGN KEY ("rendered_by_user_id", "tenant_id") REFERENCES "app_user" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice" DROP CONSTRAINT "invoice_issue_id_fkey";
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_issue_id_fkey"
    FOREIGN KEY ("issue_id", "tenant_id") REFERENCES "quote_issue" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_void" DROP CONSTRAINT "invoice_void_invoice_id_fkey";
ALTER TABLE "invoice_void" ADD CONSTRAINT "invoice_void_invoice_id_fkey"
    FOREIGN KEY ("invoice_id", "tenant_id") REFERENCES "invoice" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_balance" DROP CONSTRAINT "issue_balance_issue_id_fkey";
ALTER TABLE "issue_balance" ADD CONSTRAINT "issue_balance_issue_id_fkey"
    FOREIGN KEY ("issue_id", "tenant_id") REFERENCES "quote_issue" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_number" DROP CONSTRAINT "issue_number_issue_id_fkey";
ALTER TABLE "issue_number" ADD CONSTRAINT "issue_number_issue_id_fkey"
    FOREIGN KEY ("issue_id", "tenant_id") REFERENCES "quote_issue" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_number" DROP CONSTRAINT "issue_number_series_id_fkey";
ALTER TABLE "issue_number" ADD CONSTRAINT "issue_number_series_id_fkey"
    FOREIGN KEY ("series_id", "tenant_id") REFERENCES "number_series" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote" DROP CONSTRAINT "quote_client_id_fkey";
ALTER TABLE "quote" ADD CONSTRAINT "quote_client_id_fkey"
    FOREIGN KEY ("client_id", "tenant_id") REFERENCES "client" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_issue" DROP CONSTRAINT "quote_issue_quote_id_fkey";
ALTER TABLE "quote_issue" ADD CONSTRAINT "quote_issue_quote_id_fkey"
    FOREIGN KEY ("quote_id", "tenant_id") REFERENCES "quote" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_issue_line" DROP CONSTRAINT "quote_issue_line_issue_id_fkey";
ALTER TABLE "quote_issue_line" ADD CONSTRAINT "quote_issue_line_issue_id_fkey"
    FOREIGN KEY ("issue_id", "tenant_id") REFERENCES "quote_issue" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_line" DROP CONSTRAINT "quote_line_quote_id_fkey";
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_quote_id_fkey"
    FOREIGN KEY ("quote_id", "tenant_id") REFERENCES "quote" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_line" DROP CONSTRAINT "quote_line_section_id_fkey";
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_section_id_fkey"
    FOREIGN KEY ("section_id", "tenant_id") REFERENCES "quote_section" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_section" DROP CONSTRAINT "quote_section_quote_id_fkey";
ALTER TABLE "quote_section" ADD CONSTRAINT "quote_section_quote_id_fkey"
    FOREIGN KEY ("quote_id", "tenant_id") REFERENCES "quote" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rejected_seal" DROP CONSTRAINT "rejected_seal_quote_id_fkey";
ALTER TABLE "rejected_seal" ADD CONSTRAINT "rejected_seal_quote_id_fkey"
    FOREIGN KEY ("quote_id", "tenant_id") REFERENCES "quote" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rejected_seal_line" DROP CONSTRAINT "rejected_seal_line_seal_fkey";
ALTER TABLE "rejected_seal_line" ADD CONSTRAINT "rejected_seal_line_seal_fkey"
    FOREIGN KEY ("rejected_seal_id", "tenant_id") REFERENCES "rejected_seal" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "variation" DROP CONSTRAINT "variation_issue_id_fkey";
ALTER TABLE "variation" ADD CONSTRAINT "variation_issue_id_fkey"
    FOREIGN KEY ("issue_id", "tenant_id") REFERENCES "quote_issue" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Uniqueness is per tenant, so a foreign row cannot consume a slot.
--
-- The names are unchanged, so every document and test that cites an index by name keeps citing
-- something real -- which `tools/check_schema_citations.py` would otherwise report.
-- ---------------------------------------------------------------------------
DROP INDEX "quote_issue_quote_revision_key";
CREATE UNIQUE INDEX "quote_issue_quote_revision_key" ON "quote_issue" ("tenant_id", "quote_id", "revision");
DROP INDEX "issue_number_issue_key";
CREATE UNIQUE INDEX "issue_number_issue_key" ON "issue_number" ("tenant_id", "issue_id");
DROP INDEX "issue_number_series_number_key";
CREATE UNIQUE INDEX "issue_number_series_number_key" ON "issue_number" ("tenant_id", "series_id", "number");
DROP INDEX "acceptance_issue_key";
CREATE UNIQUE INDEX "acceptance_issue_key" ON "acceptance" ("tenant_id", "issue_id");
DROP INDEX "acceptance_withdrawal_acceptance_key";
CREATE UNIQUE INDEX "acceptance_withdrawal_acceptance_key" ON "acceptance_withdrawal" ("tenant_id", "acceptance_id");
DROP INDEX "invoice_void_invoice_key";
CREATE UNIQUE INDEX "invoice_void_invoice_key" ON "invoice_void" ("tenant_id", "invoice_id");
DROP INDEX "variation_issue_client_reference_key";
CREATE UNIQUE INDEX "variation_issue_client_reference_key" ON "variation" ("tenant_id", "issue_id", "client_reference")
    WHERE "client_reference" IS NOT NULL;
DROP INDEX "document_render_issue_sha256_key";
CREATE UNIQUE INDEX "document_render_issue_sha256_key" ON "document_render" ("tenant_id", "issue_id", "sha256");
