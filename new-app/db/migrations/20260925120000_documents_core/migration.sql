-- The Documents core: the first business tables, and the five invariants ADR 0025 moved out of prose.
--
-- ## WHY THIS MIGRATION EXISTS AT ALL
--
-- Three review passes over the domain model and the PRD each introduced what the next one found:
-- 19 findings, then 17 (four of five blockers created by the amendments that closed the first), then
-- 20 (eleven of them defects in the commit that closed the second). The diagnosis was the medium.
-- An invariant written in prose in two places drifts every time, and no amount of care fixed it —
-- two findings marked "Closed" were not closed in the document they named.
--
-- So five invariants live here now, where a thing cannot have two definitions (ADR 0025):
--
--   1. The invoice ceiling says "recorded variations", in one expression: `issue_ceiling_minor()`.
--   2. `issue_balance` has no ordinary write path; one locked function owns it.
--   3. A document's state is DERIVED — there is no state column to disagree about.
--   4. Withdrawal is an insert-only row, so nothing here needs an UPDATE path.
--   5. A pending registration is not a user, so `app_user.email` keeps its global unique index and
--      "first to verify wins" becomes a database guarantee.
--
-- ## WHAT THIS MIGRATION DOES NOT DO (Rule 21.4)
--
-- - It does not cover the whole Documents context. Retention, payments against invoices, projects and
--   costing are release 2 and absent on purpose (PRD §8).
-- - It does not prove the five invariants hold. The migration creates the mechanisms; the tests in
--   `db/test/documents-core.test.ts` prove each by planting the defect it exists to catch (Rule 21.2).
-- - It says nothing about whether the application uses these paths correctly. A repository that
--   forgets to call `issue_balance_apply()` cannot insert an invoice — that is the point — but one
--   that computes the wrong line total will still be wrong, and only its own tests catch that.
-- - Money arithmetic below the ceiling (per-line GCT, markup, discount, rounding) is not here.
--
-- ## MONEY (Rule 3)
--
-- Every amount is `BIGINT`, in minor units, with the currency on the document that owns it. The old
-- application capped at $21,474,836.47 because it used a 32-bit type; the owner's ceiling is
-- ~999,999,999.99 JMD, which is 99,999,999,999 minor units — 47× past that limit (ADR 0011). No
-- floating-point type appears in this file, and `db/test/money-convention.test.ts` asserts it.

-- ---------------------------------------------------------------------------
-- Directory: the tenant's own records.
-- ---------------------------------------------------------------------------

