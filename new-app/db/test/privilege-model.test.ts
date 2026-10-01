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
 *    grant on `issue_balance`.
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

describe("no table outside row security is reachable unless named (guard)", () => {
  it("finds every table without row security either unreachable or named with a reason", async () => {
    const rows = (
      await db.query<{ name: string; reachable: boolean }>(`
        SELECT c.relname AS name,
               has_table_privilege(current_user, c.oid,
                                   'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') AS reachable
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
         ORDER BY c.relname`)
    ).rows;
    // The credential tables are outside row security by design; an empty read cannot pass.
    expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining(CREDENTIAL_TABLES));
    const unnamed = rows
      .filter((r) => r.reachable && !(r.name in REACHABLE_WITHOUT_ROW_SECURITY))
      .map((r) => r.name);
    expect(unnamed, `reachable outside row security, with no reason: ${unnamed.join(", ")}`).toEqual([]);
    const stale = Object.keys(REACHABLE_WITHOUT_ROW_SECURITY).filter(
      (name) => !rows.some((r) => r.name === name && r.reachable),
    );
    expect(stale, `named but not reachable outside row security: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("the SECURITY DEFINER functions are the named ones, owned by the named roles (guard)", () => {
  it("finds exactly the seventeen, each with its owner", async () => {
    const found = (
      await db.query<{ name: string; owner: string }>(`
        SELECT p.oid::regprocedure::text AS name, pg_get_userbyid(p.proowner) AS owner
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.prosecdef`)
    ).rows;
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
       "can reach registration_claim directly"]],
    ["membership of pryvis_balance", `GRANT pryvis_balance TO ${APP_ROLE}`,
      `REVOKE pryvis_balance FROM ${APP_ROLE}`, ["is a member of pryvis_balance", "can write issue_balance directly"]],
    ["a direct grant on a credential table", `GRANT SELECT ON app_credential TO ${APP_ROLE}`,
      `REVOKE SELECT ON app_credential FROM ${APP_ROLE}`, ["can reach app_credential directly"]],
    ["a write grant on issue_balance", `GRANT UPDATE ON issue_balance TO ${APP_ROLE}`,
      `REVOKE UPDATE ON issue_balance FROM ${APP_ROLE}`, ["can write issue_balance directly"]],
    ["a write grant on platform_capability", `GRANT INSERT ON platform_capability TO ${APP_ROLE}`,
      `REVOKE INSERT ON platform_capability FROM ${APP_ROLE}`, ["can write platform_capability directly"]],
  ];
  for (const [what, plant, unplant, expected] of PLANTS) {
    it(`names ${what}`, async () => {
      await asOwner(() => db.exec(plant));
      try {
        expect(await violations()).toEqual(expected);
      } finally {
        await asOwner(() => db.exec(unplant));
      }
      expect(await violations()).toEqual([]);
    });
  }

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
