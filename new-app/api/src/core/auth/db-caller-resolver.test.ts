/**
 * Does identity resolution actually read the database, and does a change bite at once?
 *
 * Against real Postgres (PGlite), as the unprivileged application role, with the real
 * migrations and the real policies applied. That matters more here than anywhere
 * else: the central claim of this class is that step 3 happens under row-level
 * security, and only a database can demonstrate that.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - Nothing about the token format or how a session id reaches the server. That is
 *   the next step, and it is deliberately behind SessionReader.
 * - Nothing about session creation or rotation — sign-in does not exist yet, so these
 *   tests insert session rows directly.
 * - Nothing about timing attacks on session lookup.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DbCallerResolver, type Queryable } from "./db-caller-resolver.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "..", "..", "..", "db", "migrations");
const APP_ROLE = "pryvis_app";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_A = "55555555-5555-4555-8555-555555555555";

let db: PGlite;
let resolver: DbCallerResolver;

function adapt(pg: PGlite): Queryable {
  const client: Queryable = {
    async $executeRawUnsafe(query, ...values) {
      return (await pg.query(query, values)).affectedRows ?? 0;
    },
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]) {
      return (await pg.query<T>(query, values)).rows;
    },
    async $transaction(fn) {
      await pg.exec("BEGIN");
      try {
        const out = await fn(client);
        await pg.exec("COMMIT");
        return out;
      } catch (error) {
        await pg.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return client;
}

/** Inserts a session row directly; sign-in does not exist yet. */
async function giveSession(
  id: string,
  userId: string,
  tenantId: string,
  version: number,
  options: { expired?: boolean; revoked?: boolean } = {},
) {
  await db.query(
    `INSERT INTO app_session (id, user_id, tenant_id, version, expires_at, revoked_at)
     VALUES ($1, $2, $3, $4,
             now() + ($5::text)::interval,
             CASE WHEN $6::boolean THEN now() ELSE NULL END)`,
    [id, userId, tenantId, version, options.expired ? "-1 hour" : "1 hour", options.revoked ?? false],
  );
}

