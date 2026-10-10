-- The acceptance grade, the evidence it is derived from, and the bar frozen at seal (findings J6, J7,
-- J8; design `docs/design/acceptance-grade.md`, every recommendation approved by the owner 2026-10-01).
--
-- ## WHAT CHANGES
--
-- 1. `acceptance_evidence`, append-only. Each row carries a KIND, never a grade: 'tenant_recorded',
--    'signed_copy_uploaded', 'link_tap', 'code_verified', 'inbound_reply', 'deposit_paid'. The grade a
--    kind is worth lives in ONE place, `acceptance_grade()`, so the retired grade 5 cannot be asserted
--    (no kind maps to it) and re-grading a kind is a reviewed function change, never a data change.
-- 2. Evidence attaches ONLY to an accepted, unwithdrawn acceptance (D2, D3). A decline carries none, so
--    "a deposit against a decline" (J6) cannot be represented at all.
-- 3. Every accepted acceptance has its first evidence row — the act itself, a link tap, a verified code
--    or the tenant's record — written in the same transaction and required at COMMIT. One combining rule,
--    and no second source of the grade.
-- 4. A third party's event is recorded once, ever: unique `(source, external_id)` across all tenants,
--    where an external id is present (D4; J7). The same lesson, and the same shape, as
--    `variation_issue_client_reference_key` (M18): a provider retries a webhook it thinks was missed, and
--    an append-only duplicate could never be removed. It covers a deposit's payment notice as well as a
--    client's reply, because both arrive the same way.
-- 5. `acceptance_grade(issue)` is the HIGHEST grade among the evidence on the issue's accepted acceptance
--    (D1), and NULL when there is no acceptance or it was withdrawn (D3; the state reads "withdrawn").
--    `acceptance_meets_bar(issue)` compares it with the issue's frozen bar.
-- 6. The bar is frozen at seal (J8; Rule 6): `quote_issue.acceptance_bar_grade`, resolved by the
--    database from the quote's own bar, else the tenant's `document_settings` default, else 3 (the
--    owner's default of 2026-09-26). A seal may omit it; a seal that states a DIFFERENT bar is refused,
--    so the only way to choose a bar is on the quote before it is sealed. It does not gate invoicing
--    (D6): the ceiling still unlocks on any accepted, unwithdrawn acceptance, as built. The bar decides
--    whether the product may call the acceptance "accepted to your standard".
-- 7. `document_settings`, minimal (D7): the default bar and the deposit-suggestion threshold.
--
-- ## WHY THE PER-ISSUE LOCK, AND THE WITHDRAWAL TAKING IT TOO
--
-- "No evidence on a withdrawn acceptance" reads `acceptance_withdrawal`. Evidence and withdrawal both take
-- the per-quote lock SHARED, so neither waits for the other, and each could miss the other's uncommitted
-- row. So both now take the per-issue lock J13's response trigger takes — the same two keys — after the
-- quote lock, then re-read. Order everywhere: quote lock, then issue lock, and nothing takes them the
-- other way round, so no new deadlock shape; the existing one (writes on two issues of one quote, in
-- opposite orders) now includes evidence (`new-app/CLAUDE.md`).
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It cannot tell a webhook from the application. The application role can insert 'deposit_paid' or
--   'inbound_reply' with an invented external id; only the privilege model owed with R5 (and J14,
--   `docs/THREAT-MODEL.md` §4f) can confine those kinds to the paths that receive the provider's call.
--   Until then a grade of 4 or 6 is only as good as the code that writes it.
-- - Nothing writes 'inbound_reply' (no inbound mail or WhatsApp; deferred) or 'deposit_paid' (payments
--   are not built; R1.23). They have kinds and a key, and no writer.
-- - 'signed_copy_uploaded' records that a copy is on file; the reference to the uploaded file waits for
--   the storage decision (`docs/SERVICE-REGISTER.md` §3a).
-- - No reply address is stored. It is derived from the issue id when inbound mail exists, and release-1
--   quotes keep the tenant's own reply address, so they never earn grade 4 (design D5).
-- - It does not check that a 'code_verified' row matches the acceptance's verified channel; that is the
--   one-time-code flow's, not built.
-- - The cross-tenant key can refuse a row because ANOTHER tenant recorded the same provider id. Provider
--   ids are unguessable, so it reveals nothing practical; recorded rather than hidden.

-- ---------------------------------------------------------------------------
-- 1. The tenant's document settings: the default bar and the deposit threshold.
-- ---------------------------------------------------------------------------
CREATE TABLE "document_settings" (
    "tenant_id" UUID NOT NULL,
    "default_acceptance_bar_grade" INTEGER NOT NULL DEFAULT 3,
    -- A deposit is SUGGESTED (never required) when a quote's total is above this; NULL means never.
    "deposit_suggested_above_minor" BIGINT,
    -- Two devices may edit the settings at once; the row convention's optimistic version.
    "version"    INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_settings_pkey" PRIMARY KEY ("tenant_id"),
    CONSTRAINT "document_settings_bar_check" CHECK ("default_acceptance_bar_grade" IN (2, 3, 6)),
    CONSTRAINT "document_settings_deposit_threshold_check"
        CHECK ("deposit_suggested_above_minor" IS NULL
               OR "deposit_suggested_above_minor" BETWEEN 1 AND 99999999999)
);
ALTER TABLE "document_settings" ADD CONSTRAINT "document_settings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2. The bar: chosen on the quote, frozen on the issue.
-- ---------------------------------------------------------------------------
-- NULL on the quote means "the tenant's default".
ALTER TABLE "quote" ADD COLUMN "acceptance_bar_grade" INTEGER;
ALTER TABLE "quote" ADD CONSTRAINT "quote_acceptance_bar_check"
    CHECK ("acceptance_bar_grade" IS NULL OR "acceptance_bar_grade" IN (2, 3, 6));

-- No default: the resolving trigger below fills it, and NOT NULL is checked after BEFORE triggers.
ALTER TABLE "quote_issue" ADD COLUMN "acceptance_bar_grade" INTEGER NOT NULL;
ALTER TABLE "quote_issue" ADD CONSTRAINT "quote_issue_acceptance_bar_check"
    CHECK ("acceptance_bar_grade" IN (2, 3, 6));

CREATE FUNCTION quote_issue_resolve_bar() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_bar INTEGER;
BEGIN
  SELECT COALESCE(
           q."acceptance_bar_grade",
           (SELECT s."default_acceptance_bar_grade" FROM "document_settings" s
             WHERE s."tenant_id" = NEW."tenant_id"),
           3)
    INTO v_bar
    FROM "quote" q WHERE q."id" = NEW."quote_id";
  -- A quote this session cannot see resolves to nothing; its composite key refuses the seal anyway.
  v_bar := COALESCE(v_bar, 3);

  IF NEW."acceptance_bar_grade" IS NOT NULL AND NEW."acceptance_bar_grade" <> v_bar THEN
    RAISE EXCEPTION 'quote_issue states acceptance bar %, but the quote and the tenant''s settings resolve '
                    'to %; the bar is chosen on the quote before sealing, never at the seal',
                    NEW."acceptance_bar_grade", v_bar
      USING ERRCODE = 'check_violation';
  END IF;
  NEW."acceptance_bar_grade" := v_bar;
  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_issue_resolve_bar
  BEFORE INSERT ON "quote_issue"
  FOR EACH ROW EXECUTE FUNCTION quote_issue_resolve_bar();

-- ---------------------------------------------------------------------------
-- 3. The evidence.
-- ---------------------------------------------------------------------------
CREATE TABLE "acceptance_evidence" (
    "id"            UUID NOT NULL,
    "tenant_id"     UUID NOT NULL,
    "acceptance_id" UUID NOT NULL,
    "kind"          TEXT NOT NULL,
    -- A third party's event: who sent it ('email', 'whatsapp', 'wipay', 'bank') and its own id for it.
    "source"          TEXT,
    "external_id"     TEXT,
    -- The sender as the provider reported it, and when the provider says it arrived (J7's preparation).
    "provider_sender" TEXT,
    "received_at"     TIMESTAMPTZ(6),
    -- Who in the tenant recorded it, for the kinds a person records.
    "recorded_by_user_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptance_evidence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "acceptance_evidence_kind_check" CHECK ("kind" IN (
        'tenant_recorded', 'signed_copy_uploaded', 'link_tap', 'code_verified', 'inbound_reply',
        'deposit_paid')),
    -- A source and its id come together or not at all.
    CONSTRAINT "acceptance_evidence_source_pair_check"
        CHECK (("source" IS NULL) = ("external_id" IS NULL)),
    -- The kinds a third party witnesses carry that party's id for the event — without it the row is
    -- just someone saying so. (The id is still only as good as the code that writes it; see above.)
    CONSTRAINT "acceptance_evidence_witnessed_check"
        CHECK ("kind" NOT IN ('inbound_reply', 'deposit_paid') OR "external_id" IS NOT NULL),
    -- The kinds a person in the tenant records name that person.
    CONSTRAINT "acceptance_evidence_recorded_by_check"
        CHECK ("kind" NOT IN ('tenant_recorded', 'signed_copy_uploaded') OR "recorded_by_user_id" IS NOT NULL)
);
CREATE INDEX "acceptance_evidence_acceptance_idx" ON "acceptance_evidence" ("tenant_id", "acceptance_id");
-- J7: one row per provider event, ever, across every tenant.
CREATE UNIQUE INDEX "acceptance_evidence_source_external_id_key"
    ON "acceptance_evidence" ("source", "external_id") WHERE "external_id" IS NOT NULL;
