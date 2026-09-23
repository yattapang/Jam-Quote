/**
 * Sign-in, against a real database — and the seam between sign-in and the resolver.
 *
 * The last test in this file is the one that matters most: a session issued by
 * SignInService must be resolvable by DbCallerResolver. Those two classes were written
 * separately, agree only by convention about the version snapshot, and a mocked test
 * of either would never notice them disagreeing. That is precisely the class of defect
 * the Phase 0 audit found living at seams.
 *
 * WHAT THIS FILE DOES NOT PROVE
 *
 * - Nothing about rate limiting. Sign-in costs ~67 MB and ~150 ms by design
 *   (ADR 0014), which makes a limiter necessary rather than optional. It is owed.
 * - Not that timing is actually equal for known and unknown emails. It asserts the
 *   decoy path runs; measuring wall-clock timing in a test runner would be flaky.
 * - Nothing about HTTP: no cookie, no header, no CSRF. That is the next step.
 * - Nothing about sign-up, invitations, or password reset. None exist yet.
 */
import { PGlite } from "@electric-sql/pglite";
import { randomBytes, scrypt, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DbCallerResolver, type Queryable } from "./db-caller-resolver.js";
import { hashPassword } from "./password.js";
import { PostgresRateLimiter, type RateLimitStore } from "../rate-limit/rate-limiter.js";
import {
  SIGN_IN_FAILED_MESSAGE,
  SIGN_IN_RATE_LIMITED_MESSAGE,
  SignInService,
  type SignInFailure,
} from "./sign-in.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, "..", "..", "..", "..", "db", "migrations");
const APP_ROLE = "pryvis_app";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMAIL = "owner@example.com";
const PASSWORD = "correct horse battery staple";

let db: PGlite;
let signIn: SignInService;
let failures: { email: string; reason: SignInFailure }[];
let clock: Date;

/** Every attempt in these tests comes from one address unless a test says otherwise. */
const FROM = { ip: "203.0.113.4" } as const;

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

