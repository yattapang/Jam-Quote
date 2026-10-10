-- The database privilege model (findings R5 and J14, and `docs/THREAT-MODEL.md` §4g's deployment check;
-- design `docs/design/privilege-model.md`, approved by the owner 2026-10-01, option A throughout).
--
-- ## WHAT CHANGES
--
-- 1. THREE ROLES, MADE HERE (D3). The privilege model is code, reviewed and tested, instead of grants the
--    test harness invented — which is how R5 hid. All three are NOLOGIN group roles:
--    - pryvis_app: the application. A deployment's login role is made a member of it and of nothing else.
--    - pryvis_balance: owns `issue_balance_open()` and `issue_balance_apply()`, and is the only role that
--      may write `issue_balance`.
--    - pryvis_auth: owns the credential door functions, and is the only role that may touch the
--      credential tables.
--    Roles belong to the cluster, not the database, so they are created only if absent; the grants are per
--    database and are made every time.
-- 2. R5 FIXED: the application has SELECT on `issue_balance` and nothing else. The balance functions are
--    SECURITY DEFINER, owned by pryvis_balance, and the write policies require that role
--    (`db/policies/006-privilege-model.sql`) instead of the setting `pryvis.balance_write`, which the
--    application could set itself. The flag is gone.
-- 3. J14 FIXED, WITH `app_session` ADDED (D1): the application has NO privilege on `app_credential`,
--    `app_session`, `mfa_totp`, `mfa_recovery_code` or `registration_claim`. It reaches them only through
--    SECURITY DEFINER door functions, each reading or writing ONE row by its key — a defect in our server
--    can no longer dump a table. `registration_claim` has no door yet: sign-up is not built.
-- 4. SESSION SECRETS ARE STORED AS HASHES (D2). `app_session.token_hash` holds the SHA-256 of the secret
--    the client holds; sessions are found by it. A copy of the table is no longer a list of live logins.
-- 5. STAFF CAPABILITIES ARE READ-ONLY to the application (D5); the rate limiter's table stays writable.
-- 6. `least_privilege_violations()` lists what is wrong with the CURRENT role, for the API's start-up
--    check and for CI (D4): superuser, BYPASSRLS, CREATEROLE, CREATEDB, TEMPORARY, membership of the two
--    owning roles, or any direct reach into the credential tables, `issue_balance` writes or capability
--    writes. Empty means least privilege.
-- 7. Future tables the migrating role creates get the application's ordinary grants by default, so a new
--    business table needs no grant line; a new SECRET table must be revoked explicitly, and
--    `db/test/privilege-model.test.ts` fails on any table outside row security the application can reach
--    and nobody listed.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not make a defect in our server harmless. A door that WRITES — creating a session, rehashing a
--   password, recording a factor — can be called by an injection with a user id it knows, because the
--   application must be able to do exactly that. What the doors remove is the bulk read: no query the
--   application can run returns more than one credential row. The ordinary path still reads and writes the
--   tenant's business rows under row security, and a hostile set_config of `app.tenant_id` still chooses
--   the tenant (row security stops forgetting, not hostility — R5's own lesson).
-- - It does not bind the deployed LOGIN role: that role is created outside the migrations. The API's
--   start-up check and `least_privilege_violations()` are what refuse an over-privileged one.
-- - `ALTER FUNCTION … OWNER TO` needs the migrating role to be able to SET ROLE to the new owner. A
--   superuser can; on a managed database the migrating role must be granted the two owning roles WITH SET
--   (PostgreSQL 16) — stated in the design's deployment section, and the migration fails loudly otherwise.
-- - `app_session.token_hash` is added NOT NULL with no default: the migration needs an empty `app_session`.
--   The owner confirmed on 2026-10-01 that no deployed or shared database holds real data.
-- - It does not cover the staff console's own privileges, or staff MFA, which stay owed.

-- ---------------------------------------------------------------------------
-- 1. The roles, if absent.
-- ---------------------------------------------------------------------------
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pryvis_app') THEN
    CREATE ROLE pryvis_app NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pryvis_balance') THEN
    CREATE ROLE pryvis_balance NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'pryvis_auth') THEN
    CREATE ROLE pryvis_auth NOLOGIN;
  END IF;
