-- least_privilege_violations() also names CREATE on schema public and ownership of anything in it
-- (found by the builder on 2026-10-01, after `20260927220000_privilege_model` was committed; Rule 6, so a new
-- migration rather than an edit).
--
-- ## THE GAP
--
-- The start-up check (`docs/design/privilege-model.md` D4) named superuser, BYPASSRLS, TEMPORARY, membership
-- of an owning role and direct reach into the protected tables, but not two privileges that undo the model
-- from inside it:
-- - CREATE on schema public. PostgreSQL 16 does not grant it to PUBLIC, but a hand grant would go unseen.
--   A role that can create objects in public can add functions and operators beside the ones the definer
--   functions call. The pinned search path puts pg_catalog first, so built-ins cannot be shadowed; this
--   is defence in depth, not a known exploit.
-- - Owning a table or function in public — the API connecting as the migrating role, which is not a
--   superuser on a managed database. An owner can re-grant itself anything, disable row security, or
--   replace a definer function's body. Owning a credential table was already caught as "can reach …
--   directly"; owning a business table or a function was not.
--
-- ## WHAT CHANGES
--
-- The function is replaced with the two checks added at the end; everything before them is unchanged.
-- It keeps its own pinned search path (CREATE OR REPLACE with the SET clause), which
-- `db/test/function-search-path.test.ts` holds.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - Ownership is read as "the role, or a role it can act as, owns it" (pg_has_role USAGE), so a
--   membership in the owner's role counts. A role that could SET ROLE to the owner without inheriting is
--   not covered by that test, and is caught only if it is a membership the earlier lines name.
-- - Schemas other than public: no object of ours lives elsewhere.

CREATE OR REPLACE FUNCTION least_privilege_violations() RETURNS TEXT[]
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_role pg_catalog.pg_roles%ROWTYPE;
  v_out  TEXT[] := ARRAY[]::TEXT[];
  v_table TEXT;
BEGIN
  SELECT * INTO v_role FROM pg_catalog.pg_roles WHERE rolname = current_user;
  IF v_role.rolsuper THEN v_out := v_out || 'is a superuser'::TEXT; END IF;
  IF v_role.rolbypassrls THEN v_out := v_out || 'bypasses row security'::TEXT; END IF;
  IF v_role.rolcreaterole THEN v_out := v_out || 'may create roles'::TEXT; END IF;
  IF v_role.rolcreatedb THEN v_out := v_out || 'may create databases'::TEXT; END IF;
  IF has_database_privilege(current_user, current_database(), 'TEMPORARY') THEN
    v_out := v_out || 'may create temporary tables'::TEXT;
  END IF;
  IF NOT pg_has_role(current_user, 'pryvis_app', 'MEMBER') THEN
    v_out := v_out || 'is not a member of pryvis_app'::TEXT;
  END IF;
  IF pg_has_role(current_user, 'pryvis_balance', 'MEMBER') THEN
    v_out := v_out || 'is a member of pryvis_balance'::TEXT;
  END IF;
  IF pg_has_role(current_user, 'pryvis_auth', 'MEMBER') THEN
    v_out := v_out || 'is a member of pryvis_auth'::TEXT;
  END IF;
  FOREACH v_table IN ARRAY ARRAY['app_credential', 'app_session', 'mfa_totp', 'mfa_recovery_code',
                                 'registration_claim'] LOOP
    IF has_table_privilege(current_user, 'public.' || v_table, 'SELECT, INSERT, UPDATE, DELETE') THEN
      v_out := v_out || format('can reach %s directly', v_table);
    END IF;
  END LOOP;
  IF has_table_privilege(current_user, 'public.issue_balance', 'INSERT, UPDATE, DELETE') THEN
    v_out := v_out || 'can write issue_balance directly'::TEXT;
  END IF;
  IF has_table_privilege(current_user, 'public.platform_capability', 'INSERT, UPDATE, DELETE') THEN
    v_out := v_out || 'can write platform_capability directly'::TEXT;
  END IF;
  -- Added by 20260927230000: a role that can create objects in `public`, or owns any, can change what
  -- the definer functions call or grant itself back what the migrations took away.
  IF has_schema_privilege(current_user, 'public', 'CREATE') THEN
    v_out := v_out || 'may create objects in schema public'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c
               JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND pg_has_role(current_user, c.relowner, 'USAGE'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND pg_has_role(current_user, p.proowner, 'USAGE')) THEN
    v_out := v_out || 'owns objects in schema public'::TEXT;
  END IF;
  RETURN v_out;
END;
$$;
