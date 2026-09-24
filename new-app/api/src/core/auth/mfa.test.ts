/**
 * The second factor, against a real database.
 *
 * The arithmetic is proved elsewhere against RFC 6238's published vectors, and the sealing against
 * rotation. What is left is the part a correct TOTP implementation still gets wrong, and it is all
 * state: a factor that grants access before anybody proved they hold it, a code that works twice
 * inside its 30-second window, a lock an attacker resets by signing in again, and a recovery code
 * spent more than once.
 *
 * WHAT THIS FILE DOES NOT PROVE
 *
 * - Nothing about HTTP: no cookie, no two-step form, no CSRF. The transport does not exist yet, so
 *   what is proved is that the session row is left in a state the resolver refuses until a factor
 *   is verified — the resolver's own test owns the refusal.
 * - Nothing about the real concurrency of the recovery-code claim. The single-statement UPDATE is
 *   what makes it safe; PGlite is one connection, so this proves the statement claims a code
 *   exactly once, not that two connections race correctly.
 * - Nothing about a reset performed by another staff member. Deliberately unbuilt: there is no
 *   disableMfa(), and the re-enrolment path arrives with the staff console.
 * - Nothing about wall-clock time. Every expiry here is measured against the injected clock.
 */
import { APP_ROLE, applyMigrations } from "@pryvis/db/test-support";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  MFA_FAILED_MESSAGE,
  MFA_LOCK_MINUTES,
  MFA_MAX_FAILURES,
  MFA_REAUTH_MINUTES,
  MfaError,
  MfaService,
  RECOVERY_CODE_COUNT,
  hashRecoveryCode,
  normaliseRecoveryCode,
  type MfaQueryable,
} from "./mfa.js";
import { PostgresRateLimiter, type RateLimitStore } from "../rate-limit/rate-limiter.js";
import { KeyRegistry } from "./secret-box.js";
import { TOTP_STEP_SECONDS, totpCode, totpStep } from "./totp.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EMAIL = "staff@pryvis.com";

const KEY_A = Buffer.alloc(32, 1).toString("base64");
const KEY_B = Buffer.alloc(32, 2).toString("base64");

let db: PGlite;
let mfa: MfaService;
let clock: Date;
let ids: number;