ALTER TABLE "acceptance_evidence" ADD CONSTRAINT "acceptance_evidence_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "acceptance_evidence" ADD CONSTRAINT "acceptance_evidence_acceptance_id_fkey"
    FOREIGN KEY ("acceptance_id", "tenant_id") REFERENCES "acceptance" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "acceptance_evidence" ADD CONSTRAINT "acceptance_evidence_recorded_by_user_id_fkey"
    FOREIGN KEY ("recorded_by_user_id", "tenant_id") REFERENCES "app_user" ("id", "tenant_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- 4. The per-issue lock, one definition. The SAME two keys `acceptance_response_rules()` takes inline
--    (20260927160000_acceptance_responses), so responses, evidence and withdrawal serialise per issue.
-- ---------------------------------------------------------------------------
CREATE FUNCTION acceptance_issue_lock(p_issue_id UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_hash TEXT := md5('acceptance-response:' || p_issue_id::text);
BEGIN
  PERFORM pg_advisory_xact_lock(
    ('x' || substr(v_hash, 1, 8))::bit(32)::integer,
    ('x' || substr(v_hash, 9, 8))::bit(32)::integer
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Evidence only on an accepted, unwithdrawn acceptance.
--    AFTER, not BEFORE: an acceptance and its first evidence row are often one statement (a CTE), and
--    an AFTER ROW trigger runs once the whole statement has, so it sees the acceptance it hangs off.
-- ---------------------------------------------------------------------------
CREATE FUNCTION acceptance_evidence_rules() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id UUID;
BEGIN
  SELECT a."issue_id" INTO v_issue_id FROM "acceptance" a WHERE a."id" = NEW."acceptance_id";
  -- Not visible: the composite key refuses the row on its own.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  PERFORM quote_money_lock_for_issue(v_issue_id);
  PERFORM acceptance_issue_lock(v_issue_id);

  -- New statements after the waits, so under READ COMMITTED they see a withdrawal that committed while
  -- this one waited (the quote lock refuses any other isolation level).
  IF NOT EXISTS (SELECT 1 FROM "acceptance" a
                  WHERE a."id" = NEW."acceptance_id" AND a."outcome" = 'accepted') THEN
    RAISE EXCEPTION 'evidence attaches only to an acceptance; response % is a decline, which carries '
                    'no evidence (finding J6)', NEW."acceptance_id"
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM "acceptance_withdrawal" w WHERE w."acceptance_id" = NEW."acceptance_id") THEN
    RAISE EXCEPTION 'acceptance % has been withdrawn; it takes no further evidence and has no grade',
                    NEW."acceptance_id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER acceptance_evidence_rules
  AFTER INSERT ON "acceptance_evidence"
  FOR EACH ROW EXECUTE FUNCTION acceptance_evidence_rules();

-- ---------------------------------------------------------------------------
-- 6. Every accepted acceptance has evidence, checked at COMMIT.
-- ---------------------------------------------------------------------------
CREATE FUNCTION acceptance_has_evidence() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."outcome" = 'accepted'
     AND NOT EXISTS (SELECT 1 FROM "acceptance_evidence" e WHERE e."acceptance_id" = NEW."id") THEN
    RAISE EXCEPTION 'acceptance % has no evidence; the act of accepting (a link tap, a verified code or '
                    'the business''s own record) is written with it, in the same transaction', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "acceptance_has_evidence"
  AFTER INSERT ON "acceptance"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION acceptance_has_evidence();

-- ---------------------------------------------------------------------------
-- 7. The withdrawal takes the per-issue lock too. Otherwise unchanged from
--    `20260927160000_acceptance_responses`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acceptance_withdrawal_guard() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id UUID;
  v_outcome  TEXT;
  v_billed   BIGINT;
BEGIN
  SELECT a."issue_id", a."outcome" INTO v_issue_id, v_outcome
    FROM "acceptance" a WHERE a."id" = NEW."acceptance_id";

  IF v_outcome IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'only an acceptance can be withdrawn; response % is a %', NEW."acceptance_id",
      coalesce(v_outcome, 'response this session cannot see')
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM quote_money_lock_for_issue(v_issue_id);
  -- After the quote lock, as everywhere: serialises against evidence arriving for this acceptance.
  PERFORM acceptance_issue_lock(v_issue_id);

  IF EXISTS (SELECT 1 FROM "issue_balance" b WHERE b."issue_id" = v_issue_id) THEN
    PERFORM issue_balance_apply(v_issue_id);
  END IF;

  SELECT count(*) INTO v_billed
    FROM "invoice" i
   WHERE i."issue_id" = v_issue_id
     AND NOT EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = i."id")
     AND i."amount_minor"
         > (SELECT COALESCE(SUM(c."amount_minor"), 0) FROM "credit_note" c WHERE c."invoice_id" = i."id");

  IF v_billed > 0 THEN
    RAISE EXCEPTION
      'cannot withdraw this acceptance: % invoice(s) against the issue still have money billed. The '
      'remedy for a wrong document is a credit note and a fresh quote: void or fully credit each '
      'invoice, then withdraw, then issue the next revision', v_billed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. The grade, and whether it meets the bar. One definition each.
-- ---------------------------------------------------------------------------
CREATE FUNCTION acceptance_grade(p_issue_id UUID) RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT CASE
    -- Withdrawn first: the evidence stays as history, but a retracted acceptance is worth nothing (D3).
    WHEN EXISTS (
      SELECT 1 FROM "acceptance" a
        JOIN "acceptance_withdrawal" w ON w."acceptance_id" = a."id"
       WHERE a."issue_id" = p_issue_id AND a."outcome" = 'accepted'
    ) THEN NULL
    -- Otherwise the HIGHEST grade among the accepted acceptance's evidence (D1): a weaker later row
    -- never lowers a stronger one. No accepted acceptance, no rows, NULL.
    ELSE (
      SELECT max(CASE e."kind"
                   WHEN 'tenant_recorded'      THEN 1  -- witnessed by nobody
                   WHEN 'signed_copy_uploaded' THEN 1  -- from the tenant's device: nobody (J5)
                   WHEN 'link_tap'             THEN 2  -- possession of a link
                   WHEN 'code_verified'        THEN 3  -- the channel holder
                   WHEN 'inbound_reply'        THEN 4  -- Google or Meta
                   -- 5 is retired (J5) and no kind may ever map to it.
                   WHEN 'deposit_paid'         THEN 6  -- the bank or WiPay
                 END)
        FROM "acceptance_evidence" e
        JOIN "acceptance" a ON a."id" = e."acceptance_id"
       WHERE a."issue_id" = p_issue_id AND a."outcome" = 'accepted'
    )
  END;
$$;

CREATE FUNCTION acceptance_meets_bar(p_issue_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
  -- NULL when there is no grade (no acceptance, or withdrawn): "not accepted" is not "below the bar".
  SELECT acceptance_grade(p_issue_id) >= i."acceptance_bar_grade"
    FROM "quote_issue" i WHERE i."id" = p_issue_id;
$$;

-- ---------------------------------------------------------------------------
-- 9. Row-level security.
-- ---------------------------------------------------------------------------
-- >>> BEGIN db/policies/005-acceptance-grade.sql
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
-- <<< END db/policies/005-acceptance-grade.sql
