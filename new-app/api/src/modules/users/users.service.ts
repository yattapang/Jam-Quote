/**
 * MODULE: users
 *
 * Owns:        the people who sign in, their role within one tenant, and their
 *              credentials.
 * Trusts:      core/auth for hashing and session rules; core/tenancy for the
 *              tenant in scope; the tenants module's public surface for anything
 *              it needs to know about the business itself.
 * Never does:  read the tenant table directly, or trust a role claim from a token
 *              — a role is re-resolved from this module's own row on every
 *              request, so a demotion bites immediately.
 */
import type { TenantSummary } from "../tenants/index.js";

/**
 * A signed-in person, as the client sees them.
 *
 * @wire — part of the client contract. Note what is absent and must stay absent:
 * the password hash, and anything about another tenant.
 */
export interface UserSummary {
  readonly id: string;
  readonly email: string;
  /** "owner" | "staff". Text, not an enum: roles grow (ADR 0002). */
  readonly role: string;
}

/**
 * Placeholder, as in the tenants module. The import above is deliberate: it shows
 * the legal way for one module to depend on another — through its index.ts.
 */
export class UsersService {
  greeting(user: UserSummary, tenant: TenantSummary): string {
    return `${user.email} at ${tenant.name}`;
  }
}
