/**
 * CORE: auth — turning an email and a password into a session.
 *
 * Owns:        the sign-in decision, and the only place a session is created.
 * Trusts:      core/auth/password for the comparison, and its own tables.
 * Never does:  say which of the two inputs was wrong; issue a session for a
 *              deactivated user or a suspended tenant; let the caller choose a tenant.
 *
 * THE THREE THINGS THAT MAKE THIS MORE THAN A LOOKUP
 *
 * 1. ONE ANSWER FOR EVERY FAILURE. Unknown email, wrong password, deactivated user,
 *    suspended tenant — all "Email or password is wrong." A form that says "no such
 *    account" is an account-enumeration API with a friendly face.
 *
 * 2. THE SAME WORK WHETHER THE EMAIL EXISTS OR NOT. If an unknown email returned
 *    immediately while a known one spent 150ms hashing, the response time would tell
 *    an attacker which addresses are registered — the enumeration we just closed,
 *    reopened through a stopwatch. So an unknown email is verified against a real
 *    decoy hash that no password matches.
 *
 * 3. THE COST IS RAISED WHEN IT CAN BE. A successful verify is the only moment the
 *    plaintext exists, so it is the only moment a weaker stored hash can be upgraded
 *    (ADR 0014). This is where needsRehash is called.
 */
import { createHash, randomUUID } from "node:crypto";

import { type SessionRef } from "./caller.js";
import {
  RATE_LIMITS,
  type RateLimiter,
  emailKey,
  ipKey,
} from "../rate-limit/rate-limiter.js";
import { hashPassword, needsRehash, verifyPassword } from "./password.js";
import { type Queryable } from "./db-caller-resolver.js";
import { withTenant, withoutTenant } from "../tenancy/tenant-context.js";

/**
 * The single sentence a failed sign-in produces.
 *
 * Deliberately not "we couldn't find that account" and not "wrong password". The one
 * message is the control; everything specific goes to the log.
 */
export const SIGN_IN_FAILED_MESSAGE = "Email or password is wrong.";

/**
 * What a rate-limited caller is told.
 *
 * Necessarily different from the message above — a person who has genuinely mistyped
 * six times needs to know that waiting will help, or they will keep trying and
 * conclude the product is broken. It is safe to distinguish because the limit is
 * consumed for unknown addresses too, so this sentence says nothing about whether an
 * account exists.
 */
export const SIGN_IN_RATE_LIMITED_MESSAGE =
  "Too many sign-in attempts. Please wait a moment and try again.";

export type SignInResult =
  | {
      readonly ok: true;
      readonly session: SessionRef;
      readonly expiresAt: Date;
      /**
       * The second step, when there is one.
       *
       * `ok: true` and a session, but the session is `mfa_pending` and the resolver refuses it —
       * so this is not "signed in", it is "the password was right". The transport shows the code
       * prompt, or the enrolment page when `enrolmentRequired`.
       *
       * Returned rather than throwing, and the session is issued rather than held in memory,
       * because the alternative is a half-authenticated state living somewhere else: a signed
       * "half token", or a server-side map. Both are new things to get wrong. This way the only
       * record of a half-finished sign-in is the same session row, with one boolean, and every
       * existing revocation and expiry applies to it unchanged.
       */
      readonly secondFactor?: {
        /** The person must type a code from their authenticator (or a recovery code). */
        readonly required: true;
        /**
         * True when a factor is required of them and they have none confirmed — a capability was
         * granted before they enrolled. They may reach enrolment and nothing else.
         */
        readonly enrolmentRequired: boolean;
      };
    }
  | {
      readonly ok: false;
      readonly message: string;
      /**
       * Present only when a limit was hit, for a Retry-After header. It reveals
       * nothing about the account: the limit is consumed for unknown addresses too,
       * so being told to wait does not confirm anyone is registered.
       */
      readonly retryAfterSeconds?: number;
    };

/** Why a sign-in failed. For the log and the audit trail — never for the response. */
export type SignInFailure =
  | "unknown-email"
  | "wrong-password"
  | "user-deactivated"
  | "tenant-suspended"
  | "rate-limited-email"
  | "rate-limited-ip";

/**
 * How long a session lasts without being used.
 *
 * Twelve hours, not the thirty days the Phase 0 audit found. A contractor's working
 * day fits inside it, and a stolen token has a bounded life even before
 * session_version is bumped. Rotation-on-use is owed — see the consequences in
 * ADR 0013.
 */
export const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;

/**
 * A hash no password produces, used to spend the same CPU on an unknown email as on a
 * known one.
 *
 * It is a real hash of a random value, generated once at module load, so it exercises
 * the identical code path with today's parameters. A hard-coded string would drift out
 * of date the moment the cost is raised, and then the timing difference would quietly
 * come back.
 */
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(`decoy-${randomUUID()}-${randomUUID()}`);
  return decoyHash;
}

interface CredentialRow {
  user_id: string;
  tenant_id: string;
  password_hash: string;
}

