/**
 * Guard: the privilege model — which role can reach which table, and how (`docs/design/privilege-model.md`).
 *
 * WHY THIS EXISTS (findings R5 and J14, 2026-10-01)
 *
 * R5: the application role could set the flag `pryvis.balance_write` itself and then rewrite an issue's
 * ceiling with one UPDATE. J14: the credential tables (password hashes, MFA secrets, recovery codes) sit
 * outside row security, so one injected query read every tenant's. And `app_session`'s id WAS the bearer
 * credential, so a dump of it was a list of live logins. Migration `20260927220000_privilege_model` puts
 * the roles and grants in the migrations, puts the credential tables behind door functions that run as
 * `pryvis_auth`, stores only a hash of each session secret, and adds `least_privilege_violations()`.
 *
 * WHAT IT CHECKS
 *
 * 1. The application role cannot read or write any credential table, and cannot write `issue_balance`
 *    or `platform_capability` (R5's write is in `documents-core.test.ts`, block 2).
 * 2. No table outside row security is reachable by the application except the two named here with a
 *    reason — so a new secret table that forgets its REVOKE fails here, not in production.
 * 3. Every SECURITY DEFINER function is one of the named seventeen, owned by the role named for it, and
 *    PUBLIC cannot execute a door — so a new definer function owned by the superuser fails here.
 * 4. Each door returns the one row for its key and nothing for another key.
 * 5. A session resolves by the hash of its secret, and not by the secret itself, nor by the row's id —
 *    a dumped `app_session` row is not a login.
 * 6. `least_privilege_violations()` is empty for the application role, and names each planted excess:
 *    superuser, BYPASSRLS, membership of an owning role, a direct grant on a credential table, a write
 *    grant on `issue_balance`, CREATE on schema public, ownership of a table (migration 20260927230000).
 *
 * WHAT IT DOES NOT PROVE
 *
 * - That the DEPLOYED login role is least-privileged: that is the API's start-up check
 *   (`api/src/core/auth/least-privilege.ts`), which calls the same function.
 * - TEMPORARY: PGlite's `template1` never grants it, so a test here would pass without the check. That
 *   one is in `concurrency.pg.test.ts`, against real PostgreSQL.
 * - That a WRITE door cannot be misused: the application may create a session or rehash a password for a
 *   user id it knows, because sign-in must. What the doors remove is the bulk read.
 * - Anything about `registration_claim`'s doors: registration is not built, so it has none, and the
 *   application simply cannot reach the table.
 */
import { PGlite } from "@electric-sql/pglite";
import { APP_ROLE, applyMigrations } from "@pryvis/db/test-support";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const CREDENTIAL_TABLES = [
  "app_credential",
  "app_session",
  "mfa_recovery_code",
  "mfa_totp",
  "registration_claim",
];

/**
 * Tables outside row security that the application may still reach, each with the reason (D5).
 * Anything else outside row security must be unreachable to the application.
 */
const REACHABLE_WITHOUT_ROW_SECURITY: Record<string, string> = {
  rate_limit_bucket:
    "Counters keyed by action and IP or hashed email; nothing to steal, and the limiter must be fast. " +
    "Read and written directly (design D5).",
  platform_capability:
    "What our own staff may do. The application must READ it to authenticate; it can no longer write " +
    "it — a grant waits for the staff console's audited function (design D5).",
};

/** Every SECURITY DEFINER function, with the role that must own it. */
const DEFINERS: Record<string, string> = {
  "issue_balance_open(uuid)": "pryvis_balance",
  "issue_balance_apply(uuid)": "pryvis_balance",
  "credential_for_email(text)": "pryvis_auth",
  "credential_rehash(uuid,text)": "pryvis_auth",
  "session_create(uuid,text,uuid,uuid,integer,timestamp with time zone,boolean)": "pryvis_auth",
  "session_resolve(text,timestamp with time zone)": "pryvis_auth",
  "session_mark_verified(text,timestamp with time zone)": "pryvis_auth",
  "session_recently_verified(text,timestamp with time zone,interval)": "pryvis_auth",
  "mfa_has_confirmed_factor(uuid)": "pryvis_auth",
  "mfa_factor(uuid)": "pryvis_auth",
  "mfa_begin_enrolment(uuid,bytea,bytea,bytea,text)": "pryvis_auth",
  "mfa_confirm(uuid,bigint)": "pryvis_auth",
  "mfa_record_success(uuid,bigint)": "pryvis_auth",
  "mfa_reseal(uuid,bytea,bytea,bytea,text)": "pryvis_auth",
  "mfa_register_failure(uuid,integer,timestamp with time zone,interval)": "pryvis_auth",
  "mfa_add_recovery_code(uuid,uuid,text)": "pryvis_auth",
  "mfa_consume_recovery_code(uuid,text)": "pryvis_auth",
};

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const OTHER_TENANT = "33333333-3333-4333-8333-333333333333";
const OTHER_USER = "44444444-4444-4444-8444-444444444444";
const SESSION_ID = "55555555-5555-4555-8555-555555555555";
const SECRET = "the-secret-the-client-holds";

