/**
 * MODULE: tenants
 *
 * Owns:        the tenant record — the contracting business itself, its country,
 *              its currency, and the lifecycle of that row.
 * Trusts:      core/tenancy for who is asking, and the database's row-level
 *              security to make a mistake here a no-op rather than a breach.
 * Never does:  read or write another module's tables; accept a tenant id from a
 *              caller as proof of anything. The tenant in scope comes from the
 *              authenticated request context, never from a parameter.
 */

/**
 * A tenant as this module hands it to callers.
 *
 * @wire — part of the client contract. Changing a field here changes what web and
 * mobile compile against, so the change is only complete once
 * `npm run contract:generate` has been re-run and the regenerated file committed.
 */
export interface TenantSummary {
  readonly id: string;
  readonly name: string;
  /** ISO 3166-1 alpha-2 — a key into the jurisdiction rule pack, never branched on. */
  readonly countryCode: string;
  /** ISO 4217 — what this tenant quotes in, not what Pryvis bills them in. */
  readonly currency: string;
}

/**
 * Placeholder while the skeleton is built. It exists so the boundary guard and the
 * contract check have a real subject: a module with a public surface and an
 * internal file that other modules must not reach into.
 */
export class TenantsService {
  describe(tenant: TenantSummary): string {
    return `${tenant.name} (${tenant.countryCode}, ${tenant.currency})`;
  }
}