END;
$roles$;

-- ---------------------------------------------------------------------------
-- 2. Grants. The application: ordinary access to every table, then the exceptions taken away.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO pryvis_app, pryvis_balance, pryvis_auth;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pryvis_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pryvis_app;

REVOKE ALL ON "app_credential", "app_session", "mfa_totp", "mfa_recovery_code", "registration_claim"
  FROM pryvis_app;
REVOKE INSERT, UPDATE, DELETE ON "issue_balance" FROM pryvis_app;
REVOKE INSERT, UPDATE, DELETE ON "platform_capability" FROM pryvis_app;

-- The balance role reads what the ceiling reads, and writes only the balance.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pryvis_balance;
REVOKE ALL ON "app_credential", "app_session", "mfa_totp", "mfa_recovery_code", "registration_claim"
  FROM pryvis_balance;
GRANT INSERT, UPDATE ON "issue_balance" TO pryvis_balance;

-- The auth role touches the credential tables and nothing else.
GRANT SELECT, INSERT, UPDATE ON "app_credential", "app_session", "mfa_totp", "mfa_recovery_code",
  "registration_claim" TO pryvis_auth;

-- ---------------------------------------------------------------------------
-- 3. The balance functions run as pryvis_balance, without the flag. Otherwise unchanged from
--    `20260927130000_balance_open_takes_lock` and `20260927120000_lock_isolation_and_tenancy`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION issue_balance_open(p_issue_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_tenant UUID;
  v_total  BIGINT;
BEGIN
  -- Q5. The shared quote lock — and with it the READ COMMITTED check — before the row is created, so
  -- opening a balance is ordered like every other financial write on the quote.
  PERFORM quote_money_lock_for_issue(p_issue_id);

  SELECT q."tenant_id", q."total_minor" INTO v_tenant, v_total
    FROM "quote_issue" q WHERE q."id" = p_issue_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'cannot open a balance for unknown issue %', p_issue_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;


  INSERT INTO "issue_balance"
      ("issue_id", "tenant_id", "accepted_total_minor", "variations_total_minor",
       "invoiced_total_minor", "recomputed_at")
  VALUES (p_issue_id, v_tenant, v_total, 0, 0, now())
  ON CONFLICT ("issue_id") DO NOTHING;

END;
$$;

CREATE OR REPLACE FUNCTION issue_balance_apply(p_issue_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_locked      UUID;
  v_variations  BIGINT;
  v_invoiced    BIGINT;
  v_ceiling     BIGINT;
  v_written     INTEGER;
  v_check_var   BIGINT;
  v_check_inv   BIGINT;
BEGIN
  -- P3. Quote lock before balance row lock, on every path, so no single-quote cycle exists.
  PERFORM quote_money_lock_for_issue(p_issue_id);


  SELECT b."issue_id" INTO v_locked
    FROM "issue_balance" b
   WHERE b."issue_id" = p_issue_id
     FOR UPDATE;

  IF v_locked IS NULL THEN
    RAISE EXCEPTION 'issue_balance row missing for issue %; it is created with the acceptance, and '
                    'a FOR UPDATE on no row takes no lock at all', p_issue_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT COALESCE(SUM(v."amount_minor"), 0) INTO v_variations
    FROM "variation" v WHERE v."issue_id" = p_issue_id;

  -- Net of credit notes, over unvoided invoices only, and never below zero per invoice (K1).
  SELECT COALESCE(SUM(GREATEST(0,
           i."amount_minor"
           - (SELECT COALESCE(SUM(c."amount_minor"), 0) FROM "credit_note" c WHERE c."invoice_id" = i."id")
         )), 0) INTO v_invoiced
    FROM "invoice" i
   WHERE i."issue_id" = p_issue_id
     AND NOT EXISTS (SELECT 1 FROM "invoice_void" z WHERE z."invoice_id" = i."id");

  UPDATE "issue_balance"
     SET "variations_total_minor" = v_variations,
         "invoiced_total_minor"   = v_invoiced,
         "recomputed_at"          = now()
   WHERE "issue_id" = p_issue_id;

  -- J3: zero rows written means something is wrong that must not be papered over.
  GET DIAGNOSTICS v_written = ROW_COUNT;
  IF v_written <> 1 THEN
    RAISE EXCEPTION 'issue_balance write for issue % affected % row(s), not 1; refusing rather than '
                    'judging the ceiling on figures that were never stored', p_issue_id, v_written
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT b."variations_total_minor", b."invoiced_total_minor"
    INTO v_check_var, v_check_inv
    FROM "issue_balance" b WHERE b."issue_id" = p_issue_id;
  IF v_check_var <> v_variations OR v_check_inv <> v_invoiced THEN
    RAISE EXCEPTION 'issue_balance for issue % reads back as (%, %) after writing (%, %)',
      p_issue_id, v_check_var, v_check_inv, v_variations, v_invoiced
      USING ERRCODE = 'data_corrupted';
  END IF;


  v_ceiling := issue_ceiling_minor(p_issue_id);
  IF v_invoiced > v_ceiling THEN
    RAISE EXCEPTION 'invoiced total % exceeds the ceiling % for issue % by %',
      v_invoiced, v_ceiling, p_issue_id, v_invoiced - v_ceiling
      USING ERRCODE = 'check_violation',
            HINT = 'A reduction in scope below what is already invoiced needs that amount credited '
                   'against an invoice first, in the same transaction.';
  END IF;
END;
$$;

ALTER FUNCTION issue_balance_open(uuid) OWNER TO pryvis_balance;
ALTER FUNCTION issue_balance_apply(uuid) OWNER TO pryvis_balance;

-- ---------------------------------------------------------------------------
-- 4. `issue_balance`'s write policies, keyed on the owning role.
-- ---------------------------------------------------------------------------
-- >>> BEGIN db/policies/006-privilege-model.sql
-- `issue_balance`'s write policies, keyed on the ROLE that owns the balance functions rather than on a
-- setting (finding R5; `docs/design/privilege-model.md` §5).
--
-- These replace the two write policies `002-documents-isolation.sql` created, which required the
-- transaction-local setting `pryvis.balance_write` — a setting the application role could set itself, so
-- the policy stopped the application FORGETTING the balance and not a hostile caller (R5, executed). 002
-- is embedded in a committed migration (Rule 6), so its text still shows the old policies; this file,
-- embedded in `20260927220000_privilege_model`, is what the database holds.
--
-- current_user inside a SECURITY DEFINER function is the function's OWNER, and outside one it is the
-- caller; the application cannot make itself pryvis_balance. The tenant match stays, so even the balance
-- functions write only the tenant in scope. The application role also has no INSERT or UPDATE grant on
-- the table at all — the policy is the second lock, not the only one.
DROP POLICY IF EXISTS issue_balance_create ON "issue_balance";
CREATE POLICY issue_balance_create ON "issue_balance" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
              AND current_user = 'pryvis_balance');

DROP POLICY IF EXISTS issue_balance_amend ON "issue_balance";
CREATE POLICY issue_balance_amend ON "issue_balance" FOR UPDATE
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
         AND current_user = 'pryvis_balance')
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid
              AND current_user = 'pryvis_balance');