let db: PGlite;

/** Runs `work` as the migrating superuser, then returns to the application role. */
async function asOwner<T>(work: () => Promise<T>): Promise<T> {
  await db.exec("RESET ROLE");
  try {
    return await work();
  } finally {
    await db.exec(`SET ROLE ${APP_ROLE};`);
  }
}

async function violations(): Promise<string[]> {
  return (await db.query<{ v: string[] }>("SELECT least_privilege_violations() AS v")).rows[0]!.v;
}

beforeAll(async () => {
  db = new PGlite();
  await applyMigrations(db);
  for (const [tenant, user, email] of [
    [TENANT, USER, "owner@example.com"],
    [OTHER_TENANT, OTHER_USER, "other@example.com"],
  ]) {
    await db.query(
      `INSERT INTO tenant (id, name, country_code, currency, updated_at) VALUES ($1, 'T', 'JM', 'JMD', now())`,
      [tenant],
    );
    await db.query(
      `INSERT INTO app_user (id, tenant_id, email, role, session_version, updated_at)
       VALUES ($1, $2, $3, 'owner', 0, now())`,
      [user, tenant, email],
    );
    await db.query(
      `INSERT INTO app_credential (id, user_id, tenant_id, email, password_hash, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3::text, 'hash-of-' || $3::text, now())`,
      [user, tenant, email],
    );
  }
  await db.exec(`SET ROLE ${APP_ROLE};`);
  await db.query(
    `SELECT session_create($1::uuid, encode(sha256(convert_to($2::text, 'UTF8')), 'hex'), $3::uuid,
                           $4::uuid, 0, now() + interval '1 hour', false)`,
    [SESSION_ID, SECRET, USER, TENANT],
  );
});

afterAll(async () => {
  await db.close();
});

describe("the application role cannot reach the credential tables (J14)", () => {
  for (const table of CREDENTIAL_TABLES) {
    it(`refuses SELECT on ${table}`, async () => {
      await expect(db.query(`SELECT 1 FROM ${table} LIMIT 1`)).rejects.toThrow(
        new RegExp(`permission denied for table ${table}`),
      );
    });
  }

  it("holds no privilege of any kind on them — checked in the catalogue, not only by one SELECT", async () => {
    const reachable = (
      await db.query<{ t: string }>(
        `SELECT t FROM unnest($1::text[]) AS t
          WHERE has_table_privilege(current_user, 'public.' || t,
                                    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')`,
        [CREDENTIAL_TABLES],
      )
    ).rows.map((r) => r.t);
    expect(reachable).toEqual([]);
  });

  it("cannot write platform_capability (D5), though it can read it", async () => {
    await db.query("SELECT 1 FROM platform_capability LIMIT 1");
    await expect(
      db.query(
        `INSERT INTO platform_capability (id, user_id, capability)
         VALUES (gen_random_uuid(), $1, 'impersonate_tenant')`,
        [USER],
      ),
    ).rejects.toThrow(/permission denied for table platform_capability/);
  });
});

