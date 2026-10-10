-- least_privilege_violations(), rebuilt to answer the privilege-model review (findings AA1-AA5,
-- 2026-10-02; `docs/PRD-REVIEW-4.md`, end of file). Rule 6: `20260927220000_privilege_model` and
-- `20260927230000_least_privilege_creates` are committed, so the function is replaced here.
--
-- ## WHAT THE REVIEW EXECUTED, AND THE CHECK CALLED CLEAN
--
-- - AA1: a COLUMN grant (UPDATE of password_hash, SELECT of email and password_hash) — has_table_privilege
--   does not see one — and TRUNCATE, TRIGGER and REFERENCES, which it did not ask about. TRUNCATE ignores
--   row security, so it empties another tenant's rows.
-- - AA2: a view over a credential table (views run as their owner, and the default privileges grant the
--   application every new view), and a SECURITY DEFINER function in another schema.
-- - AA3: REPLICATION (a base backup holds every password hash), the predefined roles that read, write
--   or execute on the server, and CREATE on the database.
-- - AA4: membership WITH INHERIT FALSE, SET TRUE of a non-superuser role that owns a credential table —
--   "the API connected as the migrating role", which the previous version claimed to catch.
-- - AA5: owning a schema, which on the default search path ("$user", public) puts the role's own objects
--   first. The API's call is now schema-qualified as well.
--
-- `20260927220000_privilege_model`'s header item 7 says a new secret table needs only an explicit revoke,
-- with `db/test/privilege-model.test.ts` as the backstop. That was false for a view (AA2): views take the
-- application's grant by default and run as their owner. Since this migration the guard reads every kind of
-- relation in every schema, and this function names any the role can reach outside row security; a new
-- view must be security_invoker or revoked.
--
-- ## WHAT IT NOW NAMES
--
-- Attributes: superuser, BYPASSRLS, CREATEROLE, CREATEDB, REPLICATION. Database: TEMPORARY, CREATE,
-- ownership. Roles: not a member of pryvis_app; a member (in any form — MEMBER, so SET-only counts) of
-- pryvis_balance, pryvis_auth, or any predefined pg_* role. Schemas outside the system ones: CREATE on,
-- ownership of, or USAGE of any but public. Objects in those schemas: ownership of any relation, function
-- or type. The protected tables: any table privilege or any column privilege on the five credential
-- tables; any write, TRUNCATE or TRIGGER (table or column) on issue_balance and platform_capability.
-- Everything readable: any table, partitioned table, view, materialized view or foreign table the role
-- can read or write that row security does not cover — a table without it, a view that is not
-- security_invoker, any materialized or foreign table — except rate_limit_bucket and platform_capability,
-- the two named in `docs/design/privilege-model.md` D5. TRUNCATE or TRIGGER on any relation. EXECUTE on a
-- SECURITY DEFINER function anywhere that is not owned by pryvis_auth or pryvis_balance.
--
-- ## WHAT IT DOES NOT DO (Rule 21.4)
--
-- - It describes the role at the moment it is called. A privilege granted later is seen at the next start.
-- - It does not judge what a permitted definer function does: the seventeen are named and held in
--   `db/test/privilege-model.test.ts`, and their bodies are reviewed, not checked here.
-- - Large objects, sequences and event triggers are not inspected: none holds credential material, and an
--   event trigger needs superuser to create.
-- - pg_hba and the server's own configuration (who may connect for replication) are outside the database.

CREATE OR REPLACE FUNCTION least_privilege_violations() RETURNS TEXT[]
LANGUAGE plpgsql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_role  pg_catalog.pg_roles%ROWTYPE;
  v_out   TEXT[] := ARRAY[]::TEXT[];
  v_table TEXT;
  r       RECORD;