/** Runs SQL as the privileged owner, for test setup only. */
async function asOwner(sql: string, params: unknown[] = []) {
  await db.exec("RESET ROLE");
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`SET ROLE ${APP_ROLE};`);
  }
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

  for (const [tenant, name] of [
    [TENANT, "Tenant A"],
    [OTHER_TENANT, "Tenant B"],
  ] as const) {
    await db.query(
      `INSERT INTO tenant (id, name, country_code, currency, updated_at)
       VALUES ($1, $2, 'JM', 'JMD', now())`,
      [tenant, name],
    );
  }
  await db.query(
    `INSERT INTO app_user (id, tenant_id, email, role, session_version, updated_at)
     VALUES ($1, $2, $3, 'owner', 0, now())`,
    [USER, TENANT, EMAIL],
  );
  await db.query(
    `INSERT INTO app_credential (id, user_id, tenant_id, email, password_hash, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
    [USER, TENANT, EMAIL, await hashPassword(PASSWORD)],
  );

  await db.exec(`SET ROLE ${APP_ROLE};`);
  failures = [];
  clock = new Date("2026-09-23T12:00:00.000Z");
  const limiter = new PostgresRateLimiter(adapt(db) as RateLimitStore, () => clock);
  signIn = new SignInService(
    adapt(db),
    { failed: (email, reason) => failures.push({ email, reason }) },
    limiter,
    () => clock,
  );
});

afterEach(async () => {
  await db.close();
});

describe("a correct sign-in", () => {
  it("issues a session carrying the user's current version", async () => {
    const result = await signIn.signIn(EMAIL, PASSWORD, FROM);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.version).toBe(0);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(failures).toEqual([]);
  });

  it("accepts the email in any case, with surrounding whitespace", async () => {
    // Addresses are case-insensitive in practice, and a phone keyboard capitalises.
    // Normalisation happens in one place, so the unique index means what it looks like.
    const result = await signIn.signIn(`  ${EMAIL.toUpperCase()} `, PASSWORD, FROM);

    expect(result.ok).toBe(true);
  });

  it("does not accept a password with different whitespace", async () => {
    // The asymmetry is deliberate: an email has a canonical form, a password is the
    // bytes the user chose. Trimming a password means accepting one at sign-up and
    // rejecting it at sign-in.
    expect(await signIn.signIn(EMAIL, ` ${PASSWORD}`, FROM)).toMatchObject({ ok: false });
  });

  it("expires the session in twelve hours, not thirty days", async () => {
    const fixed = new Date("2026-09-23T12:00:00.000Z");
    const service = new SignInService(
      adapt(db),
      { failed: () => undefined },
      new PostgresRateLimiter(adapt(db) as RateLimitStore, () => fixed),
      () => fixed,
    );

    const result = await service.signIn(EMAIL, PASSWORD, FROM);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expiresAt.toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });
});

describe("every failure looks the same to the caller", () => {
  it("gives one message for an unknown email, a wrong password, and a suspended tenant", async () => {
    await asOwner(`UPDATE tenant SET suspended_at = now() WHERE id = $1`, [OTHER_TENANT]);
    await asOwner(
      `INSERT INTO app_user (id, tenant_id, email, role, session_version, updated_at)
       VALUES ($1, $2, $3, 'owner', 0, now())`,
      ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", OTHER_TENANT, "suspended@example.com"],
    );
    await asOwner(
      `INSERT INTO app_credential (id, user_id, tenant_id, email, password_hash, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, now())`,
      [
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        OTHER_TENANT,
        "suspended@example.com",
        await hashPassword(PASSWORD),
      ],
    );

    const results = [
      await signIn.signIn("nobody@example.com", PASSWORD, FROM),
      await signIn.signIn(EMAIL, "wrong password entirely", FROM),
      await signIn.signIn("suspended@example.com", PASSWORD, FROM),
    ];

    for (const result of results) {
      expect(result).toEqual({ ok: false, message: SIGN_IN_FAILED_MESSAGE });
    }
    // The real reasons went to the log, where they belong.
    expect(failures.map((f) => f.reason)).toEqual([
      "unknown-email",
      "wrong-password",
      "tenant-suspended",
    ]);
  });

  it("refuses a deactivated user who types the right password", async () => {
    await asOwner(`UPDATE app_user SET deactivated_at = now() WHERE id = $1`, [USER]);

    expect(await signIn.signIn(EMAIL, PASSWORD, FROM)).toEqual({
      ok: false,
      message: SIGN_IN_FAILED_MESSAGE,
    });
    expect(failures.map((f) => f.reason)).toEqual(["user-deactivated"]);
  });

  it("issues no session when it refuses", async () => {
    await signIn.signIn(EMAIL, "wrong password entirely", FROM);
    await signIn.signIn("nobody@example.com", PASSWORD, FROM);

    const sessions = await asOwner(`SELECT id FROM app_session`);
    expect(sessions.rows).toHaveLength(0);
  });

  it("spends a hash on an unknown email, so response time is not an oracle", async () => {
    // Closing enumeration in the message and reopening it through a stopwatch would be
    // no improvement. This asserts the decoy path actually runs.
    const spy = vi.spyOn(await import("./password.js"), "verifyPassword");

    await signIn.signIn("definitely-not-registered@example.com", PASSWORD, FROM);

    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe("the cost is raised when it can be", () => {
  it("rehashes a stored hash written with weaker parameters", async () => {
    // A successful verify is the only moment the plaintext exists, so it is the only
    // moment the cost can be raised (ADR 0014). Without this, the upgrade path exists
    // on paper and nowhere else.
    const weak = await weakHashOf(PASSWORD);
    await asOwner(`UPDATE app_credential SET password_hash = $1 WHERE user_id = $2`, [weak, USER]);

    expect(await signIn.signIn(EMAIL, PASSWORD, FROM)).toMatchObject({ ok: true });

    const after = await asOwner(
      `SELECT password_hash FROM app_credential WHERE user_id = $1`,
      [USER],
    );
    const stored = (after.rows[0] as { password_hash: string }).password_hash;
    expect(stored).not.toBe(weak);
    expect(stored.split("$")[1]).toBe("65536");

    // And the user can still sign in with the same password afterwards.
    expect(await signIn.signIn(EMAIL, PASSWORD, FROM)).toMatchObject({ ok: true });
  });

  it("leaves a current hash alone", async () => {
    const before = await asOwner(
      `SELECT password_hash FROM app_credential WHERE user_id = $1`,
      [USER],
    );
    await signIn.signIn(EMAIL, PASSWORD, FROM);
    const after = await asOwner(
      `SELECT password_hash FROM app_credential WHERE user_id = $1`,
      [USER],
    );

    expect((after.rows[0] as { password_hash: string }).password_hash).toBe(
      (before.rows[0] as { password_hash: string }).password_hash,
    );
  });
});

describe("the seam: a session sign-in issues is one the resolver accepts", () => {
  it("resolves to the same user and tenant", async () => {
    // Two classes written separately, agreeing only by convention about the version
    // snapshot. A mocked test of either would never notice them disagree — and this is
    // exactly where the previous application's costly defects lived.
    const result = await signIn.signIn(EMAIL, PASSWORD, FROM);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const resolved = await new DbCallerResolver(adapt(db)).resolve(result.session);

    expect(resolved).toEqual({
      ok: true,
      caller: { userId: USER, tenantId: TENANT, role: "owner" },
    });
  });

  it("stops resolving the moment session_version is bumped", async () => {
    const result = await signIn.signIn(EMAIL, PASSWORD, FROM);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await asOwner(`UPDATE app_user SET session_version = session_version + 1 WHERE id = $1`, [USER]);

    expect(await new DbCallerResolver(adapt(db)).resolve(result.session)).toEqual({
      ok: false,
      refusal: "session-superseded",
    });
  });
});

/** A hash in the stored format but with the cost we used to use. */
async function weakHashOf(password: string): Promise<string> {
  const derive = promisify(scrypt) as (
    password: string,
    salt: Buffer,
    keylen: number,
    options: ScryptOptions,
  ) => Promise<Buffer>;
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 32, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 96 * 1024 * 1024,
  });
  return ["scrypt", 16_384, 8, 1, salt.toString("base64"), hash.toString("base64")].join("$");
}

describe("rate limiting protects the expensive path", () => {
  it("stops accepting attempts for an address once its bucket is empty", async () => {
    // Ten wrong passwords are allowed (a real person does fumble); the eleventh is not.
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const result = await signIn.signIn(EMAIL, "wrong password entirely", FROM);
      expect(result).toMatchObject({ ok: false, message: SIGN_IN_FAILED_MESSAGE });
    }

    const limited = await signIn.signIn(EMAIL, "wrong password entirely", FROM);

    expect(limited.ok).toBe(false);
    if (limited.ok) return;
    expect(limited.message).toBe(SIGN_IN_RATE_LIMITED_MESSAGE);
    expect(limited.retryAfterSeconds).toBeGreaterThan(0);
    expect(failures.at(-1)?.reason).toBe("rate-limited-email");
  });

  it("refuses the CORRECT password once the limit is hit, and does not issue a session", async () => {
    // The point of a limiter: it must not be possible to grind through a wordlist and
    // be let in on the attempt that happens to be right.
    for (let i = 0; i < 10; i += 1) await signIn.signIn(EMAIL, "wrong password entirely", FROM);

    const result = await signIn.signIn(EMAIL, PASSWORD, FROM);

    expect(result).toMatchObject({ ok: false, message: SIGN_IN_RATE_LIMITED_MESSAGE });
    const sessions = await asOwner(`SELECT id FROM app_session`);
    expect(sessions.rows).toHaveLength(0);
  });

  it("lets the address try again once the bucket has refilled", async () => {
    for (let i = 0; i < 10; i += 1) await signIn.signIn(EMAIL, "wrong password entirely", FROM);
    expect(await signIn.signIn(EMAIL, PASSWORD, FROM)).toMatchObject({
      message: SIGN_IN_RATE_LIMITED_MESSAGE,
    });

    // One token every thirty seconds.
    clock = new Date(clock.getTime() + 30_000);

    expect(await signIn.signIn(EMAIL, PASSWORD, FROM)).toMatchObject({ ok: true });
  });

  it("clears the address's bucket after a success, so fumbling is not remembered", async () => {
    for (let i = 0; i < 9; i += 1) await signIn.signIn(EMAIL, "wrong password entirely", FROM);

    expect(await signIn.signIn(EMAIL, PASSWORD, FROM)).toMatchObject({ ok: true });

    // Back to a full bucket: nine more wrong attempts are tolerated again.
    for (let i = 0; i < 9; i += 1) {
      expect(await signIn.signIn(EMAIL, "wrong password entirely", FROM)).toMatchObject({
        message: SIGN_IN_FAILED_MESSAGE,
      });
    }
  });

  it("limits an unknown address too, so waiting does not confirm an account exists", async () => {
    // If the limit only applied to registered addresses, being told to wait would be an
    // enumeration oracle — the exact thing the single failure message closes.
    for (let i = 0; i < 10; i += 1) {
      await signIn.signIn("nobody@example.com", PASSWORD, FROM);
    }

    const limited = await signIn.signIn("nobody@example.com", PASSWORD, FROM);
    expect(limited).toMatchObject({ message: SIGN_IN_RATE_LIMITED_MESSAGE });
  });

  it("caps attempts per IP across many different addresses", async () => {
    // Varying the email defeats the per-email limit entirely, which is why there are
    // two dimensions. Thirty attempts from one address, then it stops.
    for (let i = 0; i < 30; i += 1) {
      const result = await signIn.signIn(`nobody-${i}@example.com`, PASSWORD, FROM);
      expect(result).toMatchObject({ ok: false, message: SIGN_IN_FAILED_MESSAGE });
    }

    const limited = await signIn.signIn("nobody-31@example.com", PASSWORD, FROM);

    expect(limited).toMatchObject({ message: SIGN_IN_RATE_LIMITED_MESSAGE });
    expect(failures.at(-1)?.reason).toBe("rate-limited-ip");
  });

  it("delays, but does not lock out, a user targeted by a flood from elsewhere", async () => {
    // THIS TEST DISPROVED A CLAIM I HAD WRITTEN IN A COMMENT. I had asserted that
    // checking the IP limit first prevented a flood from draining the target's email
    // bucket. It does not, and no per-email limit can: attempts from anywhere count
    // against the address being attacked.
    //
    // So the honest property is not "cannot be locked out", it is "cannot be locked out
    // for long". That is the trade every per-account limiter makes, and it is worth
    // making — the alternative is an account that can be guessed at indefinitely.
    for (let i = 0; i < 40; i += 1) {
      await signIn.signIn(EMAIL, "wrong password entirely", { ip: "198.51.100.9" });
    }

    // The real user, from their own address, is refused right now.
    expect(await signIn.signIn(EMAIL, PASSWORD, FROM)).toMatchObject({
      ok: false,
      message: SIGN_IN_RATE_LIMITED_MESSAGE,
    });

    // But only for seconds: one token returns every thirty.
    clock = new Date(clock.getTime() + 30_000);

    expect(await signIn.signIn(EMAIL, PASSWORD, FROM)).toMatchObject({ ok: true });
  });
});
