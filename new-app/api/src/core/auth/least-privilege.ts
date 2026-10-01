/**
 * CORE: auth — the start-up check that the database role the API runs as is least-privileged.
 *
 * Owns:        refusing to start on an over-privileged database role (`docs/design/privilege-model.md`
 *              D4; `docs/THREAT-MODEL.md` §4g).
 * Trusts:      `least_privilege_violations()`, built by migration `20260927220000_privilege_model`, which
 *              describes the CALLING role from PostgreSQL's catalogue.
 * Never does:  start anyway. An over-privileged deployment that never serves a request is an outage until
 *              fixed — which is the intent — while one that serves requests has quietly switched off row
 *              security, the credential doors or the balance lock.
 *
 * WHY IT EXISTS
 *
 * The deployment's LOGIN role is created outside the migrations, so no migration can bind it. Three things
 * can go wrong silently: the migrating role is not the database owner and the TEMPORARY revoke only warned
 * (finding Z4); someone grants a privilege by hand; or the API connects as the owner or a superuser, which
 * bypasses every policy. Each is caught here, on the connection that will serve requests.
 *
 * WHAT IT DOES NOT DO (Rule 21.4)
 *
 * - It is not called by anything yet: there is no application module to bootstrap (`new-app/CLAUDE.md`,
 *   "Not built yet"). Wiring it into start-up is owed with that module; until then its tests prove the
 *   logic, not the wiring.
 * - It checks the role at start-up, not on every connection: a privilege granted while the API runs is
 *   seen at the next start.
 * - It cannot see what the database owner or a superuser may do with their own sessions.
 */

/** The one query this check needs. */
export interface LeastPrivilegeQueryable {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T[]>;
}

/** Thrown when the API's database role holds more than it must. */
export class OverPrivilegedRoleError extends Error {
  constructor(readonly violations: readonly string[]) {
    // Safe to print: these are fixed phrases about the role, never data.
    super(
      `Refusing to start: the database role is over-privileged — ${violations.join("; ")}. ` +
        "See docs/design/privilege-model.md, the deployment section.",
    );
    this.name = "OverPrivilegedRoleError";
  }
}

/** Resolves when the connected role is least-privileged; throws {@link OverPrivilegedRoleError} otherwise. */
export async function assertLeastPrivilege(db: LeastPrivilegeQueryable): Promise<void> {
  const rows = await db.$queryRawUnsafe<{ violations: string[] | null }>(
    "SELECT least_privilege_violations() AS violations",
  );
  // A missing row or a NULL is not "no violations": it means the check did not run, and a check that did
  // not run must not let the API start.
  const violations = rows.length === 1 ? rows[0]?.violations : undefined;
  if (!Array.isArray(violations)) {
    throw new OverPrivilegedRoleError(["the least-privilege check returned no answer"]);
  }
  if (violations.length > 0) throw new OverPrivilegedRoleError(violations);
}
