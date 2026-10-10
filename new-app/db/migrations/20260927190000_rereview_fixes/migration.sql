-- The fixes for the adversarial re-review of J6, J7 and J8 (findings W1-W12) and for W13, which W1's
-- mechanism exposed in J11. The owner's decisions, 2026-10-01: a per-tenant evidence key (D4 reversed);
-- the withdrawal deadlock documented as a shape, a withdrawal alone in its transaction; superseded and
-- unnumbered issues refuse responses and evidence, and a superseded issue has no grade; and no deployed or
-- shared database holds a sealed quote (W8).
--
-- ## WHAT CHANGES
--
-- 1. W13, W1 — A CHECK THAT CANNOT SEE ITS ROW REFUSES; IT NEVER SKIPS. Two triggers run AFTER the row is
--    written — J11's subtotal check at COMMIT, J6's evidence rules at the end of the statement — and both
--    skipped a row they could not see. Row security makes "cannot see" something the WRITER controls: a
--    `RETURNING set_config('app.tenant_id', '', false)`, or a `SELECT set_config('app.tenant_id', '', false)` before COMMIT, clears the tenant
--    after the row has passed its own policy and before the check runs. Executed on PostgreSQL 16: evidence
--    on a decline committed (W1), and an issue of subtotal 999999 with NO lines was sealed (W13). Both now
--    raise. Nothing legitimate is refused: in the application's tenant scope (`api/src/core/tenancy/`) the tenant is set for the whole
--    transaction, and a row whose parent truly belongs to another tenant is refused by its composite key,
--    which fires first (RI triggers sort before these names).
--    The other row-reading triggers were checked for the same shape: the ceiling path already raises when it
--    cannot see its balance row or invoice (`issue_balance_enforce`, `issue_balance_apply`), and the BEFORE
--    triggers run before the row's own policy check, so a tenant cleared earlier fails that check instead.
-- 2. W4 — A SUPERSEDED OR UNNUMBERED ISSUE TAKES NO RESPONSE AND NO EVIDENCE (this is also the "refuse
--    responses on superseded or unnumbered issues" item the owner approved earlier). A superseded issue has
--    no grade: its ceiling is already 0, and an acceptance replaced by a later revision is worth nothing
--    toward billing, as a withdrawn one is (D3). Checked after the locks, so a seal or a number committing
--    meanwhile is seen.
-- 3. W5, W6 — THE EVIDENCE COLUMNS SAY WHAT THEY MEAN. Only a third party's kinds ('inbound_reply',
--    'deposit_paid') may carry a source and an id, so a grade-1 row can no longer occupy a provider event's
--    slot. The source is one of a fixed list. An id is non-empty with no surrounding spaces. Case is kept:
--    provider ids are case-sensitive, so folding it would merge two real events.
-- 4. W7 — THE KEY IS PER TENANT (D4 reversed by the owner). A retried webhook comes back to the tenant it
--    was attributed to the first time, so (tenant, source, external id) still stops every replay; the global
--    key let a tenant probe whether another tenant holds a guessable bank reference, and made one email
--    reply that accepts two of a tenant's quotes impossible to record twice — the second is still refused,
--    within the tenant, and that is stated rather than hidden.
-- 5. W12 — `db/policies/005-acceptance-grade.sql` is re-applied, with a corrected comment.
--
-- ## CORRECTIONS TO WHAT `20260927180000_acceptance_grade` SAYS (it is committed; Rule 6)
--
-- - "Nothing takes them the other way round, so no new deadlock shape" — FALSE (W2). The withdrawal takes
--   the issue lock and then the balance row; a transaction that already holds the balance row (a credit
--   note or a variation, applied) and then withdraws or records evidence takes them the other way. Executed
--   3 of 3 by the re-review: PostgreSQL detects it (40P01), one side rolls back, nothing is left wrong. It is
--   the fourth shape in `new-app/CLAUDE.md`, with the rule that a withdrawal runs alone in its transaction,
--   and a race test in `db/test/concurrency.pg.test.ts` executes it.
-- - "Order everywhere: quote lock, then issue lock" — now held by a test that reads every function calling
--   both (W10), not by this sentence.
-- - "Release-1 quotes never earn grade 4" — not enforced by anything (W9). It is a CONSEQUENCE: a release-1
--   quote carries the tenant's own reply address, so no client reply to it reaches us. Nothing in the
--   database refuses an 'inbound_reply' row on an old issue; the inbound writer, when built, attributes only
--   replies to the derived address.
-- - The bar column was added NOT NULL without a backfill, so that migration cannot run on a database that
--   holds a sealed issue (W8). The owner confirmed on 2026-10-01 that no deployed or shared database does.
--   A database that did would need its issues' bars resolved first; nothing here does that.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It cannot tell a webhook from the application (R5, J14), as before.
-- - The withdrawal deadlock is detected and retried, not removed: no single lock order serves both a
--   credit-then-withdraw and an evidence-then-variation transaction.
-- - A source spelt in a way the list does not hold is refused, not normalised; adding a provider is a
--   migration.