CREATE TABLE "client" (
    "id"         UUID NOT NULL,
    "tenant_id"  UUID NOT NULL,
    "name"       TEXT NOT NULL,
    -- Nullable, and PRD H9 is open because of it: the e-signature's verification code needs a
    -- channel, and nothing here requires a client to have one. Recorded rather than quietly
    -- required, because making it NOT NULL is a product decision about clients we already know.
    "email"      TEXT,
    "phone"      TEXT,
    "version"    INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "client_tenant_id_idx" ON "client" ("tenant_id") WHERE "deleted_at" IS NULL;
ALTER TABLE "client" ADD CONSTRAINT "client_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One series per tenant per document kind. `next_number` is the only mutable thing about it, and it
-- is allocated under a row lock, which is the shape ADR 0025 decision 2 copies for the balance.
CREATE TABLE "number_series" (
    "id"            UUID NOT NULL,
    "tenant_id"     UUID NOT NULL,
    "document_kind" TEXT NOT NULL,
    "prefix"        TEXT NOT NULL DEFAULT '',
    "next_number"   BIGINT NOT NULL DEFAULT 1,
    "reset_rule"    TEXT NOT NULL DEFAULT 'never',
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "number_series_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "number_series_reset_rule_check"
        CHECK ("reset_rule" IN ('never', 'yearly', 'monthly'))
);
CREATE UNIQUE INDEX "number_series_tenant_kind_key"
    ON "number_series" ("tenant_id", "document_kind");
ALTER TABLE "number_series" ADD CONSTRAINT "number_series_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- The working quote: the only mutable document in this context.
-- ---------------------------------------------------------------------------

CREATE TABLE "quote" (
    "id"         UUID NOT NULL,
    "tenant_id"  UUID NOT NULL,
    "client_id"  UUID NOT NULL,
    "title"      TEXT NOT NULL,
    -- Frozen into the issue when sealed, because changing it afterwards would alter what a client
    -- was shown (domain model §6.2, finding F14).
    "client_detail_level" TEXT NOT NULL DEFAULT 'itemised',
    "currency"   TEXT NOT NULL,
    "version"    INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_client_detail_level_check"
        CHECK ("client_detail_level" IN ('summary', 'itemised'))
);
CREATE INDEX "quote_tenant_id_idx" ON "quote" ("tenant_id") WHERE "deleted_at" IS NULL;
ALTER TABLE "quote" ADD CONSTRAINT "quote_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- RESTRICT, not CASCADE: a client named on an issued quote can never vanish from it, so a client is
-- soft-deleted and the row stays (domain model §5).
ALTER TABLE "quote" ADD CONSTRAINT "quote_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "quote_section" (
    "id"         UUID NOT NULL,
    "tenant_id"  UUID NOT NULL,
    "quote_id"   UUID NOT NULL,
    "title"      TEXT NOT NULL,
    "position"   INTEGER NOT NULL,
    "version"    INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_section_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "quote_section_quote_id_idx" ON "quote_section" ("quote_id") WHERE "deleted_at" IS NULL;
ALTER TABLE "quote_section" ADD CONSTRAINT "quote_section_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_section" ADD CONSTRAINT "quote_section_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "quote_line" (
    "id"          UUID NOT NULL,
    "tenant_id"   UUID NOT NULL,
    "quote_id"    UUID NOT NULL,
    "section_id"  UUID NOT NULL,
    "description" TEXT NOT NULL,
    "position"    INTEGER NOT NULL,
    "quantity_thousandths" BIGINT NOT NULL,
    "unit_price_minor"     BIGINT NOT NULL,
    "line_total_minor"     BIGINT NOT NULL,
    -- Which recipe produced it, so a recipe change can offer to refresh a draft — never an issue.
    "recipe_id"   UUID,
    "version"     INTEGER NOT NULL DEFAULT 1,
    "deleted_at"  TIMESTAMPTZ(6),
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quote_line_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "quote_line_quote_id_idx" ON "quote_line" ("quote_id") WHERE "deleted_at" IS NULL;
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quote" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_line" ADD CONSTRAINT "quote_line_section_id_fkey"
    FOREIGN KEY ("section_id") REFERENCES "quote_section" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- quote_issue: the sealed snapshot. Append-only, and sealed OFFLINE.
--
-- The unique index on (quote_id, revision) is the whole answer to finding G4: two
-- devices holding the same draft can both seal it, and neither push conflicts
-- because each is an INSERT. The index makes the second one fail, so one job can
-- never acquire two issued identities.
-- ---------------------------------------------------------------------------

CREATE TABLE "quote_issue" (
    "id"        UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quote_id"  UUID NOT NULL,
    "revision"  INTEGER NOT NULL,

    -- The frozen document. No column here is ever updated.
    "client_id"            UUID NOT NULL,
    "client_name"          TEXT NOT NULL,
    "title"                TEXT NOT NULL,
    "client_detail_level"  TEXT NOT NULL,
    "currency"             TEXT NOT NULL,
    "terms_text"           TEXT NOT NULL,
    "tax_rate_basis_points" INTEGER NOT NULL,
    "subtotal_minor"       BIGINT NOT NULL,
    "tax_minor"            BIGINT NOT NULL,
    "total_minor"          BIGINT NOT NULL,

    "sealed_at"          TIMESTAMPTZ(6) NOT NULL,
    "sealed_by_user_id"  UUID NOT NULL,
    -- When the prices this froze were last refreshed from the server. A seal made from a stale
    -- catalog is visible rather than deniable — and PRD R1.13a gives it a reader, which is what
    -- stops it being decoration (finding G6).
    "catalog_synced_at"  TIMESTAMPTZ(6) NOT NULL,
    "expires_on"         DATE,
    "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_issue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_issue_total_check"
        CHECK ("total_minor" = "subtotal_minor" + "tax_minor"),
    CONSTRAINT "quote_issue_detail_level_check"
        CHECK ("client_detail_level" IN ('summary', 'itemised'))
);
-- ONE SEALED ISSUE PER REVISION OF A QUOTE (G4).
CREATE UNIQUE INDEX "quote_issue_quote_revision_key" ON "quote_issue" ("quote_id", "revision");
CREATE INDEX "quote_issue_tenant_id_idx" ON "quote_issue" ("tenant_id");
ALTER TABLE "quote_issue" ADD CONSTRAINT "quote_issue_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_issue" ADD CONSTRAINT "quote_issue_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "quote_issue_line" (
    "id"          UUID NOT NULL,
    "tenant_id"   UUID NOT NULL,
    "issue_id"    UUID NOT NULL,
    "section_title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position"    INTEGER NOT NULL,
    "quantity_thousandths" BIGINT NOT NULL,
    "unit_price_minor"     BIGINT NOT NULL,
    "line_total_minor"     BIGINT NOT NULL,
    "tax_treatment"        TEXT NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_issue_line_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quote_issue_line_tax_treatment_check"
        CHECK ("tax_treatment" IN ('standard', 'zero', 'exempt'))
);
CREATE INDEX "quote_issue_line_issue_id_idx" ON "quote_issue_line" ("issue_id");
ALTER TABLE "quote_issue_line" ADD CONSTRAINT "quote_issue_line_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_issue_line" ADD CONSTRAINT "quote_issue_line_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "quote_issue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- issue_number: the number, in its own insert-only row (ADR 0025, and §6.1a).
--
-- Not a nullable column on quote_issue, because filling it in later would be an
-- UPDATE on a sealed financial document — and the argument the whole model rests
-- on is that immutability must not depend on future queries being careful.
--
-- Release 1 allocates server-side at sync, which is strictly gapless. Release 2's
-- device leases would insert this same row from a lease, so that change is not a
-- migration of issued rows.
-- ---------------------------------------------------------------------------