describe("nothing outside row security is reachable unless named (guard)", () => {
  // Every relation that can return rows — table, partitioned table, view, materialized view, foreign
  // table — in every schema but the system ones, and column grants as well as table grants. Until
  // 2026-10-02 this read plain tables in `public` by table grant only, and a view over a credential
  // table passed it (finding AA2); a column grant passed the runtime check (AA1).
  it("finds every such relation unreachable, row-secured, a security_invoker view, or named with a reason", async () => {
    const rows = (
      await db.query<{ name: string; reachable: boolean; covered: boolean }>(`
        SELECT n.nspname || '.' || c.relname AS name,
               (has_table_privilege(current_user, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE')
                OR has_any_column_privilege(current_user, c.oid, 'SELECT, INSERT, UPDATE')) AS reachable,
               CASE WHEN c.relkind IN ('r', 'p') THEN c.relrowsecurity
                    WHEN c.relkind = 'v' THEN EXISTS (
                      SELECT 1 FROM unnest(COALESCE(c.reloptions, ARRAY[]::text[])) o
                       WHERE lower(o) IN ('security_invoker=true', 'security_invoker=on',
                                          'security_invoker=1', 'security_invoker=yes'))
                    ELSE false END AS covered
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         ORDER BY 1`)
    ).rows;
    const outside = rows.filter((r) => !r.covered);
    // The credential tables are outside row security by design; an empty read cannot pass.
    expect(outside.map((r) => r.name)).toEqual(
      expect.arrayContaining(CREDENTIAL_TABLES.map((t) => `public.${t}`)),
    );
    const unnamed = outside
      .filter((r) => r.reachable && !(r.name.replace(/^public\./, "") in REACHABLE_WITHOUT_ROW_SECURITY))
      .map((r) => r.name);
    expect(unnamed, `reachable outside row security, with no reason: ${unnamed.join(", ")}`).toEqual([]);
    const stale = Object.keys(REACHABLE_WITHOUT_ROW_SECURITY).filter(
      (name) => !outside.some((r) => r.name === `public.${name}` && r.reachable),
    );
    expect(stale, `named but not reachable outside row security: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("the SECURITY DEFINER functions are the named ones, owned by the named roles (guard)", () => {
  it("finds exactly the seventeen, in any schema, each with its owner", async () => {
    const found = (
      await db.query<{ name: string; owner: string }>(`
        SELECT p.oid::regprocedure::text AS name, pg_get_userbyid(p.proowner) AS owner
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema' AND p.prosecdef`)
    ).rows;
    // Every schema but the system ones: a definer function in another schema passed this (AA2).
    const actual = Object.fromEntries(found.map((f) => [f.name.replace(/, /g, ","), f.owner]));
    expect(actual).toEqual(DEFINERS);
  });

  it("lets PUBLIC execute no door, and the application execute every one", async () => {
    const wrong = (
      await db.query<{ name: string; app: boolean; anyone: boolean }>(
        `SELECT p.oid::regprocedure::text AS name,
                has_function_privilege($1, p.oid, 'EXECUTE') AS app,
                EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                         WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS anyone
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.prosecdef
            AND pg_get_userbyid(p.proowner) = 'pryvis_auth'`,
        [APP_ROLE],
      )
    ).rows.filter((r) => r.anyone || !r.app);
    expect(wrong).toEqual([]);
  });
});

describe("each door returns one row for its key (D1)", () => {
  it("returns the one credential for a known email, and nothing for an unknown one", async () => {
    const known = await db.query<{ user_id: string; password_hash: string }>(
      "SELECT user_id, password_hash FROM credential_for_email($1)",
      ["owner@example.com"],
    );
    expect(known.rows).toEqual([{ user_id: USER, password_hash: "hash-of-owner@example.com" }]);
    const unknown = await db.query("SELECT * FROM credential_for_email($1)", ["nobody@example.com"]);
    expect(unknown.rows).toEqual([]);
  });

  it("cannot be widened into a dump by a pattern, because the key is matched exactly", async () => {
    const wild = await db.query("SELECT * FROM credential_for_email($1)", ["%"]);
    expect(wild.rows).toEqual([]);
  });

  it("answers a factor question for one user, and false for a user with none", async () => {
    const r = await db.query<{ has: boolean }>("SELECT mfa_has_confirmed_factor($1) AS has", [OTHER_USER]);
    expect(r.rows).toEqual([{ has: false }]);
    const f = await db.query("SELECT * FROM mfa_factor($1)", [OTHER_USER]);
    expect(f.rows).toEqual([]);
  });
});

describe("a session resolves by the hash of its secret only (D2)", () => {
  it("resolves by the hash", async () => {
    const r = await db.query<{ user_id: string; tenant_id: string }>(
      `SELECT user_id, tenant_id
         FROM session_resolve(encode(sha256(convert_to($1::text, 'UTF8')), 'hex'), now())`,
      [SECRET],
    );
    expect(r.rows).toEqual([{ user_id: USER, tenant_id: TENANT }]);
  });

  it("does not resolve by the secret itself, or by the row's id — a dumped row is not a login", async () => {
    for (const presented of [SECRET, SESSION_ID]) {
      const r = await db.query("SELECT * FROM session_resolve($1, now())", [presented]);
      expect(r.rows).toEqual([]);
    }
  });

  it("stores no secret: the only token column is a 64-character hex hash", async () => {
    const stored = await asOwner(
      async () =>
        (await db.query<{ token_hash: string }>("SELECT token_hash FROM app_session WHERE id = $1", [SESSION_ID]))
          .rows,
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored[0]!.token_hash).not.toContain(SECRET);
    await expect(
      asOwner(() =>
        db.query(
          `INSERT INTO app_session (id, token_hash, user_id, tenant_id, version, expires_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 0, now())`,
          [SECRET, USER, TENANT],
        ),
      ),
    ).rejects.toThrow(/app_session_token_hash_shape_check/);
  });
});