-- ---------------------------------------------------------------------------
-- 1. W13: J11's subtotal check refuses an issue it cannot see at COMMIT. Otherwise unchanged from
--    `20260927170000_issue_lines_add_up`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION quote_issue_subtotal_matches_lines() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_ids UUID[];
  v_issue_id  UUID;
  v_subtotal  BIGINT;
  v_lines     NUMERIC;
BEGIN
  IF TG_TABLE_NAME = 'quote_issue' THEN
    v_issue_ids := ARRAY[NEW."id"];
  ELSIF TG_OP = 'INSERT' THEN
    v_issue_ids := ARRAY[NEW."issue_id"];
  ELSIF TG_OP = 'DELETE' THEN
    v_issue_ids := ARRAY[OLD."issue_id"];
  ELSE
    v_issue_ids := ARRAY[OLD."issue_id", NEW."issue_id"];
  END IF;

  FOREACH v_issue_id IN ARRAY v_issue_ids LOOP
    SELECT i."subtotal_minor" INTO v_subtotal FROM "quote_issue" i WHERE i."id" = v_issue_id;
    -- W13: this once skipped, so clearing the tenant before COMMIT sealed an issue its lines did not
    -- add up to. A row this transaction wrote and can no longer see cannot be checked, so it is refused.
    IF NOT FOUND THEN
      RAISE EXCEPTION 'quote_issue % cannot be seen by this transaction at COMMIT, so its subtotal cannot '
                      'be checked against its lines; refused (finding W13). Keep app.tenant_id set until '
                      'the transaction ends', v_issue_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    SELECT COALESCE(sum(l."line_total_minor"), 0) INTO v_lines
      FROM "quote_issue_line" l WHERE l."issue_id" = v_issue_id;
    IF v_lines <> v_subtotal THEN
      RAISE EXCEPTION 'quote_issue % has subtotal_minor %, but its lines sum to %; an issue''s subtotal '
                      'is the sum of its own frozen lines', v_issue_id, v_subtotal, v_lines
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. W1, W4: the evidence rules refuse an acceptance they cannot see, and an issue that is superseded or
--    not yet numbered. Otherwise unchanged from `20260927180000_acceptance_grade`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acceptance_evidence_rules() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_issue_id UUID;
  v_state    TEXT;
BEGIN
  SELECT a."issue_id" INTO v_issue_id FROM "acceptance" a WHERE a."id" = NEW."acceptance_id";
  -- W1: this once returned, so `RETURNING set_config('app.tenant_id', '', false)` skipped every rule
  -- below. A foreign acceptance is refused earlier, by the composite key; what reaches here unseen was
  -- hidden by the writer.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acceptance % cannot be seen by this statement, so the evidence rules cannot be '
                    'checked; refused (finding W1). Keep app.tenant_id set until the transaction ends',
                    NEW."acceptance_id"
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM quote_money_lock_for_issue(v_issue_id);
  PERFORM acceptance_issue_lock(v_issue_id);

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
  v_state := quote_issue_state(v_issue_id);
  IF v_state IN ('superseded', 'sealed_awaiting_number') THEN
    RAISE EXCEPTION 'issue % is %; it takes no evidence (finding W4)', v_issue_id, v_state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. W4: no client response on a superseded or unnumbered issue. Otherwise unchanged from
--    `20260927160000_acceptance_responses`. A BEFORE trigger: it runs before the row's own policy check,
--    so a tenant cleared earlier fails that check, and an issue it cannot see is another tenant's, which
--    the composite key refuses.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acceptance_response_rules() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_state TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "quote_issue" i WHERE i."id" = NEW."issue_id") THEN
    RETURN NEW;
  END IF;

  PERFORM acceptance_issue_lock(NEW."issue_id");

  -- New statements after the wait (the quote lock, taken by `acceptance_quote_lock` before this trigger,
  -- means a seal of a later revision has either committed and is seen, or waits for this response).
  v_state := quote_issue_state(NEW."issue_id");
  IF v_state IN ('superseded', 'sealed_awaiting_number') THEN
    RAISE EXCEPTION 'issue % is %; a client can respond only to a numbered, current issue (finding W4)',
                    NEW."issue_id", v_state
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."outcome" = 'declined' AND EXISTS (
       SELECT 1 FROM "acceptance" a
        WHERE a."issue_id" = NEW."issue_id" AND a."outcome" = 'accepted'
     ) THEN
    RAISE EXCEPTION 'issue % has been accepted; a decline cannot follow an acceptance. Retracting an '
                    'acceptance is the business''s withdrawal, not a client response', NEW."issue_id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. W4: a superseded issue has no grade. Otherwise unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION acceptance_grade(p_issue_id UUID) RETURNS INTEGER
