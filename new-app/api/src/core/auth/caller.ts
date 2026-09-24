/**
 * CORE: auth — who is asking, resolved from the database rather than believed.
 *
 * Owns:        the Caller type every guard and handler works from, and the port
 *              that produces one.
 * Trusted by:  the default-deny guard, and through it every module.
 * Never does:  read a role, a tenant or a permission out of a token. A token proves
 *              only that a session id was issued by us; everything else is looked up.
 *
 * WHY RE-RESOLUTION, NOT CLAIMS
 *
 * The Phase 0 audit recorded three findings that all have the same root: a 30-day
 * token with no rotation, no way to invalidate a live session, and a role that could
 * be trusted from a claim. A claim is a photograph of the past. If a user is
 * demoted, deactivated, or their tenant suspended, a claim keeps saying what was
 * true when it was signed — for up to thirty days.
 *
 * So: the token carries a session id and a version. Everything else is read from the
 * database on every request. That costs one indexed query, and it buys a demotion
 * that bites immediately and a session we can actually kill.
 */

/** What a resolved caller is allowed to be. */
export interface Caller {
  readonly userId: string;
  readonly tenantId: string;
  /** Read from the database this request, never from a token. */
  readonly role: string;
}

/** Why a caller could not be resolved. Deliberately coarse — see below. */
export type CallerRefusal =
  | "no-session"
  | "unknown-session"
  | "session-superseded"
  | "user-deactivated"
  | "tenant-suspended"
  /** The password was accepted but the second factor has not been proved on this session. */
  | "mfa-pending"
  /** This person holds a platform capability and has no confirmed second factor (Rule 5.1). */
  | "mfa-required";

export type CallerResult =
  | { readonly ok: true; readonly caller: Caller }
  | {
      readonly ok: false;
      readonly refusal: CallerRefusal;
      /**
       * Who this is, when the password was accepted but a factor was not.
       *
       * Present ONLY for `mfa-pending` and `mfa-required`, and it is not a caller: it does not
       * authorise anything. It exists because the two routes that finish a sign-in — verifying a
       * factor, and enrolling when none exists — need to know whose factor to check, and refusing
       * them outright would lock a staff member out of the very page that unlocks their account.
       *
       * Everything else must branch on `ok` alone. The default-deny guard does, which is why this
       * field cannot widen access by being added: a route has to reach for it deliberately, and
       * only the two named routes may (their test asserts the set).
       */
      readonly partial?: Caller;
    };

/**
 * The port the guard depends on.
 *
 * A port rather than a concrete class so the guard's own tests do not need a
 * database, and so the transport (cookie, bearer token) can change without touching
 * anything that decides access.
 *
 * `sessionRef` is opaque here on purpose: this layer does not care whether it came
 * from a cookie or a header, only that something claimed to be a session.
 */
export interface CallerResolver {
  resolve(sessionRef: SessionRef | null): Promise<CallerResult>;
}

/**
 * A claimed session: its id, and the version it was issued at.
 *
 * The version is what makes invalidation possible. Bumping the stored version on a
 * user — on password change, on sign-out-everywhere, on a suspected compromise —
 * makes every token already in the wild stale on its next request, with no token
 * blacklist to maintain and nothing to expire.
 */
export interface SessionRef {
  readonly sessionId: string;
  readonly version: number;
}

/**
 * The single sentence a refused caller is told.
 *
 * Every refusal reads the same to the caller. A message that distinguished
 * "unknown session" from "your tenant is suspended" would let anyone with a
 * discarded token learn facts about accounts, and an attacker enumerate valid
 * session ids. The specific reason goes to the audit log, where it belongs, and
 * never into the response.
 */
export const REFUSAL_MESSAGE = "Please sign in again.";

/**
 * The refusals that mean "you are who you say, but you have not finished".
 *
 * Named as a set rather than checked inline in three places, because the transport will want to
 * send these two somewhere different from the rest — the factor prompt, or enrolment — and a
 * fourth refusal quietly joining that redirect is how a half-authenticated session becomes a
 * whole one.
 */
export const HALF_AUTHENTICATED_REFUSALS: readonly CallerRefusal[] = ["mfa-pending", "mfa-required"];