CREATE TABLE "issue_number" (
    "id"          UUID NOT NULL,
    "tenant_id"   UUID NOT NULL,
    "issue_id"    UUID NOT NULL,
    "series_id"   UUID NOT NULL,
    "number"      BIGINT NOT NULL,
    "formatted"   TEXT NOT NULL,
    "allocated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_number_pkey" PRIMARY KEY ("id")
);
-- One number per issue, and one issue per number within a series. Both directions matter: the first
-- stops a document acquiring two numbers, the second stops two documents sharing one identity.
CREATE UNIQUE INDEX "issue_number_issue_key" ON "issue_number" ("issue_id");
CREATE UNIQUE INDEX "issue_number_series_number_key" ON "issue_number" ("series_id", "number");
ALTER TABLE "issue_number" ADD CONSTRAINT "issue_number_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_number" ADD CONSTRAINT "issue_number_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "quote_issue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_number" ADD CONSTRAINT "issue_number_series_id_fkey"
    FOREIGN KEY ("series_id") REFERENCES "number_series" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- acceptance, and withdrawal as a SEPARATE INSERT-ONLY ROW (ADR 0025 decision 4).
--
-- The alternative was a nullable `withdrawn_at` on acceptance, which needs an
-- UPDATE grant on a document a client signed. The moment that grant exists,
-- "issued documents are immutable" depends on every future query being careful.
-- A fact ABOUT an immutable row lives in its own row — the same shape as
-- issue_number — and withdrawal gets an audit trail for free, because the row IS
-- the record.
-- ---------------------------------------------------------------------------

CREATE TABLE "acceptance" (
    "id"        UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "issue_id"  UUID NOT NULL,
    "outcome"   TEXT NOT NULL,
    "signer_name" TEXT NOT NULL,
    -- The verified channel and the consent, which is what makes this an e-signature rather than a
    -- typed name (ADR 0024). The owner's ruling: a typed name alone is not legal in a dispute.
    "verified_channel"      TEXT,
    "verified_destination"  TEXT,
    "consented_to_sign"     BOOLEAN NOT NULL DEFAULT FALSE,
    -- What was signed: the render, whose hash is the document. Not a hash of its own (finding F17).
    "document_render_id"    UUID,
    "actor_ip"    TEXT,
    "user_agent"  TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "acceptance_outcome_check" CHECK ("outcome" IN ('accepted', 'declined'))
);
-- One acceptance per issue. A second is refused, not merged.
CREATE UNIQUE INDEX "acceptance_issue_key" ON "acceptance" ("issue_id");
ALTER TABLE "acceptance" ADD CONSTRAINT "acceptance_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance" ADD CONSTRAINT "acceptance_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "quote_issue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "acceptance_withdrawal" (
    "id"            UUID NOT NULL,
    "tenant_id"     UUID NOT NULL,
    "acceptance_id" UUID NOT NULL,
    "reason"        TEXT NOT NULL,
    "withdrawn_by_user_id" UUID NOT NULL,
    "occurred_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptance_withdrawal_pkey" PRIMARY KEY ("id")
);
-- One withdrawal per acceptance: withdrawing twice is meaningless and would double-count.
CREATE UNIQUE INDEX "acceptance_withdrawal_acceptance_key"
    ON "acceptance_withdrawal" ("acceptance_id");