describe("least_privilege_violations() (D4)", () => {
  it("is empty for the application role", async () => {
    expect(await violations()).toEqual([]);
  });

  it("names the superuser for what it is", async () => {
    const v = await asOwner(violations);
    // A superuser is a member of every role and reaches every table, so it is named several times over.
    expect(v).toEqual(expect.arrayContaining(["is a superuser", "can reach app_credential directly"]));
  });

  // Each excess is planted as the owner, checked as the application role, then taken back.
  const PLANTS: Array<[string, string, string, string[]]> = [
    ["BYPASSRLS", `ALTER ROLE ${APP_ROLE} BYPASSRLS`, `ALTER ROLE ${APP_ROLE} NOBYPASSRLS`, ["bypasses row security"]],
    ["CREATEROLE", `ALTER ROLE ${APP_ROLE} CREATEROLE`, `ALTER ROLE ${APP_ROLE} NOCREATEROLE`, ["may create roles"]],
    ["CREATEDB", `ALTER ROLE ${APP_ROLE} CREATEDB`, `ALTER ROLE ${APP_ROLE} NOCREATEDB`, ["may create databases"]],
    ["membership of pryvis_auth", `GRANT pryvis_auth TO ${APP_ROLE}`, `REVOKE pryvis_auth FROM ${APP_ROLE}`,
      // Membership inherits the owning role's grants, so its reach is named too.
      ["is a member of pryvis_auth", "can reach app_credential directly", "can reach app_session directly",
       "can reach mfa_totp directly", "can reach mfa_recovery_code directly",
       "can reach registration_claim directly", "owns database objects"]],
    ["membership of pryvis_balance", `GRANT pryvis_balance TO ${APP_ROLE}`,
      `REVOKE pryvis_balance FROM ${APP_ROLE}`, ["is a member of pryvis_balance", "can write issue_balance directly",
       "owns database objects"]],
    ["a direct grant on a credential table", `GRANT SELECT ON app_credential TO ${APP_ROLE}`,
      `REVOKE SELECT ON app_credential FROM ${APP_ROLE}`, ["can reach app_credential directly"]],
    ["a write grant on issue_balance", `GRANT UPDATE ON issue_balance TO ${APP_ROLE}`,
      `REVOKE UPDATE ON issue_balance FROM ${APP_ROLE}`, ["can write issue_balance directly"]],
    ["a write grant on platform_capability", `GRANT INSERT ON platform_capability TO ${APP_ROLE}`,
      `REVOKE INSERT ON platform_capability FROM ${APP_ROLE}`, ["can write platform_capability directly"]],
    // Added with migration 20260927230000: the two privileges that undo the model from inside it.
    ["CREATE on schema public", `GRANT CREATE ON SCHEMA public TO ${APP_ROLE}`,
      `REVOKE CREATE ON SCHEMA public FROM ${APP_ROLE}`, ["may create objects in schema public"]],
    ["ownership of a business table", `ALTER TABLE rate_limit_bucket OWNER TO ${APP_ROLE}`,
      "ALTER TABLE rate_limit_bucket OWNER TO CURRENT_USER",
      ["owns database objects", "can truncate or add triggers to public.rate_limit_bucket"]],
    // The review's bypasses (AA1-AA5, 2026-10-02), each one the check used to call clean.
    ["AA1 · a column UPDATE grant on a credential table", `GRANT UPDATE (password_hash) ON app_credential TO ${APP_ROLE}`,
      `REVOKE UPDATE (password_hash) ON app_credential FROM ${APP_ROLE}`, ["can reach app_credential directly"]],
    ["AA1 · a column SELECT grant on a credential table", `GRANT SELECT (user_id) ON app_session TO ${APP_ROLE}`,
      `REVOKE SELECT (user_id) ON app_session FROM ${APP_ROLE}`, ["can reach app_session directly"]],
    ["AA1 · REFERENCES on a credential table", `GRANT REFERENCES ON mfa_totp TO ${APP_ROLE}`,
      `REVOKE REFERENCES ON mfa_totp FROM ${APP_ROLE}`, ["can reach mfa_totp directly"]],
    ["AA1 · TRUNCATE on issue_balance", `GRANT TRUNCATE ON issue_balance TO ${APP_ROLE}`,
      `REVOKE TRUNCATE ON issue_balance FROM ${APP_ROLE}`,
      ["can write issue_balance directly", "can truncate or add triggers to public.issue_balance"]],
    ["AA1 · a column UPDATE grant on platform_capability", `GRANT UPDATE (capability) ON platform_capability TO ${APP_ROLE}`,
      `REVOKE UPDATE (capability) ON platform_capability FROM ${APP_ROLE}`, ["can write platform_capability directly"]],
    ["AA1 · TRIGGER on a business table", `GRANT TRIGGER ON invoice TO ${APP_ROLE}`,
      `REVOKE TRIGGER ON invoice FROM ${APP_ROLE}`, ["can truncate or add triggers to public.invoice"]],
    ["AA2 · a view over a credential table (granted by default privileges)",
      "CREATE VIEW credential_directory AS SELECT email, password_hash FROM app_credential",
      "DROP VIEW credential_directory", ["can reach public.credential_directory outside row security"]],
    ["AA2 · a materialized view", `CREATE MATERIALIZED VIEW credential_copy AS SELECT email FROM app_credential;
      GRANT SELECT ON credential_copy TO ${APP_ROLE}`,
      "DROP MATERIALIZED VIEW credential_copy", ["can reach public.credential_copy outside row security"]],
    ["AA2 · a definer function in another schema", `CREATE SCHEMA aa_other; GRANT USAGE ON SCHEMA aa_other TO ${APP_ROLE};
      CREATE FUNCTION aa_other.dump() RETURNS bigint LANGUAGE sql SECURITY DEFINER
        AS 'SELECT count(*) FROM public.app_credential'`,
      "DROP SCHEMA aa_other CASCADE", ["can use schema aa_other", "can execute definer function aa_other.dump()"]],
    ["AA3 · REPLICATION", `ALTER ROLE ${APP_ROLE} REPLICATION`, `ALTER ROLE ${APP_ROLE} NOREPLICATION`,
      ["may connect for replication"]],
    ["AA3 · a predefined role that runs programs on the server", `GRANT pg_execute_server_program TO ${APP_ROLE}`,
      `REVOKE pg_execute_server_program FROM ${APP_ROLE}`, ["is a member of pg_execute_server_program"]],
    ["AA3 · CREATE on the database", `DO $$BEGIN EXECUTE format('GRANT CREATE ON DATABASE %I TO pryvis_app', current_database()); END$$`, `DO $$BEGIN EXECUTE format('REVOKE CREATE ON DATABASE %I FROM pryvis_app', current_database()); END$$`, ["may create schemas"]],
    ["AA4 · SET-only membership of a role that owns a credential table",
      `CREATE ROLE aa_migrator NOLOGIN; ALTER TABLE app_credential OWNER TO aa_migrator;
      GRANT aa_migrator TO ${APP_ROLE} WITH INHERIT FALSE, SET TRUE`,
      `REVOKE aa_migrator FROM ${APP_ROLE}; ALTER TABLE app_credential OWNER TO CURRENT_USER; DROP ROLE aa_migrator`,
      ["owns database objects"]],
    ["AA5 · a schema the role owns", `CREATE SCHEMA aa_mine AUTHORIZATION ${APP_ROLE}`, "DROP SCHEMA aa_mine CASCADE",
      ["owns schema aa_mine", "may create objects in schema aa_mine", "can use schema aa_mine"]],
  ];
  for (const [what, plant, unplant, expected] of PLANTS) {
    it(`names ${what}`, async () => {
      await asOwner(() => db.exec(plant));
      try {
        // Order is the function's, not the point: compare as sets.
        expect([...(await violations())].sort()).toEqual([...expected].sort());
      } finally {
        await asOwner(() => db.exec(unplant));
      }
      expect(await violations()).toEqual([]);
    });
  }

  it("calls a security_invoker view clean: it runs as the caller, under row security", async () => {
    await asOwner(() => db.exec("CREATE VIEW tenant_names WITH (security_invoker = true) AS SELECT id, name FROM tenant"));
    try {
      expect(await violations()).toEqual([]);
    } finally {
      await asOwner(() => db.exec("DROP VIEW tenant_names"));
    }
  });

  it("names a role that is not a member of pryvis_app at all", async () => {
    await asOwner(() => db.exec("CREATE ROLE pryvis_stranger NOLOGIN"));
    try {
      await db.exec("RESET ROLE");
      await db.exec("SET ROLE pryvis_stranger");
      expect(await violations()).toEqual(["is not a member of pryvis_app"]);
    } finally {
      await db.exec("RESET ROLE");
      await db.exec("DROP ROLE pryvis_stranger");
      await db.exec(`SET ROLE ${APP_ROLE};`);
    }
  });
});