beforeEach(async () => {
  db = new PGlite();
  for (const name of (await readdir(MIGRATIONS, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()) {
    await db.exec(await readFile(join(MIGRATIONS, name, "migration.sql"), "utf8"));
  }
  await db.exec(`
    CREATE ROLE ${APP_ROLE} NOLOGIN;
    GRANT USAGE ON SCHEMA public TO ${APP_ROLE};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};
  `);

  for (const [tenant, user, email] of [
    [TENANT_A, USER_A, "a@example.com"],
    [TENANT_B, USER_B, "b@example.com"],
  ] as const) {
    await db.query(
      `INSERT INTO tenant (id, name, country_code, currency, updated_at)
       VALUES ($1, $2, 'JM', 'JMD', now())`,
      [tenant, `Tenant ${tenant.slice(0, 1)}`],
    );
    await db.query(
      // No password column: credentials live in app_credential (ADR 0015).
      `INSERT INTO app_user (id, tenant_id, email, role, session_version, updated_at)
       VALUES ($1, $2, $3, 'owner', 0, now())`,
      [user, tenant, email],
    );
  }
  await giveSession(SESSION_A, USER_A, TENANT_A, 0);

  // From here on, the unprivileged role — the identity the policies are written for.
  await db.exec(`SET ROLE ${APP_ROLE};`);
  resolver = new DbCallerResolver(adapt(db));
});

afterEach(async () => {
  await db.close();
});

describe("resolving a live session", () => {
  it("returns the caller, with the tenant taken from the session store", async () => {
    const result = await resolver.resolve({ sessionId: SESSION_A, version: 0 });

    expect(result).toEqual({
      ok: true,
      caller: { userId: USER_A, tenantId: TENANT_A, role: "owner" },
    });
  });

  it("reads the role from the database on every request, so a demotion bites at once", async () => {
    // The finding this whole class answers: with the role in a token, this change
    // would not take effect for up to thirty days.
    expect(await resolver.resolve({ sessionId: SESSION_A, version: 0 })).toMatchObject({
      caller: { role: "owner" },
    });

    await db.exec("RESET ROLE");
    await db.query(`UPDATE app_user SET role = 'staff' WHERE id = $1`, [USER_A]);
    await db.exec(`SET ROLE ${APP_ROLE};`);

    expect(await resolver.resolve({ sessionId: SESSION_A, version: 0 })).toMatchObject({
      caller: { role: "staff" },
    });
  });
});

describe("refusals", () => {
  it("refuses when nothing was presented", async () => {
    expect(await resolver.resolve(null)).toEqual({ ok: false, refusal: "no-session" });
  });

  it("answers an unknown session exactly as a revoked or expired one", async () => {
    // Three different truths, one answer. Distinguishing them would let a probe learn
    // whether a session ever existed, and whether it was revoked.
    await giveSession("66666666-6666-4666-8666-666666666666", USER_A, TENANT_A, 0, {
      revoked: true,
    });
    await giveSession("77777777-7777-4777-8777-777777777777", USER_A, TENANT_A, 0, {
      expired: true,
    });

    const unknown = await resolver.resolve({
      sessionId: "99999999-9999-4999-8999-999999999999",
      version: 0,
    });
    const revoked = await resolver.resolve({
      sessionId: "66666666-6666-4666-8666-666666666666",
      version: 0,
    });
    const expired = await resolver.resolve({
      sessionId: "77777777-7777-4777-8777-777777777777",
      version: 0,
    });

    expect(unknown).toEqual({ ok: false, refusal: "unknown-session" });
    expect(revoked).toEqual(unknown);
    expect(expired).toEqual(unknown);
  });

  it("refuses a token whose version does not match the session", async () => {
    expect(await resolver.resolve({ sessionId: SESSION_A, version: 1 })).toEqual({
      ok: false,
      refusal: "session-superseded",
    });
  });

  it("kills every live session for a user when their session_version is bumped", async () => {
    // Sign-out-everywhere, password change, suspected compromise: one UPDATE, with no
    // blacklist to maintain and nothing to wait out.
    expect(await resolver.resolve({ sessionId: SESSION_A, version: 0 })).toMatchObject({ ok: true });

    await db.exec("RESET ROLE");
    await db.query(`UPDATE app_user SET session_version = session_version + 1 WHERE id = $1`, [
      USER_A,
    ]);
    await db.exec(`SET ROLE ${APP_ROLE};`);

    expect(await resolver.resolve({ sessionId: SESSION_A, version: 0 })).toEqual({
      ok: false,
      refusal: "session-superseded",
    });
  });

  it("refuses a deactivated user immediately", async () => {
    await db.exec("RESET ROLE");
    await db.query(`UPDATE app_user SET deactivated_at = now() WHERE id = $1`, [USER_A]);
    await db.exec(`SET ROLE ${APP_ROLE};`);

    expect(await resolver.resolve({ sessionId: SESSION_A, version: 0 })).toEqual({
      ok: false,
      refusal: "user-deactivated",
    });
  });

  it("refuses every user of a suspended tenant immediately", async () => {
    await db.exec("RESET ROLE");
    await db.query(`UPDATE tenant SET suspended_at = now() WHERE id = $1`, [TENANT_A]);
    await db.exec(`SET ROLE ${APP_ROLE};`);

    expect(await resolver.resolve({ sessionId: SESSION_A, version: 0 })).toEqual({
      ok: false,
      refusal: "tenant-suspended",
    });
  });

  it("refuses a session whose tenant does not own its user", async () => {
    // A tampered or corrupted session row pointing a tenant at someone else's user.
    // Row-level security refuses the join in step 3, so this cannot resolve — which
    // is the property that makes step 1's RLS exemption safe.
    await db.exec("RESET ROLE");
    await giveSession("88888888-8888-4888-8888-888888888888", USER_B, TENANT_A, 0);
    await db.exec(`SET ROLE ${APP_ROLE};`);

    expect(
      await resolver.resolve({ sessionId: "88888888-8888-4888-8888-888888888888", version: 0 }),
    ).toEqual({ ok: false, refusal: "unknown-session" });
  });
});