function adapt(pg: PGlite): MfaQueryable {
  const client = {
    async $executeRawUnsafe(query: string, ...values: unknown[]) {
      return (await pg.query(query, values)).affectedRows ?? 0;
    },
    async $queryRawUnsafe<T>(query: string, ...values: unknown[]) {
      return (await pg.query<T>(query, values)).rows as T[];
    },
    async $transaction<T>(fn: (tx: MfaQueryable) => Promise<T>) {
      await pg.exec("BEGIN");
      try {
        const out = await fn(client as MfaQueryable);
        await pg.exec("COMMIT");
        return out;
      } catch (error) {
        await pg.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return client as MfaQueryable;
}

/** A deterministic id generator: which id was used is never the thing under test here. */
function nextId(): string {
  ids += 1;
  return `dddddddd-dddd-4ddd-8ddd-${String(ids).padStart(12, "0")}`;
}

/** The code the phone would be showing at the injected moment. */
function codeNow(secret: string, stepOffset = 0): string {
  return totpCode(secret, totpStep(Math.floor(clock.getTime() / 1000)) + stepOffset);
}

async function grantCapability(userId: string) {
  await db.query(
    `INSERT INTO platform_capability (id, user_id, capability)
     VALUES ($1, $2, 'impersonate_tenant')`,
    [nextId(), userId],
  );
}

async function factorRow(userId = USER) {
  const { rows } = await db.query<{
    confirmed_at: Date | null;
    failed_attempts: number;
    locked_until: Date | null;
    last_used_step: string | null;
    secret_key_id: string;
  }>(
    `SELECT confirmed_at, failed_attempts, locked_until, last_used_step, secret_key_id
       FROM mfa_totp WHERE user_id = $1`,
    [userId],
  );
  return rows[0]!;
}

async function sessionRow(sessionId = SESSION) {
  const { rows } = await db.query<{ mfa_pending: boolean; mfa_verified_at: Date | null }>(
    `SELECT mfa_pending, mfa_verified_at FROM app_session WHERE id = $1`,
    [sessionId],
  );
  return rows[0]!;
}

async function auditActions(): Promise<string[]> {
  const { rows } = await db.query<{ action: string }>(`SELECT action FROM audit_entry`);
  return rows.map((row) => row.action);
}

/**
 * Enrols and confirms, then moves the clock on one step.
 *
 * The step is deliberate, and the first draft of this file did not have it: confirmation spends a
 * step, so a test that verified the SAME code immediately afterwards was refused as a replay. The
 * replay guard was right and the test was wrong — recorded here because the next reader will
 * otherwise conclude the helper is being tidy about time for no reason.
 */
async function enrol(): Promise<{
  secret: string;
  codes: readonly string[];
  /** The code spent on confirmation. Still within the drift window, and must stay refused. */
  confirmedCode: string;
}> {
  const client = adapt(db);
  const enrolment = await mfa.beginEnrolment(client, {
    userId: USER,
    tenantId: TENANT,
    accountEmail: EMAIL,
  });
  const confirmedCode = codeNow(enrolment.secret);
  const { codes } = await mfa.confirmEnrolment(client, {
    userId: USER,
    tenantId: TENANT,
    code: confirmedCode,
  });
  clock = new Date(clock.getTime() + TOTP_STEP_SECONDS * 1000);
  return { secret: enrolment.secret, codes, confirmedCode };
}

/** Verification, with the arguments every test repeats. */
function verify(code: string, options: { userId?: string; sessionId?: string } = {}) {
  return mfa.verify(adapt(db), {
    userId: options.userId ?? USER,
    tenantId: TENANT,
    sessionId: options.sessionId ?? SESSION,
    code,
  });
}

function serviceWith(keys: string) {
  const client = adapt(db);
  return new MfaService(
    client,
    KeyRegistry.fromConfig(keys),
    new PostgresRateLimiter(client as unknown as RateLimitStore, () => clock),
    nextId,
    () => clock,
  );
}

beforeEach(async () => {
  db = new PGlite();
  await applyMigrations(db);

  await db.query(
    `INSERT INTO tenant (id, name, country_code, currency, updated_at)
     VALUES ($1, 'Pryvis Staff', 'JM', 'JMD', now())`,
    [TENANT],
  );
  for (const [id, email] of [
    [USER, EMAIL],
    [OTHER_USER, "other@pryvis.com"],
  ] as const) {
    await db.query(
      `INSERT INTO app_user (id, tenant_id, email, role, session_version, updated_at)
       VALUES ($1, $2, $3, 'owner', 0, now())`,
      [id, TENANT, email],
    );
  }
  await db.query(
    `INSERT INTO app_session (id, user_id, tenant_id, version, expires_at, mfa_pending)
     VALUES ($1, $2, $3, 0, now() + interval '1 day', true)`,
    [SESSION, USER, TENANT],
  );

  await db.exec(`SET ROLE ${APP_ROLE};`);
  // The audit table is tenant-scoped like everything else, so a write needs the tenant set.
  await db.query(`SELECT set_config('app.tenant_id', $1, false)`, [TENANT]);

  ids = 0;
  clock = new Date("2026-09-24T12:00:00.000Z");
  mfa = serviceWith(`k1:${KEY_A}`);
});

afterEach(async () => {
  await db.close();
});

describe("who needs a factor", () => {
  it("requires one of anyone holding a platform capability", async () => {
    expect(await mfa.requiresFactor(adapt(db), USER)).toBe(false);
    await grantCapability(USER);
    expect(await mfa.requiresFactor(adapt(db), USER)).toBe(true);
  });

  it("stops requiring one when the capability is revoked", async () => {
    // Asked of the database on every sign-in rather than cached on the user: a capability granted
    // an hour ago must require a factor now, and a revoked one must stop requiring it.
    await grantCapability(USER);
    await db.query(`UPDATE platform_capability SET revoked_at = now() WHERE user_id = $1`, [USER]);
    expect(await mfa.requiresFactor(adapt(db), USER)).toBe(false);
  });

  it("does not require one because a colleague holds a capability", async () => {
    await grantCapability(OTHER_USER);
    expect(await mfa.requiresFactor(adapt(db), USER)).toBe(false);
  });
});

describe("enrolment", () => {
  it("stores the secret sealed, never in plaintext", async () => {
    const enrolment = await mfa.beginEnrolment(adapt(db), {
      userId: USER,
      tenantId: TENANT,
      accountEmail: EMAIL,
    });

    const { rows } = await db.query<{ secret_ciphertext: Uint8Array }>(
      `SELECT secret_ciphertext FROM mfa_totp WHERE user_id = $1`,
      [USER],
    );
    const stored = Buffer.from(rows[0]!.secret_ciphertext);
    expect(stored.toString("utf8")).not.toContain(enrolment.secret);
    expect(stored.toString("base64")).not.toContain(enrolment.secret);
  });

  it("grants nothing until a code proves the secret reached a phone", async () => {
    // An unconfirmed factor means a secret was issued and may never have been scanned.
    await mfa.beginEnrolment(adapt(db), { userId: USER, tenantId: TENANT, accountEmail: EMAIL });

    expect((await factorRow()).confirmed_at).toBeNull();
    expect(await mfa.hasConfirmedFactor(adapt(db), USER)).toBe(false);
  });

  it("refuses to confirm with the wrong code, and says nothing more", async () => {
    await mfa.beginEnrolment(adapt(db), { userId: USER, tenantId: TENANT, accountEmail: EMAIL });

    await expect(
      mfa.confirmEnrolment(adapt(db), { userId: USER, tenantId: TENANT, code: "000000" }),
    ).rejects.toThrow(MFA_FAILED_MESSAGE);
    expect((await factorRow()).confirmed_at).toBeNull();
  });

  it("issues recovery codes once confirmed, keeping only their hashes", async () => {
    const { codes } = await enrol();

    expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT);

    const { rows } = await db.query<{ code_hash: string }>(
      `SELECT code_hash FROM mfa_recovery_code WHERE user_id = $1`,
      [USER],
    );
    expect(rows).toHaveLength(RECOVERY_CODE_COUNT);
    // What is stored must not be what was shown.
    for (const row of rows) {
      expect(codes.some((code) => code === row.code_hash)).toBe(false);
    }
    expect(rows.map((row) => row.code_hash).sort()).toEqual(codes.map(hashRecoveryCode).sort());
  });

  it("records the enrolment in the audit trail", async () => {
    await enrol();
    expect(await auditActions()).toContain("user.mfa_enrolled");
  });

  it("replaces an abandoned enrolment but never a confirmed one", async () => {
    const first = await mfa.beginEnrolment(adapt(db), {
      userId: USER,
      tenantId: TENANT,
      accountEmail: EMAIL,
    });
    // Somebody who closed the tab halfway should not be stuck with a secret they never scanned.
    const second = await mfa.beginEnrolment(adapt(db), {
      userId: USER,
      tenantId: TENANT,
      accountEmail: EMAIL,
    });
    expect(second.secret).not.toBe(first.secret);

    await mfa.confirmEnrolment(adapt(db), {
      userId: USER,
      tenantId: TENANT,
      code: codeNow(second.secret),
    });

    // Once confirmed, replacing the factor is a reset performed by somebody else. A self-service
    // overwrite would make the factor removable by whoever stole the password — which is the same
    // as not having a factor.
    await expect(
      mfa.beginEnrolment(adapt(db), { userId: USER, tenantId: TENANT, accountEmail: EMAIL }),
    ).rejects.toThrow(MfaError);
    // And the confirmed secret still works afterwards.
    clock = new Date(clock.getTime() + 60_000);
    expect((await verify(codeNow(second.secret))).ok).toBe(true);
  });

  it("carries the account into the provisioning URI", async () => {
    const enrolment = await mfa.beginEnrolment(adapt(db), {
      userId: USER,
      tenantId: TENANT,
      accountEmail: EMAIL,
    });
    expect(enrolment.provisioningUri).toContain(encodeURIComponent(`Pryvis:${EMAIL}`));
    expect(enrolment.provisioningUri).toContain(`secret=${enrolment.secret}`);
  });
});

describe("verification", () => {
  it("accepts the current code and marks the session verified", async () => {
    const { secret } = await enrol();

    expect((await verify(codeNow(secret))).ok).toBe(true);

    const session = await sessionRow();
    expect(session.mfa_pending).toBe(false);
    expect(session.mfa_verified_at).not.toBeNull();
  });

  it("refuses the same code a second time inside its own window", async () => {
    // THE REPLAY TEST. A code stays valid for its whole 30-second step, so "correct" is not
    // "unused": without the recorded step, a code read over a shoulder or captured in transit works
    // again, and the second factor stops being one.
    const { secret } = await enrol();
    const code = codeNow(secret);

    expect((await verify(code)).ok).toBe(true);

    const again = await verify(code);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.failure).toBe("replayed-code");
    expect(again.message).toBe(MFA_FAILED_MESSAGE);
  });

  it("refuses the code spent on confirmation, which is still inside the drift window", async () => {
    // Confirmation consumes a step like any other verification. That code is one step back and so
    // still arithmetically valid; accepting it would let the drift window be walked backwards.
    const { confirmedCode } = await enrol();
    const result = await verify(confirmedCode);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe("replayed-code");
  });

  it("accepts the next code once the clock moves on", async () => {
    const { secret } = await enrol();
    await verify(codeNow(secret));

    clock = new Date(clock.getTime() + 60_000);
    expect((await verify(codeNow(secret))).ok).toBe(true);
  });

  it("gives the same sentence for every refusal", async () => {
    // A caller who could tell "wrong code" from "locked" would know whether to keep going, and an
    // attacker holding a stolen password would learn that the account exists and is protected.
    const messages = new Set<string>();

    const noFactor = await verify("000000");
    expect(noFactor.ok).toBe(false);
    if (!noFactor.ok) {
      messages.add(noFactor.message);
      expect(noFactor.failure).toBe("no-factor");
    }

    await mfa.beginEnrolment(adapt(db), { userId: USER, tenantId: TENANT, accountEmail: EMAIL });
    const unconfirmed = await verify("000000");
    expect(unconfirmed.ok).toBe(false);
    if (!unconfirmed.ok) {
      messages.add(unconfirmed.message);
      expect(unconfirmed.failure).toBe("not-confirmed");
    }

    expect([...messages]).toEqual([MFA_FAILED_MESSAGE]);
  });

  it("leaves the session pending when verification fails", async () => {
    await enrol();
    await verify("000000");

    const session = await sessionRow();
    expect(session.mfa_pending).toBe(true);
    expect(session.mfa_verified_at).toBeNull();
  });
});

describe("the lock, which follows the person", () => {
  /** Exhausts the factor's allowance with wrong codes. */
  async function failUntilLocked() {
    for (let attempt = 0; attempt < MFA_MAX_FAILURES; attempt += 1) {
      const result = await verify("000000");
      expect(result.ok).toBe(false);
    }
  }

  it(`locks after ${MFA_MAX_FAILURES} consecutive failures and records it`, async () => {
    const { secret } = await enrol();
    await failUntilLocked();

    const row = await factorRow();
    expect(row.failed_attempts).toBe(MFA_MAX_FAILURES);
    expect(row.locked_until).not.toBeNull();
    expect(await auditActions()).toContain("user.mfa_locked");

    // And the CORRECT code is refused while the lock holds — otherwise the lock is decoration.
    clock = new Date(clock.getTime() + 60_000);
    const locked = await verify(codeNow(secret));
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.failure).toBe("locked");
  });

  it("survives a brand-new session, so the allowance cannot be reset by signing in again", async () => {
    // This is the whole reason the counter lives on the factor rather than the session: an attacker
    // who already has the password can open as many sessions as they like.
    const { secret } = await enrol();
    await failUntilLocked();

    const fresh = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await db.query(
      `INSERT INTO app_session (id, user_id, tenant_id, version, expires_at, mfa_pending)
       VALUES ($1, $2, $3, 0, now() + interval '1 day', true)`,
      [fresh, USER, TENANT],
    );

    clock = new Date(clock.getTime() + 60_000);
    expect((await verify(codeNow(secret), { sessionId: fresh })).ok).toBe(false);
    expect((await sessionRow(fresh)).mfa_pending).toBe(true);
  });

  it(`releases the lock after ${MFA_LOCK_MINUTES} minutes`, async () => {
    const { secret } = await enrol();
    await failUntilLocked();

    clock = new Date(clock.getTime() + (MFA_LOCK_MINUTES + 1) * 60_000);
    expect((await verify(codeNow(secret))).ok).toBe(true);
    expect((await factorRow()).failed_attempts).toBe(0);
  });

  it("clears the counter on a success, so occasional typos never accumulate to a lock", async () => {
    const { secret } = await enrol();
    await verify("000000");
    expect((await factorRow()).failed_attempts).toBe(1);

    clock = new Date(clock.getTime() + 60_000);
    await verify(codeNow(secret));
    expect((await factorRow()).failed_attempts).toBe(0);
  });

  it("does not lock a colleague's factor", async () => {
    // The counter is keyed to the person it belongs to. A shared counter would mean one staff
    // member's bad week locked the whole team out.
    await enrol();
    await failUntilLocked();
    expect(await factorRow(OTHER_USER)).toBeUndefined();
  });

  it("stops at the rate limiter before touching the factor", async () => {
    // The limiter is the first line and the cheap one: exhausting it must not require the HMAC to
    // have been computed, and must not spend the factor's own allowance — otherwise a flood locks
    // a staff member out of their own account.
    await enrol();
    await db.query(
      `INSERT INTO rate_limit_bucket (key, tokens, updated_at) VALUES ($1, 0, $2)
       ON CONFLICT (key) DO UPDATE SET tokens = 0, updated_at = EXCLUDED.updated_at`,
      [`mfa:user:${USER}`, clock.toISOString()],
    );

    const result = await verify("000000");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe("rate-limited");
    expect((await factorRow()).failed_attempts).toBe(0);
  });
});