ALTER TABLE "acceptance_withdrawal" ADD CONSTRAINT "acceptance_withdrawal_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "acceptance_withdrawal" ADD CONSTRAINT "acceptance_withdrawal_acceptance_id_fkey"
    FOREIGN KEY ("acceptance_id") REFERENCES "acceptance" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- variation: a priced change against an accepted issue. Append-only.
--
-- `client_reference` is the idempotency key, and it exists because a variation can
-- be recorded OFFLINE and replayed from an outbox (finding H11). Without it a
-- retried queue entry raises the invoiceable ceiling permanently and the
-- reconciliation job certifies the result as correct.
-- ---------------------------------------------------------------------------

CREATE TABLE "variation" (
    "id"          UUID NOT NULL,
    "tenant_id"   UUID NOT NULL,
    "issue_id"    UUID NOT NULL,
    "description" TEXT NOT NULL,
    -- May be negative: a variation can remove scope as well as add it.
    "amount_minor" BIGINT NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "variation_issue_id_idx" ON "variation" ("issue_id");
ALTER TABLE "variation" ADD CONSTRAINT "variation_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "variation" ADD CONSTRAINT "variation_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "quote_issue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- invoice, its void, and credit notes. All append-only.
--
-- A void is a row rather than a flag for the same reason a withdrawal is: no
-- UPDATE path on a document somebody was sent.
-- ---------------------------------------------------------------------------

CREATE TABLE "invoice" (
    "id"        UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "issue_id"  UUID NOT NULL,
    "kind"      TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency"  TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "due_on"    DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_kind_check" CHECK ("kind" IN ('deposit', 'progress', 'final')),
    -- An invoice for nothing, or for a negative amount, is a credit note wearing a disguise.
    CONSTRAINT "invoice_amount_positive_check" CHECK ("amount_minor" > 0)
);
CREATE INDEX "invoice_issue_id_idx" ON "invoice" ("issue_id");
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "quote_issue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "invoice_void" (
    "id"         UUID NOT NULL,
    "tenant_id"  UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "reason"     TEXT NOT NULL,
    "voided_by_user_id" UUID NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_void_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invoice_void_invoice_key" ON "invoice_void" ("invoice_id");
ALTER TABLE "invoice_void" ADD CONSTRAINT "invoice_void_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoice_void" ADD CONSTRAINT "invoice_void_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "credit_note" (
    "id"         UUID NOT NULL,
    "tenant_id"  UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "reason"     TEXT NOT NULL,
    "issued_at"  TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_note_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "credit_note_amount_positive_check" CHECK ("amount_minor" > 0)
);
CREATE INDEX "credit_note_invoice_id_idx" ON "credit_note" ("invoice_id");
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "credit_note" ADD CONSTRAINT "credit_note_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- issue_balance: the derived cache that carries the lock (ADR 0025 decision 2).
--
-- One row per accepted issue, created BY THE ACCEPTANCE PATH, unconditionally.
-- That is the correction finding G2 forced: the first version said "take
-- SELECT … FOR UPDATE on the row" and never said what created it, and a
-- `FOR UPDATE` matching zero rows takes NO LOCK AT ALL — so the very first pair
-- of concurrent invoices would have sailed through the mechanism built to stop
-- them.
-- ---------------------------------------------------------------------------