LANGUAGE sql STABLE AS $$
  SELECT CASE
    -- Superseded first, as in `quote_issue_state()`: a later revision replaced it and its ceiling is 0.
    WHEN quote_issue_state(p_issue_id) = 'superseded' THEN NULL
    -- Withdrawn: the evidence stays as history, but a retracted acceptance is worth nothing (D3).
    WHEN EXISTS (
      SELECT 1 FROM "acceptance" a
        JOIN "acceptance_withdrawal" w ON w."acceptance_id" = a."id"
       WHERE a."issue_id" = p_issue_id AND a."outcome" = 'accepted'
    ) THEN NULL
    -- Otherwise the HIGHEST grade among the accepted acceptance's evidence (D1).
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

-- ---------------------------------------------------------------------------
-- 5. W5, W6: what the evidence columns may hold.
-- ---------------------------------------------------------------------------
ALTER TABLE "acceptance_evidence" ADD CONSTRAINT "acceptance_evidence_only_witnessed_carry_id_check"
    CHECK ("external_id" IS NULL OR "kind" IN ('inbound_reply', 'deposit_paid'));
ALTER TABLE "acceptance_evidence" ADD CONSTRAINT "acceptance_evidence_source_check"
    CHECK ("source" IS NULL OR "source" IN ('email', 'whatsapp', 'wipay', 'bank'));
ALTER TABLE "acceptance_evidence" ADD CONSTRAINT "acceptance_evidence_external_id_shape_check"
    CHECK ("external_id" IS NULL OR ("external_id" <> '' AND "external_id" = btrim("external_id")));

-- ---------------------------------------------------------------------------
-- 6. W7: one row per provider event, per tenant (D4 reversed by the owner, 2026-10-01).
-- ---------------------------------------------------------------------------
DROP INDEX "acceptance_evidence_source_external_id_key";
CREATE UNIQUE INDEX "acceptance_evidence_tenant_source_external_id_key"
    ON "acceptance_evidence" ("tenant_id", "source", "external_id") WHERE "external_id" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 7. W12: the policies, re-applied with the corrected comment.
-- ---------------------------------------------------------------------------
-- >>> BEGIN db/policies/005-acceptance-grade.sql
-- Tenant isolation for `acceptance_evidence` and `document_settings`, as row-level security.
--
-- A new file because the earlier ones are embedded in committed migrations (Rule 6); this copy is
-- embedded verbatim in the LATEST migration that applies it, and `db/test/policy-parity.test.ts` checks the
-- two agree. It was first embedded in `20260927180000_acceptance_grade` and re-applied, unchanged in effect,
-- by `20260927190000_rereview_fixes` to correct this comment (finding W12). That is why every policy is
-- dropped before it is created: applying the block twice must give the same policies, not an error.
--
-- `acceptance_evidence` is **append-only**: a SELECT policy, an INSERT policy, and no UPDATE or DELETE
-- policy at all. Under FORCE ROW LEVEL SECURITY a row no policy permits cannot be updated even by the
-- table owner. That is what lets the grade be derived from these rows: a row cannot be rewritten to
-- raise or lower it (finding J6). Two policies, not one FOR ALL, which would grant UPDATE and DELETE too
-- (finding J16).
--
-- `document_settings` is a tenant's own mutable preferences, so it takes the one FOR ALL policy every
-- mutable tenant table takes. Deleting the row reverts the tenant to the defaults (bar 3, no deposit
-- suggestion) for issues sealed AFTERWARDS; no issue already sealed reads it, because the bar is frozen
-- into the issue at seal (finding J8).
ALTER TABLE "acceptance_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "acceptance_evidence" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acceptance_evidence_read ON "acceptance_evidence";
CREATE POLICY acceptance_evidence_read ON "acceptance_evidence" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
DROP POLICY IF EXISTS acceptance_evidence_append ON "acceptance_evidence";
CREATE POLICY acceptance_evidence_append ON "acceptance_evidence" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "document_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_settings" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_settings_tenant_isolation ON "document_settings";
CREATE POLICY document_settings_tenant_isolation ON "document_settings"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- <<< END db/policies/005-acceptance-grade.sql
