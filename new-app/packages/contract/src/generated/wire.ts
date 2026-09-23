// GENERATED FILE — DO NOT EDIT.
//
// Produced by packages/contract/generate.ts from the @wire types in the API's
// module public surfaces. Edit the type on the server and re-run
// `npm run contract:generate`; editing this file is undone by the next run, and
// `contract-drift.test.ts` fails the build if this copy is stale.

// from module: tenants
export interface TenantSummary {
  readonly id: string;
  readonly name: string;
  /** ISO 3166-1 alpha-2 — a key into the jurisdiction rule pack, never branched on. */
  readonly countryCode: string;
  /** ISO 4217 — what this tenant quotes in, not what Pryvis bills them in. */
  readonly currency: string;
}

// from module: users
export interface UserSummary {
  readonly id: string;
  readonly email: string;
  /** "owner" | "staff". Text, not an enum: roles grow (ADR 0002). */
  readonly role: string;
}