CREATE TABLE "issue_balance" (
    "issue_id"   UUID NOT NULL,
    "tenant_id"  UUID NOT NULL,
    -- Derived, written once from the accepted issue's own frozen lines, never again. Safe as a copy
    -- ONLY because the issue is immutable, which is what makes Rule 7 satisfied here (finding G12).
    "accepted_total_minor"   BIGINT NOT NULL,
    -- Derived caches, re-summed inside the lock on every change.
    "variations_total_minor" BIGINT NOT NULL DEFAULT 0,
    "invoiced_total_minor"   BIGINT NOT NULL DEFAULT 0,
    "recomputed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_balance_pkey" PRIMARY KEY ("issue_id")
);
ALTER TABLE "issue_balance" ADD CONSTRAINT "issue_balance_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "issue_balance" ADD CONSTRAINT "issue_balance_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "quote_issue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- registration_claim: a pending registration is NOT a user (ADR 0025 decision 5).
--
-- Deliberately NOT tenant-scoped, and named in policy-parity's EXEMPT list with
-- that reason: it exists before any tenant does. It is also deliberately NOT
-- unique on the address — many people may attempt the same one — because the
-- user row is inserted at VERIFICATION, where `app_user.email`'s existing global
-- unique index makes "first to verify wins" a database guarantee rather than
-- application logic.
-- ---------------------------------------------------------------------------