-- <<< END db/policies/006-privilege-model.sql

-- ---------------------------------------------------------------------------
-- 5. Session secrets stored as hashes (D2).
-- ---------------------------------------------------------------------------
-- The hex SHA-256 of the secret the client holds. The secret itself never reaches the database.
ALTER TABLE "app_session" ADD COLUMN "token_hash" TEXT NOT NULL;
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_token_hash_shape_check"
    CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
CREATE UNIQUE INDEX "app_session_token_hash_key" ON "app_session" ("token_hash");

-- ---------------------------------------------------------------------------
-- 6. The door functions (D1): the only way the application reaches a credential table. Each runs as
--    pryvis_auth, reads or writes ONE row by its key, and returns at most one row.
-- ---------------------------------------------------------------------------
CREATE FUNCTION credential_for_email(p_email TEXT)
RETURNS TABLE (user_id UUID, tenant_id UUID, password_hash TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT c."user_id", c."tenant_id", c."password_hash" FROM "app_credential" c WHERE c."email" = p_email;
$$;

CREATE FUNCTION credential_rehash(p_user_id UUID, p_password_hash TEXT) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE "app_credential" SET "password_hash" = p_password_hash, "updated_at" = now()
   WHERE "user_id" = p_user_id;
$$;

CREATE FUNCTION session_create(p_id UUID, p_token_hash TEXT, p_user_id UUID, p_tenant_id UUID,
                               p_version INTEGER, p_expires_at TIMESTAMPTZ, p_mfa_pending BOOLEAN)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO "app_session" ("id", "token_hash", "user_id", "tenant_id", "version", "expires_at", "mfa_pending")
  VALUES (p_id, p_token_hash, p_user_id, p_tenant_id, p_version, p_expires_at, p_mfa_pending);
$$;

CREATE FUNCTION session_resolve(p_token_hash TEXT, p_at TIMESTAMPTZ)
RETURNS TABLE (user_id UUID, tenant_id UUID, version INTEGER, expired BOOLEAN, revoked BOOLEAN,
               mfa_pending BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT s."user_id", s."tenant_id", s."version", (s."expires_at" <= p_at), (s."revoked_at" IS NOT NULL),
         s."mfa_pending"
    FROM "app_session" s WHERE s."token_hash" = p_token_hash;
$$;

CREATE FUNCTION session_mark_verified(p_token_hash TEXT, p_at TIMESTAMPTZ) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE "app_session" SET "mfa_pending" = false, "mfa_verified_at" = p_at WHERE "token_hash" = p_token_hash;
$$;

CREATE FUNCTION session_recently_verified(p_token_hash TEXT, p_at TIMESTAMPTZ, p_within INTERVAL)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT COALESCE((SELECT s."mfa_verified_at" IS NOT NULL AND s."mfa_verified_at" > (p_at - p_within)
                     FROM "app_session" s WHERE s."token_hash" = p_token_hash), false);
$$;

CREATE FUNCTION mfa_has_confirmed_factor(p_user_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM "mfa_totp" m WHERE m."user_id" = p_user_id AND m."confirmed_at" IS NOT NULL);
$$;

-- The secret is AES-256-GCM ciphertext whose key is never in the database (ADR 0021); this returns one
-- user's, for the server to open.
CREATE FUNCTION mfa_factor(p_user_id UUID)
RETURNS TABLE (secret_ciphertext BYTEA, secret_iv BYTEA, secret_tag BYTEA, secret_key_id TEXT,
               confirmed_at TIMESTAMPTZ, last_used_step BIGINT, failed_attempts INTEGER,
               locked_until TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT m."secret_ciphertext", m."secret_iv", m."secret_tag", m."secret_key_id", m."confirmed_at",
         m."last_used_step", m."failed_attempts", m."locked_until"
    FROM "mfa_totp" m WHERE m."user_id" = p_user_id;
$$;

-- Replaces an UNCONFIRMED secret, never a confirmed one (resetting a confirmed factor is a staff action).
CREATE FUNCTION mfa_begin_enrolment(p_user_id UUID, p_ciphertext BYTEA, p_iv BYTEA, p_tag BYTEA,
                                    p_key_id TEXT) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO "mfa_totp" ("user_id", "secret_ciphertext", "secret_iv", "secret_tag", "secret_key_id", "updated_at")
  VALUES (p_user_id, p_ciphertext, p_iv, p_tag, p_key_id, now())
  ON CONFLICT ("user_id") DO UPDATE
    SET "secret_ciphertext" = EXCLUDED."secret_ciphertext", "secret_iv" = EXCLUDED."secret_iv",
        "secret_tag" = EXCLUDED."secret_tag", "secret_key_id" = EXCLUDED."secret_key_id",
        "failed_attempts" = 0, "locked_until" = NULL, "last_used_step" = NULL, "updated_at" = now()
    WHERE "mfa_totp"."confirmed_at" IS NULL;
$$;

CREATE FUNCTION mfa_confirm(p_user_id UUID, p_step BIGINT) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE "mfa_totp" SET "confirmed_at" = now(), "last_used_step" = p_step, "failed_attempts" = 0,
                        "locked_until" = NULL, "updated_at" = now()
   WHERE "user_id" = p_user_id;
$$;

CREATE FUNCTION mfa_record_success(p_user_id UUID, p_step BIGINT) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE "mfa_totp" SET "last_used_step" = p_step, "failed_attempts" = 0, "locked_until" = NULL,
                        "updated_at" = now()
   WHERE "user_id" = p_user_id;
$$;

CREATE FUNCTION mfa_reseal(p_user_id UUID, p_ciphertext BYTEA, p_iv BYTEA, p_tag BYTEA, p_key_id TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE "mfa_totp" SET "secret_ciphertext" = p_ciphertext, "secret_iv" = p_iv, "secret_tag" = p_tag,
                        "secret_key_id" = p_key_id, "updated_at" = now()
   WHERE "user_id" = p_user_id;
$$;

-- Returns the attempt count after this failure; locks the factor once it reaches p_max.
CREATE FUNCTION mfa_register_failure(p_user_id UUID, p_max INTEGER, p_at TIMESTAMPTZ, p_lock INTERVAL)
RETURNS INTEGER
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  UPDATE "mfa_totp"
     SET "failed_attempts" = "failed_attempts" + 1,
         "locked_until" = CASE WHEN "failed_attempts" + 1 >= p_max THEN p_at + p_lock ELSE "locked_until" END,
         "updated_at" = now()
   WHERE "user_id" = p_user_id
  RETURNING "failed_attempts";
$$;

CREATE FUNCTION mfa_add_recovery_code(p_id UUID, p_user_id UUID, p_code_hash TEXT) RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  INSERT INTO "mfa_recovery_code" ("id", "user_id", "code_hash") VALUES (p_id, p_user_id, p_code_hash);
$$;

-- True when an unused code matched and is now spent; single use.
CREATE FUNCTION mfa_consume_recovery_code(p_user_id UUID, p_code_hash TEXT) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  WITH spent AS (
    UPDATE "mfa_recovery_code" SET "used_at" = now()
     WHERE "user_id" = p_user_id AND "code_hash" = p_code_hash AND "used_at" IS NULL
    RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM spent);
$$;

DO $doors$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'credential_for_email(text)', 'credential_rehash(uuid, text)',
    'session_create(uuid, text, uuid, uuid, integer, timestamptz, boolean)',
    'session_resolve(text, timestamptz)', 'session_mark_verified(text, timestamptz)',
    'session_recently_verified(text, timestamptz, interval)',
    'mfa_has_confirmed_factor(uuid)', 'mfa_factor(uuid)',
    'mfa_begin_enrolment(uuid, bytea, bytea, bytea, text)', 'mfa_confirm(uuid, bigint)',
    'mfa_record_success(uuid, bigint)', 'mfa_reseal(uuid, bytea, bytea, bytea, text)',
    'mfa_register_failure(uuid, integer, timestamptz, interval)',
    'mfa_add_recovery_code(uuid, uuid, text)', 'mfa_consume_recovery_code(uuid, text)'
  ] LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO pryvis_auth', f);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO pryvis_app', f);
  END LOOP;
END;
$doors$;

-- ---------------------------------------------------------------------------
-- 7. What is wrong with the CURRENT role (D4). Empty means least privilege. Not SECURITY DEFINER: it must
--    describe the caller.
-- ---------------------------------------------------------------------------
CREATE FUNCTION least_privilege_violations() RETURNS TEXT[]
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
  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Re-pin every function's search path (`20260927210000_pin_search_path`): CREATE OR REPLACE above
--    dropped the pin on the two balance functions' previous definitions, and the new functions must carry
--    it too. Their own SET clauses already pin; this keeps the rule in one loop, as that migration does.
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
