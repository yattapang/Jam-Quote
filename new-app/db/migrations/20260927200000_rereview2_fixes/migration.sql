-- The fixes for the second adversarial re-review of J6, J7, J8 and J11 (findings X1-X10, 2026-10-01).
-- No owner decision was needed; the decisions of 2026-10-01 stand.
--
-- ## WHAT CHANGES
--
-- 1. X1 — J11's subtotal check no longer refuses a staff erasure. `20260927190000_rereview_fixes` made a
--    check that cannot see its issue at COMMIT refuse, which was right for the application role (W13) and
--    wrong for a role that bypasses row security: for that role "not found" can only mean "deleted", so
--    deleting a sealed issue and its lines in one transaction was refused with a message about the tenant.
--    The check now skips only for a superuser or BYPASSRLS role, which cannot have a row hidden from it.
--    The application role has neither (`new-app/db/test-support/index.ts` creates it without BYPASSRLS), so W13 stays closed. That migration's "Nothing
--    legitimate is refused" was false until this one.
-- 2. X6 — an external id may not begin or end with ANY whitespace. `btrim()` strips spaces only, so a tab
--    or newline id passed, and a tab alone graded 6. The check is now a regular expression on
--    `[:space:]`, which covers tab, newline, carriage return, vertical tab and form feed.
-- 3. X8 — the evidence rules' unnumbered case, which could not run, is removed (reason in the body).
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - A superuser or BYPASSRLS session can still seal an issue whose lines do not add up and then delete it
--   — no more than it could before, and those roles bypass every policy here anyway.
-- - Whitespace INSIDE an id is kept: provider ids are opaque, and normalising them could merge two events.

-- ---------------------------------------------------------------------------
-- 1. X1: skip only where "not found" can only mean "deleted".
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
      -- X1: a role that bypasses row security sees every row, so for it NOT FOUND means the issue is really
      -- gone — a staff erasure deleting an issue and its lines in one transaction — and there is nothing to
      -- check. Only a role row security applies to can have a row hidden from it by its own writer.
      IF (SELECT r.rolsuper OR r.rolbypassrls FROM pg_roles r WHERE r.rolname = current_user) THEN
        CONTINUE;
      END IF;
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
-- 2. X6: no leading or trailing whitespace of any kind.
-- ---------------------------------------------------------------------------
ALTER TABLE "acceptance_evidence" DROP CONSTRAINT "acceptance_evidence_external_id_shape_check";
ALTER TABLE "acceptance_evidence" ADD CONSTRAINT "acceptance_evidence_external_id_shape_check"
    CHECK ("external_id" IS NULL OR "external_id" ~ '^[^[:space:]](.*[^[:space:]])?$');

-- ---------------------------------------------------------------------------
-- 3. X8: the evidence rules without the unreachable case. Otherwise unchanged from
--    `20260927190000_rereview_fixes`.
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
  -- Only "superseded" is reachable here (X8): evidence needs an accepted acceptance, an acceptance needs a
  -- numbered issue (`acceptance_response_rules`), and a number is never removed (`issue_number` has no
  -- DELETE policy). The unnumbered case this checked could not run, so it is gone rather than untested.
  v_state := quote_issue_state(v_issue_id);
  IF v_state = 'superseded' THEN
    RAISE EXCEPTION 'issue % is %; it takes no evidence (finding W4)', v_issue_id, v_state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