describe("recovery codes", () => {
  it("accepts one in place of a code when the phone is gone", async () => {
    const { codes } = await enrol();

    expect((await verify(codes[0]!)).ok).toBe(true);
    expect((await sessionRow()).mfa_pending).toBe(false);
    // Recorded, because it is the one signal that an authenticator was lost or taken.
    expect(await auditActions()).toContain("user.mfa_recovery_code_used");
  });

  it("spends each code exactly once", async () => {
    const { codes } = await enrol();
    await verify(codes[0]!);

    clock = new Date(clock.getTime() + 60_000);
    expect((await verify(codes[0]!)).ok).toBe(false);

    const { rows } = await db.query<{ remaining: bigint }>(
      `SELECT count(*) AS remaining FROM mfa_recovery_code WHERE user_id = $1 AND used_at IS NULL`,
      [USER],
    );
    expect(Number(rows[0]!.remaining)).toBe(RECOVERY_CODE_COUNT - 1);
  });

  it("accepts one as it was printed, with the dashes and in lower case", async () => {
    // People retype these from paper. Refusing a code over its formatting means refusing the only
    // way back in.
    const { codes } = await enrol();
    const typed = codes[0]!.toLowerCase();

    expect((await verify(typed)).ok).toBe(true);
    expect(normaliseRecoveryCode(typed)).toBe(normaliseRecoveryCode(codes[0]!));
  });

  it("does not accept another person's recovery code", async () => {
    const { codes } = await enrol();
    // The colleague has their own confirmed factor and no recovery codes of their own.
    await db.query(
      `INSERT INTO mfa_totp (user_id, secret_ciphertext, secret_iv, secret_tag, secret_key_id,
                             confirmed_at, updated_at)
       SELECT $1, secret_ciphertext, secret_iv, secret_tag, secret_key_id, now(), now()
         FROM mfa_totp WHERE user_id = $2`,
      [OTHER_USER, USER],
    );

    expect((await verify(codes[0]!, { userId: OTHER_USER })).ok).toBe(false);
  });
});

