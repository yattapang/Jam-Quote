/**
 * CORE: auth — resolves a claimed session into a caller, by asking the database.
 *
 * Owns:        the only path from "something claimed to be a session" to "this is
 *              who is asking, and their role right now".
 * Trusts:      its own session store, and nothing else.
 * Never does:  believe a role, a tenant or a permission that arrived with the
 *              request; leak WHY a session was refused to the caller.
 *
 * THE ORDER OF OPERATIONS IS THE DESIGN
 *
 *   1. Read the session row with NO tenant in scope. This is the only read that
 *      happens outside row-level security, and app_session is the only table that
 *      allows it — see the migration that creates it for the full reasoning.
 *   2. Take the tenant id FROM THAT ROW. This is the single point at which a tenant
 *      id enters a request, and it comes from our own store rather than the caller.
 *   3. Re-read the user and the tenant WITH that tenant in scope, under row-level
 *      security. So even a forged session id buys nothing beyond one thin row: the
 *      moment it tries to become a user, the policies are back in force.
 *   4. Refuse if anything has changed since the session was issued — superseded
 *      version, deactivated user, suspended tenant.
 *
 * Step 3 is what makes step 1's exemption safe. Read them together or neither makes
 * sense.
 */
import type { CallerResolver, CallerResult, SessionRef } from "./caller.js";
import { type TransactionalClient, withTenant, withoutTenant } from "../tenancy/tenant-context.js";

/**
 * The narrow query surface this resolver needs.
 *
 * Declared here rather than importing a generated Prisma client, for the same reason
 * core/tenancy does it: the file that decides who you are should not depend on a
 * build artefact, and its tests should be able to drive it with a real database
 * connection.
 */
export interface Queryable extends TransactionalClient {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T[]>;
}

interface SessionRow {
  user_id: string;
  tenant_id: string;
  version: number;
  expired: boolean;
  revoked: boolean;
}

interface UserRow {
  role: string;
  session_version: number;
  deactivated: boolean;
  tenant_suspended: boolean;
}

export class DbCallerResolver implements CallerResolver {
  constructor(
    private readonly db: Queryable,
    /**
     * The time this request happens, passed INTO the query rather than left to the
     * database's own `now()`.
     *
     * This exists because of a real seam defect (F15, independent review 2026-09-24).
     * SignInService stamped `expires_at` from an injected clock while this class asked the
     * database whether the session had expired — two different notions of "now" at the two
     * ends of one seam. The tests passed on the day they were written and failed fourteen
     * hours later, when real time walked past the fixed clock's expiry. An injected clock
     * on one side of a seam is a half-truth; both sides now read the same one.
     */
    private readonly now: () => Date = () => new Date(),
  ) {}

  async resolve(sessionRef: SessionRef | null): Promise<CallerResult> {
    if (!sessionRef) return { ok: false, refusal: "no-session" };

    // Step 1: the bootstrap read, with no tenant in scope. `withoutTenant` is named
    // so this is visible in review rather than being the accidental default.
    const at = this.now().toISOString();
    const sessions = await withoutTenant(this.db, "authentication", (tx) =>
      (tx as Queryable).$queryRawUnsafe<SessionRow>(
        // Expiry is still decided in the same statement as the read, so there is one
        // comparison and no window between them — but against the caller's clock, bound as
        // a parameter, not the database's.
        `SELECT user_id,
                tenant_id,
                version,
                (expires_at <= $2::timestamptz) AS expired,
                (revoked_at IS NOT NULL) AS revoked
           FROM app_session
          WHERE id = $1`,
        sessionRef.sessionId,
        at,
      ),
    );

    const session = sessions[0];
    // An unknown session id and a revoked or expired one are answered identically.
    // Distinguishing them would let a probe tell "never existed" from "existed and
    // was revoked", which is a fact about an account.
    if (!session || session.revoked || session.expired) {
      return { ok: false, refusal: "unknown-session" };
    }

    // The version in the token must match the version the session was issued at.
    // This catches a token that was tampered with, or replayed after the session was
    // reissued at a higher version.
    if (session.version !== sessionRef.version) {
      return { ok: false, refusal: "session-superseded" };
    }

    // Steps 2 and 3: the tenant comes from the row above, and everything else is read
    // under row-level security with that tenant set.
    const users = await withTenant(this.db, session.tenant_id, (tx) =>
      (tx as Queryable).$queryRawUnsafe<UserRow>(
        `SELECT u.role,
                u.session_version,
                (u.deactivated_at IS NOT NULL) AS deactivated,
                (t.suspended_at IS NOT NULL)   AS tenant_suspended
           FROM app_user u
           JOIN tenant  t ON t.id = u.tenant_id
          WHERE u.id = $1`,
        session.user_id,
      ),
    );

    const user = users[0];
    // No row here means the user is gone, or — more interestingly — that the tenant
    // on the session does not actually own this user, in which case row-level
    // security refused the join. Either way it is not a live caller.
    if (!user) return { ok: false, refusal: "unknown-session" };

    // Step 4. Ordered so the most serious condition is reported first, which only
    // affects the audit log: the caller is told the same sentence regardless.
    if (user.tenant_suspended) return { ok: false, refusal: "tenant-suspended" };
    if (user.deactivated) return { ok: false, refusal: "user-deactivated" };
    if (user.session_version !== session.version) {
      return { ok: false, refusal: "session-superseded" };
    }

    return {
      ok: true,
      caller: {
        userId: session.user_id,
        tenantId: session.tenant_id,
        // Read from the database on THIS request. A demotion bites immediately,
        // which is the whole reason this class does a query instead of decoding a
        // claim.
        role: user.role,
      },
    };
  }
}
