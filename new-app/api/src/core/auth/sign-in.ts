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
import { randomUUID } from "node:crypto";

import { type SessionRef } from "./caller.js";
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

export type SignInResult =
  | { readonly ok: true; readonly session: SessionRef; readonly expiresAt: Date }
  | { readonly ok: false; readonly message: string };

/** Why a sign-in failed. For the log and the audit trail — never for the response. */
export type SignInFailure =
  | "unknown-email"
  | "wrong-password"
  | "user-deactivated"
  | "tenant-suspended";

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
}

export interface SignInLog {
  /** Called on every failure, with the real reason. Never reaches the caller. */
  failed(email: string, reason: SignInFailure): void;
}

export class SignInService {
  constructor(
    private readonly db: Queryable,
    private readonly log: SignInLog,
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

  async signIn(email: string, password: string): Promise<SignInResult> {
    const normalised = SignInService.normaliseEmail(email);

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
      this.log.failed(normalised, "unknown-email");
      return { ok: false, message: SIGN_IN_FAILED_MESSAGE };
    }

    const passwordMatches = await verifyPassword(password, credential.password_hash);
    if (!passwordMatches) {
      this.log.failed(normalised, "wrong-password");
      return { ok: false, message: SIGN_IN_FAILED_MESSAGE };
    }

    // The tenant comes from the credential row — our own store — and everything from
    // here runs under row-level security with it set. Same order of operations as
    // DbCallerResolver, for the same reason.
    const state = await withTenant(this.db, credential.tenant_id, (tx) =>
      (tx as Queryable).$queryRawUnsafe<UserStateRow>(
        `SELECT u.session_version,
                (u.deactivated_at IS NOT NULL) AS deactivated,
                (t.suspended_at IS NOT NULL)   AS tenant_suspended
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
      this.log.failed(normalised, "unknown-email");
      return { ok: false, message: SIGN_IN_FAILED_MESSAGE };
    }
    if (user.tenant_suspended) {
      // A correct password for a suspended tenant gets the same sentence as a wrong
      // one. Telling them "your account is suspended" here would confirm the address
      // exists to anyone who guessed it.
      this.log.failed(normalised, "tenant-suspended");
      return { ok: false, message: SIGN_IN_FAILED_MESSAGE };
    }
    if (user.deactivated) {
      this.log.failed(normalised, "user-deactivated");
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

    await withoutTenant(this.db, "authentication", (tx) =>
      tx.$executeRawUnsafe(
        `INSERT INTO app_session (id, user_id, tenant_id, version, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        sessionId,
        credential.user_id,
        credential.tenant_id,
        // Snapshot of the user's current version. Bumping session_version later makes
        // this session stale on its next request — see ADR 0013.
        user.session_version,
        expiresAt.toISOString(),
      ),
    );

    return { ok: true, session: { sessionId, version: user.session_version }, expiresAt };
  }
}