describe("re-authentication", () => {
  it("answers whether the factor was proved recently, not merely ever", async () => {
    // `mfa_pending` answers "ever", which cannot answer this: a laptop walked away from has a
    // session that passed a factor hours ago, and starting an impersonation from it is exactly what
    // this prevents.
    const { secret } = await enrol();
    await verify(codeNow(secret));

    expect(await mfa.hasRecentVerification(adapt(db), SESSION)).toBe(true);

    clock = new Date(clock.getTime() + (MFA_REAUTH_MINUTES + 1) * 60_000);
    expect(await mfa.hasRecentVerification(adapt(db), SESSION)).toBe(false);
    // The session itself is still valid — this is a re-prompt, not a sign-out.
    expect((await sessionRow()).mfa_pending).toBe(false);
  });

  it("is false for a session that never verified", async () => {
    expect(await mfa.hasRecentVerification(adapt(db), SESSION)).toBe(false);
  });
});

describe("key rotation, at the only moment the plaintext is in hand", () => {
  it("re-seals a secret with the current key on the next successful verification", async () => {
    const { secret } = await enrol();
    expect((await factorRow()).secret_key_id).toBe("k1");

    // A rotation: k2 becomes current, k1 stays available so nobody re-enrols.
    mfa = serviceWith(`k2:${KEY_B},k1:${KEY_A}`);
    clock = new Date(clock.getTime() + 60_000);

    expect((await verify(codeNow(secret))).ok).toBe(true);
    expect((await factorRow()).secret_key_id).toBe("k2");

    // And the same secret still works, which is the point of rotating rather than re-enrolling.
    clock = new Date(clock.getTime() + 60_000);
    expect((await verify(codeNow(secret))).ok).toBe(true);
  });
});

describe("what is deliberately absent", () => {
  it("offers no way to disable a confirmed factor", () => {
    // A support path that removes a factor is the standard way MFA is defeated in practice, and the
    // way to not have one is to not write it. If this fails, somebody added the door.
    const methods = Object.getOwnPropertyNames(MfaService.prototype);
    expect(methods.filter((name) => /disable|remove|clear|unenrol|bypass/i.test(name))).toEqual([]);
  });
});
