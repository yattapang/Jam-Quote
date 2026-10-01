-- Every function reads the real tables, never a temporary table of the same name (findings Y1, Y2 of
-- the third re-review, and Y7, which reopened J2). Owner's decision, 2026-10-01: both layers below.
--
-- ## THE DEFECT
--
-- PostgreSQL searches the session's temporary schema FIRST for tables, unless pg_temp is named in the
-- search path, and no function in this schema pinned its search path. A role with the TEMP privilege —
-- every role, by default — could therefore shadow any table a trigger reads. Executed on PostgreSQL 16 as
-- the application role:
-- - Y7: an empty temp table named `invoice` let a 9,000,000 invoice past a ceiling of 1,000 — the ceiling
--   summed the temp table (J2, Closed until then);
-- - Y2: a temp `quote_issue` let an issue with no lines and a subtotal of 555,555 commit (J11); a temp
--   `acceptance` let a deposit attach to a decline (J6);
-- - Y1: a temp view named pg_roles, with the search path flipped in RETURNING, made the application
--   role look like a role that bypasses row security, and took J11's staff skip (X1).
--
-- ## WHAT CHANGES
--
-- 1. LAYER ONE: every function in the public schema runs with
--    `search_path = pg_catalog, public, pg_temp` — the catalogue first, then the real tables, and the
--    temporary schema LAST, so a temp table or view is found only if no real one has its name. Set by
--    `ALTER FUNCTION` over the catalogue, so no function is missed, and held by
--    `db/test/function-search-path.test.ts`, which fails on any function without it — including one a
--    later migration re-creates with CREATE OR REPLACE, which drops the setting.
-- 2. LAYER TWO: the TEMPORARY privilege on this database is revoked from PUBLIC, so an ordinary role
--    cannot create a temp table at all. Defence in depth for a function a later migration forgets; the
--    production role is provisioned outside the migrations, so `docs/THREAT-MODEL.md` §4g says it must not
--    be granted TEMPORARY either. Superusers and the database owner keep it.
-- 3. Y1: J11's staff check reads `pg_catalog.pg_roles` by name as well.
-- 4. Y3: a provider's id is printable ASCII (`!` to `~`, spaces inside only). Unicode spaces — NBSP,
--    U+3000, a zero-width space, a byte-order mark — passed the `[:space:]` check, and whether some did
--    depended on the database's locale; a lone NBSP graded 6. Provider ids and email Message-IDs are ASCII.
-- 5. Y6: the evidence rules refuse an unnumbered issue again; X8 removed the case as unreachable, and it
--    is reachable after a role that bypasses row security removes a number.
--
-- ## CORRECTIONS (the earlier migrations are committed; Rule 6)
--
-- - `20260927200000_rereview2_fixes` said the X1 staff skip left W13 closed "so W13 stays closed" — false
--   until this migration (Y1): a temp pg_roles view let the application role take the skip.
-- - `20260927200000_rereview2_fixes` said the evidence rules' unnumbered case could not run — false for a
--   role that bypasses row security (Y6); restored here.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not stop a superuser or the owner shadowing a table in their own session; those roles bypass
--   every control here anyway.
-- - Layer two applies to the database this migration runs in. A role granted TEMPORARY explicitly keeps
--   it; the provisioning rule in the threat model is what covers that.
-- - The pin lives on each function, so a function re-created without it is unpinned until the guard test
--   fails the build. Nothing pins it at the moment of creation.

-- ---------------------------------------------------------------------------
-- 1. Y1: the staff check qualified. Otherwise unchanged from `20260927200000_rereview2_fixes`.
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
      -- Y1: qualified, and the function's search_path is pinned below, so a temporary pg_roles view
      -- cannot answer for the catalogue.
      IF (SELECT r.rolsuper OR r.rolbypassrls FROM pg_catalog.pg_roles r WHERE r.rolname = current_user) THEN
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
-- 2. Y6: the evidence rules refuse an unnumbered issue again. Otherwise unchanged.
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
  -- Superseded, and unnumbered (restored, Y6): the application role cannot remove a number (`issue_number`
  -- has no DELETE policy), but a role that bypasses row security can, and evidence must not then attach
  -- to an issue no client could have responded to. X8 removed this as unreachable; it was only
  -- unreachable for the application role.
  v_state := quote_issue_state(v_issue_id);
  IF v_state IN ('superseded', 'sealed_awaiting_number') THEN
    RAISE EXCEPTION 'issue % is %; it takes no evidence (finding W4)', v_issue_id, v_state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Y3: printable ASCII only, no space at either end.
-- ---------------------------------------------------------------------------
ALTER TABLE "acceptance_evidence" DROP CONSTRAINT "acceptance_evidence_external_id_shape_check";
ALTER TABLE "acceptance_evidence" ADD CONSTRAINT "acceptance_evidence_external_id_shape_check"
    CHECK ("external_id" IS NULL OR "external_id" ~ '^[!-~]([ -~]*[!-~])?$');

-- ---------------------------------------------------------------------------
-- 4. LAYER ONE: pin every function's search path. Last, after every CREATE OR REPLACE above.
-- ---------------------------------------------------------------------------
DO $pin$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, pg_temp', f.signature);
  END LOOP;
END;
$pin$;

-- ---------------------------------------------------------------------------
-- 5. LAYER TWO: no temporary tables for ordinary roles in this database.
-- ---------------------------------------------------------------------------
DO $revoke$
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END;
$revoke$;