interface UserStateRow {
  session_version: number;
  deactivated: boolean;
  tenant_suspended: boolean;
  /** A confirmed factor. An unconfirmed one protects nobody and does not count. */
  has_confirmed_factor: boolean;
  /** At least one unrevoked platform capability, which makes a factor mandatory (Rule 5.1). */
  holds_capability: boolean;
}

export interface SignInLog {
  /**
   * Called on every failure, with the real reason. Never reaches the caller.
   *
   * @param emailFingerprint a short hash of the address, NOT the address (F14, independent
   *   review 2026-09-24). Sign-in used to log the plaintext email on every failure, which
   *   contradicts Rule 5 — no personal data in logs — and contradicted ADR 0016's own reasoning,
   *   since the rate limiter hashes the same address for the same reason two files away. A failed
   *   sign-in is exactly when an address is most likely to be someone else's: a typo, or an
   *   attacker working through a list. Logging it puts other people's addresses in our logs.
   *
   *   The fingerprint keeps what the log is actually for: correlating repeated failures against
   *   one address, and matching a log line to a rate-limit bucket. It is not reversible by
   *   reading, and it is reversible by guessing a known address — the same honest limit ADR 0016
   *   records for the bucket keys.
   */
  failed(emailFingerprint: string, reason: SignInFailure): void;
}

/**
 * A short, stable fingerprint of a normalised address, for logs and audit entries.
 *
 * Deliberately the same construction the rate limiter uses, truncated: a log line and a bucket
 * can be matched to each other without either holding the address.
 */
export function emailFingerprint(normalisedEmail: string): string {
  return createHash("sha256").update(normalisedEmail).digest("hex").slice(0, 16);
}