BEGIN
  SELECT * INTO v_role FROM pg_catalog.pg_roles WHERE rolname = current_user;
  IF v_role.rolsuper THEN v_out := v_out || 'is a superuser'::TEXT; END IF;
  IF v_role.rolbypassrls THEN v_out := v_out || 'bypasses row security'::TEXT; END IF;
  IF v_role.rolcreaterole THEN v_out := v_out || 'may create roles'::TEXT; END IF;
  IF v_role.rolcreatedb THEN v_out := v_out || 'may create databases'::TEXT; END IF;
  IF v_role.rolreplication THEN v_out := v_out || 'may connect for replication'::TEXT; END IF;

  IF has_database_privilege(current_user, current_database(), 'TEMPORARY') THEN
    v_out := v_out || 'may create temporary tables'::TEXT;
  END IF;
  IF has_database_privilege(current_user, current_database(), 'CREATE') THEN
    v_out := v_out || 'may create schemas'::TEXT;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_database d
              WHERE d.datname = current_database() AND pg_has_role(current_user, d.datdba, 'MEMBER')) THEN
    v_out := v_out || 'owns the database'::TEXT;
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
  FOR r IN SELECT a.rolname FROM pg_catalog.pg_roles a
            WHERE a.rolname LIKE 'pg\_%' AND a.rolname <> current_user
              AND pg_has_role(current_user, a.oid, 'MEMBER')
            ORDER BY a.rolname LOOP
    v_out := v_out || format('is a member of %s', r.rolname);
  END LOOP;

  -- Schemas: anything outside the system schemas.
  FOR r IN SELECT n.nspname, n.nspowner FROM pg_catalog.pg_namespace n
            WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
            ORDER BY n.nspname LOOP
    IF pg_has_role(current_user, r.nspowner, 'MEMBER') THEN
      v_out := v_out || format('owns schema %s', r.nspname);
    END IF;
    IF has_schema_privilege(current_user, r.nspname, 'CREATE') THEN
      v_out := v_out || format('may create objects in schema %s', r.nspname);
    END IF;
    IF r.nspname <> 'public' AND has_schema_privilege(current_user, r.nspname, 'USAGE') THEN
      v_out := v_out || format('can use schema %s', r.nspname);
    END IF;
  END LOOP;

  -- Ownership of anything in those schemas (MEMBER, so a SET-only membership of the owner counts: AA4).
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
                AND pg_has_role(current_user, c.relowner, 'MEMBER'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
                   AND pg_has_role(current_user, p.proowner, 'MEMBER'))
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
                   AND pg_has_role(current_user, t.typowner, 'MEMBER')) THEN
    v_out := v_out || 'owns database objects'::TEXT;
  END IF;

  -- The credential tables: no privilege of any kind, on the table or on any column (AA1).
  FOREACH v_table IN ARRAY ARRAY['app_credential', 'app_session', 'mfa_totp', 'mfa_recovery_code',
                                 'registration_claim'] LOOP
    IF has_table_privilege(current_user, 'public.' || v_table,
                           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       OR has_any_column_privilege(current_user, 'public.' || v_table, 'SELECT, INSERT, UPDATE, REFERENCES') THEN
      v_out := v_out || format('can reach %s directly', v_table);
    END IF;
  END LOOP;
  -- The two tables the application reads but must never write (R5, D5).
  FOREACH v_table IN ARRAY ARRAY['issue_balance', 'platform_capability'] LOOP
    IF has_table_privilege(current_user, 'public.' || v_table, 'INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER')
       OR has_any_column_privilege(current_user, 'public.' || v_table, 'INSERT, UPDATE') THEN
      v_out := v_out || format('can write %s directly', v_table);
    END IF;
  END LOOP;

  -- Everything the role can reach that row security does not cover (AA2), and TRUNCATE or TRIGGER on
  -- anything (row security does not apply to TRUNCATE; a trigger runs as whoever fires it).
  FOR r IN SELECT c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity, c.reloptions
             FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
              AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
            ORDER BY n.nspname, c.relname LOOP
    IF has_table_privilege(current_user, r.oid, 'TRUNCATE, TRIGGER') THEN
      v_out := v_out || format('can truncate or add triggers to %s.%s', r.nspname, r.relname);
    END IF;
    IF (has_table_privilege(current_user, r.oid, 'SELECT, INSERT, UPDATE, DELETE')
        OR has_any_column_privilege(current_user, r.oid, 'SELECT, INSERT, UPDATE'))
       AND NOT (r.nspname = 'public' AND r.relname IN ('rate_limit_bucket', 'platform_capability'))
       AND NOT (r.nspname = 'public' AND r.relname IN ('app_credential', 'app_session', 'mfa_totp',
                                                       'mfa_recovery_code', 'registration_claim'))
       -- (No CASE here: PL/pgSQL ends an IF condition at its first THEN.)
       AND ((r.relkind IN ('r', 'p') AND NOT r.relrowsecurity)
            OR (r.relkind = 'v'
                AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(r.reloptions, ARRAY[]::TEXT[])) o
                                 WHERE lower(o) IN ('security_invoker=true', 'security_invoker=on',
                                                    'security_invoker=1', 'security_invoker=yes')))
            OR r.relkind IN ('m', 'f')) THEN
      v_out := v_out || format('can reach %s.%s outside row security', r.nspname, r.relname);
    END IF;
  END LOOP;

  -- A definer function the role can run, owned by anyone but the two owning roles (AA2).
  FOR r IN SELECT p.oid::regprocedure::TEXT AS name, n.nspname
             FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
            WHERE p.prosecdef AND n.nspname NOT LIKE 'pg\_%' AND n.nspname <> 'information_schema'
              AND pg_get_userbyid(p.proowner) NOT IN ('pryvis_auth', 'pryvis_balance')
              AND has_function_privilege(current_user, p.oid, 'EXECUTE')
            ORDER BY 1 LOOP
    v_out := v_out || format('can execute definer function %s', r.name);
  END LOOP;

  RETURN v_out;
END;
$$;