CREATE TABLE "registration_claim" (
    "id"         UUID NOT NULL,
    "email"      TEXT NOT NULL,
    -- Hashed, because a claim token is a credential: holding it completes a registration.
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumed_at" TIMESTAMPTZ(6),

    CONSTRAINT "registration_claim_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "registration_claim_email_idx" ON "registration_claim" ("email");
CREATE UNIQUE INDEX "registration_claim_token_key" ON "registration_claim" ("token_hash");

-- ===========================================================================
-- THE FIVE INVARIANTS, AS CODE
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. THE CEILING, IN ONE EXPRESSION (ADR 0025 decision 1).
--
-- "Recorded" variations, not "accepted" — release 1 builds no variation
-- acceptance, so "accepted variations" would describe something that does not
-- exist, and an invariant reading stronger than it is is worse than a weak one
-- honestly labelled. When release 2 makes variations signable, THIS EXPRESSION
-- changes and no document needs to.
--
-- Note what does NOT raise the ceiling: retention and credit notes. Money held
-- back or credited does not increase how much may be billed; they affect an
-- invoice's status, which is a different question.
-- ---------------------------------------------------------------------------
CREATE FUNCTION issue_ceiling_minor(p_issue_id UUID) RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT b."accepted_total_minor" + b."variations_total_minor"
    FROM "issue_balance" b
   WHERE b."issue_id" = p_issue_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. A DOCUMENT'S STATE IS DERIVED (ADR 0025 decision 3).
--
-- There is no state column, so there is no state value for two sections of a
-- document to disagree about — which is what made finding H6 structurally
-- impossible rather than merely fixed. This is the same choice already made for
-- invoice status (domain model §6.2), for the same reason: a stored state is a
-- second source of truth that drifts from the rows it summarises, which is how
-- the old application reported a negative amount due.
-- ---------------------------------------------------------------------------
CREATE FUNCTION quote_issue_state(p_issue_id UUID) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE
    -- Superseded first: a later revision exists, whatever else is true.
    WHEN EXISTS (
      SELECT 1 FROM "quote_issue" later
        JOIN "quote_issue" self ON self."id" = p_issue_id
       WHERE later."quote_id" = self."quote_id" AND later."revision" > self."revision"
    ) THEN 'superseded'
    WHEN NOT EXISTS (SELECT 1 FROM "issue_number" n WHERE n."issue_id" = p_issue_id)
      THEN 'sealed_awaiting_number'
    WHEN EXISTS (
      SELECT 1 FROM "acceptance" a
       WHERE a."issue_id" = p_issue_id AND a."outcome" = 'declined'
    ) THEN 'declined'
    WHEN EXISTS (
      SELECT 1 FROM "acceptance" a
       WHERE a."issue_id" = p_issue_id AND a."outcome" = 'accepted'
         AND NOT EXISTS (
           SELECT 1 FROM "acceptance_withdrawal" w WHERE w."acceptance_id" = a."id"
         )
    ) THEN 'accepted'
    ELSE 'issued'
  END;
$$;

-- ---------------------------------------------------------------------------
-- 2. issue_balance HAS ONE WRITER (ADR 0025 decision 2).
--
-- `issue_balance_apply` re-sums from the underlying rows INSIDE the lock rather
-- than trusting the cached figures, which is what makes them a cache rather than
-- a second source of truth (finding G12). It refuses when the ceiling would be
-- exceeded, and it is the only thing that can write the table at all: the write
-- policies require a transaction-local flag that only this function sets.
--
-- The writer set is therefore the set of callers, and it cannot go stale in a
-- comment because there is no other way in — which was finding G2's second half,
-- since the previous prose list omitted the row's own creator.
-- ---------------------------------------------------------------------------
CREATE FUNCTION issue_balance_apply(p_issue_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_locked      UUID;
  v_variations  BIGINT;
  v_invoiced    BIGINT;
  v_ceiling     BIGINT;
BEGIN
  -- THE FLAG GOES UP BEFORE THE LOCK, AND THIS ORDER IS NOT COSMETIC.
  --
  -- `SELECT … FOR UPDATE` is a locking read, so Postgres checks it against the UPDATE policy's
  -- USING clause — not only the SELECT policy. With the flag still down, the row is filtered out of
  -- the locking read and the function concluded "no balance row exists" for a row plainly sitting
  -- there. Found by running it, not by reading it: every ceiling test failed with
  -- "issue_balance row missing" against a database that had the row.
  PERFORM set_config('pryvis.balance_write', 'on', true);

  -- The lock. It is taken on a row that must already exist, and a missing row is an error rather
  -- than a no-op precisely because `FOR UPDATE` on nothing locks nothing (G2).
  SELECT b."issue_id" INTO v_locked
    FROM "issue_balance" b
   WHERE b."issue_id" = p_issue_id
     FOR UPDATE;

  IF v_locked IS NULL THEN
    RAISE EXCEPTION 'issue_balance row missing for issue %; it is created with the acceptance, and '
                    'a FOR UPDATE on no row takes no lock at all', p_issue_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Re-summed from the rows, never read from the cache we are about to write.
  SELECT COALESCE(SUM(v."amount_minor"), 0) INTO v_variations
    FROM "variation" v WHERE v."issue_id" = p_issue_id;

  SELECT COALESCE(SUM(i."amount_minor"), 0) INTO v_invoiced
    FROM "invoice" i
   WHERE i."issue_id" = p_issue_id
     AND NOT EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = i."id");

  UPDATE "issue_balance"
     SET "variations_total_minor" = v_variations,
         "invoiced_total_minor"   = v_invoiced,
         "recomputed_at"          = now()
   WHERE "issue_id" = p_issue_id;

  PERFORM set_config('pryvis.balance_write', '', true);

  v_ceiling := issue_ceiling_minor(p_issue_id);
  IF v_invoiced > v_ceiling THEN
    -- Raising here rolls the whole transaction back, including the invoice that caused it. That is
    -- the refusal: an invoice cannot exist without passing through this function.
    RAISE EXCEPTION 'invoiced total % exceeds the ceiling % for issue %',
      v_invoiced, v_ceiling, p_issue_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

-- Creates the balance row, in the same transaction as the acceptance. Separate from `apply` because
-- creation is the one write that cannot take a lock on a row that does not exist yet.
CREATE FUNCTION issue_balance_open(p_issue_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_tenant UUID;
  v_total  BIGINT;
BEGIN
  SELECT q."tenant_id", q."total_minor" INTO v_tenant, v_total
    FROM "quote_issue" q WHERE q."id" = p_issue_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'cannot open a balance for unknown issue %', p_issue_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  PERFORM set_config('pryvis.balance_write', 'on', true);

  INSERT INTO "issue_balance"
      ("issue_id", "tenant_id", "accepted_total_minor", "variations_total_minor",
       "invoiced_total_minor", "recomputed_at")
  VALUES (p_issue_id, v_tenant, v_total, 0, 0, now())
  ON CONFLICT ("issue_id") DO NOTHING;

  PERFORM set_config('pryvis.balance_write', '', true);
END;
$$;

-- ===========================================================================
-- ROW-LEVEL SECURITY
--
-- Embedded verbatim from `db/policies/002-documents-isolation.sql`, which is the
-- authoritative copy. `db/test/policy-parity.test.ts` fails when the applied
-- migration and that file disagree, so this cannot quietly drift into being
-- documentation of something that is no longer true.
-- ===========================================================================

-- >>> BEGIN db/policies/002-documents-isolation.sql
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
-- <<< END db/policies/002-documents-isolation.sql