export class SignInService {
  constructor(
    private readonly db: Queryable,
    private readonly log: SignInLog,
    /**
     * Not optional. Sign-in costs ~67 MB and ~150 ms by design (ADR 0014) on an
     * unauthenticated endpoint, so a few hundred concurrent attempts would exhaust
     * the instance without guessing a single password. A constructor that allowed
     * this to be omitted would eventually be called without it.
     */
    private readonly limiter: RateLimiter,
    /** Injected so tests can control expiry without waiting twelve hours. */
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Normalises an email to the one form the unique index is written against.
   *
   * Lower-cased and trimmed HERE and only here. Addresses are case-insensitive in
   * practice, and a user who capitalises differently on their phone must still get in.
   * Note the asymmetry with passwords, which are never trimmed: an email has a
   * canonical form, a password is bytes the user chose.
   */
  static normaliseEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /**
   * @param from Where the attempt came from. The IP is required rather than optional:
   *   the per-email limit alone is trivially defeated by varying the address, and an
   *   optional parameter is one a caller forgets.
   */
  async signIn(
    email: string,
    password: string,
    from: { readonly ip: string },
  ): Promise<SignInResult> {
    const normalised = SignInService.normaliseEmail(email);

    // Limits are checked BEFORE the hash, which is the whole point: the expensive work
    // must be what is being protected, not what happens first.
    //
    // The IP limit is checked FIRST because it is the one protecting the machine: a
    // flooding host is cut off before we do any per-account work for it.
    //
    // A KNOWN WEAKNESS, found by a test that disproved an earlier claim in this
    // comment: attempts from any address still drain the TARGET's email bucket, so an
    // attacker can deliberately delay one user's sign-in. Ordering does not prevent
    // that, and no per-email limit can — the choice is between "an account can be
    // guessed at forever" and "an account can be delayed". We take the delay, and keep
    // it SHORT: the bucket refills a token every thirty seconds, so the legitimate user
    // is inconvenienced for seconds rather than locked out, and there is a test that
    // holds that property. ADR 0016 records it as accepted rather than solved.
    const ip = await this.limiter.consume(ipKey("signin", from.ip), RATE_LIMITS.signInPerIp);
    if (!ip.allowed) {
      this.log.failed(emailFingerprint(normalised), "rate-limited-ip");
      return {
        ok: false,
        message: SIGN_IN_RATE_LIMITED_MESSAGE,
        retryAfterSeconds: ip.retryAfterSeconds,
      };
    }

    const perEmail = await this.limiter.consume(
      emailKey("signin", normalised),
      RATE_LIMITS.signInPerEmail,
    );
    if (!perEmail.allowed) {
      this.log.failed(emailFingerprint(normalised), "rate-limited-email");
      return {
        ok: false,
        message: SIGN_IN_RATE_LIMITED_MESSAGE,
        retryAfterSeconds: perEmail.retryAfterSeconds,
      };
    }

    // The bootstrap read, outside row-level security. app_credential is one of exactly
    // two tables that allow this, and the reason is in its migration.
    const credentials = await withoutTenant(this.db, "authentication", (tx) =>
      (tx as Queryable).$queryRawUnsafe<CredentialRow>(
        `SELECT user_id, tenant_id, password_hash FROM app_credential WHERE email = $1`,
        normalised,
      ),
    );

    const credential = credentials[0];

    // Point 2 in the header: an unknown email still pays for a hash, so the response
    // time says nothing about whether the address is registered.
    if (!credential) {
      await verifyPassword(password, await getDecoyHash());
      this.log.failed(emailFingerprint(normalised), "unknown-email");
      return { ok: false, message: SIGN_IN_FAILED_MESSAGE };
    }

    const passwordMatches = await verifyPassword(password, credential.password_hash);
    if (!passwordMatches) {
      this.log.failed(emailFingerprint(normalised), "wrong-password");
      return { ok: false, message: SIGN_IN_FAILED_MESSAGE };
    }

    // The tenant comes from the credential row — our own store — and everything from
    // here runs under row-level security with it set. Same order of operations as
    // DbCallerResolver, for the same reason.
    const state = await withTenant(this.db, credential.tenant_id, (tx) =>
      (tx as Queryable).$queryRawUnsafe<UserStateRow>(
        `SELECT u.session_version,
                (u.deactivated_at IS NOT NULL) AS deactivated,
                (t.suspended_at IS NOT NULL)   AS tenant_suspended,
                -- Whether a second step is needed is decided HERE, in the same statement as the
                -- rest of the user's state, rather than after the session is issued. A session
                -- inserted first and then marked pending would be fully valid for the width of
                -- that gap, which is the kind of window that only ever shows up in production.
                EXISTS (
                  SELECT 1 FROM mfa_totp m
                   WHERE m.user_id = u.id AND m.confirmed_at IS NOT NULL
                ) AS has_confirmed_factor,
                EXISTS (
                  SELECT 1 FROM platform_capability pc
                   WHERE pc.user_id = u.id AND pc.revoked_at IS NULL
                ) AS holds_capability
           FROM app_user u
           JOIN tenant  t ON t.id = u.tenant_id
          WHERE u.id = $1`,
        credential.user_id,
      ),
    );

    const user = state[0];
    // No row means the user is gone, or that the credential's tenant does not own this
    // user — in which case the policies refused the join. Either way, not a sign-in.
    if (!user) {
      this.log.failed(emailFingerprint(normalised), "unknown-email");
      return { ok: false, message: SIGN_IN_FAILED_MESSAGE };
    }
    if (user.tenant_suspended) {
      // A correct password for a suspended tenant gets the same sentence as a wrong
      // one. Telling them "your account is suspended" here would confirm the address
      // exists to anyone who guessed it.
      this.log.failed(emailFingerprint(normalised), "tenant-suspended");
      return { ok: false, message: SIGN_IN_FAILED_MESSAGE };
    }
    if (user.deactivated) {
      this.log.failed(emailFingerprint(normalised), "user-deactivated");
      return { ok: false, message: SIGN_IN_FAILED_MESSAGE };
    }

    // Point 3: the only moment the plaintext exists is the only moment the cost can be
    // raised. Failing to store the upgrade must not fail the sign-in, so this is
    // attempted and not awaited for correctness — but it IS awaited, because a
    // swallowed rejection in the background is how "it upgrades on login" becomes
    // untrue without anyone noticing.
    if (needsRehash(credential.password_hash)) {
      const upgraded = await hashPassword(password);
      await withoutTenant(this.db, "authentication", (tx) =>
        tx.$executeRawUnsafe(
          `UPDATE app_credential SET password_hash = $1, updated_at = now() WHERE user_id = $2`,
          upgraded,
          credential.user_id,
        ),
      );
    }

    const sessionId = randomUUID();
    const expiresAt = new Date(this.now().getTime() + SESSION_LIFETIME_MS);

    /**
     * Is a second step required?
     *
     * Two independent reasons, and the second is the one that closes the hole: a confirmed factor
     * must obviously be used, but somebody holding a platform capability with NO factor must also
     * be stopped — otherwise the requirement would live only in the enrolment flow, and anyone who
     * skipped that flow would keep full staff access on a password alone (Rule 5.1).
     */
    const mfaPending = user.has_confirmed_factor || user.holds_capability;

    await withoutTenant(this.db, "authentication", (tx) =>
      tx.$executeRawUnsafe(
        `INSERT INTO app_session (id, user_id, tenant_id, version, expires_at, mfa_pending)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        sessionId,
        credential.user_id,
        credential.tenant_id,
        // Snapshot of the user's current version. Bumping session_version later makes
        // this session stale on its next request — see ADR 0013.
        user.session_version,
        expiresAt.toISOString(),
        mfaPending,
      ),
    );

    // A successful sign-in clears this address's bucket, so yesterday's fumbling never
    // counts against today. The IP bucket is deliberately NOT cleared: one valid
    // account behind an address must not buy an attacker unlimited attempts at every
    // other account behind it.
    await this.limiter.reset(emailKey("signin", normalised));

    return {
      ok: true,
      session: { sessionId, version: user.session_version },
      expiresAt,
      ...(mfaPending
        ? {
            secondFactor: {
              required: true as const,
              enrolmentRequired: !user.has_confirmed_factor,
            },
          }
        : {}),
    };
  }
}
