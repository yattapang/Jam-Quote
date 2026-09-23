/**
 * CORE: auth — how a route declares what protects it.
 *
 * Owns:        the vocabulary of route protection, and the metadata the guard reads.
 * Trusted by:  every module's controllers.
 * Never does:  decide whether a particular caller passes. That is the guard's job,
 *              and the guard asks the database, not a token.
 *
 * WHY DECLARATION IS MANDATORY
 *
 * The Phase 0 audit found authorisation was opt-in per controller: a route written
 * without a guard was simply unguarded, and nothing in the gate failed for it. So
 * the question "is this endpoint protected?" could only be answered by reading every
 * controller and noticing an absence — and absences are exactly what review misses.
 *
 * Here, protection is DECLARED, and a route that declares nothing is refused at
 * runtime by DefaultDenyGuard and refused at build time by
 * route-protection-coverage.test.ts. Forgetting is not a way to get a public
 * endpoint; it is a way to get a broken one, immediately, in development.
 *
 * THE THREE KINDS OF ROUTE, AND WHY EXACTLY THREE
 *
 * The previous application had all three in practice and named none of them, so the
 * third kept being confused with the second. Naming them is most of the control.
 */
import { SetMetadata } from "@nestjs/common";

/** The metadata key the guard reads. Not exported for general use — read via `routeProtectionOf`. */
const PROTECTION = Symbol("pryvis:route-protection");

/** What a route says about itself. */
export type RouteProtection =
  | { readonly kind: "authenticated" }
  | { readonly kind: "share-token" }
  | { readonly kind: "public"; readonly reason: string };

/**
 * A signed-in caller, resolved from the session and re-checked against the
 * database on every request.
 *
 * The default for anything a contractor uses. There is no "authenticated, and also
 * trust this tenant id from the query string" variant, deliberately.
 */
export const Authenticated = () => SetMetadata(PROTECTION, { kind: "authenticated" } as const);

/**
 * The URL itself is the authorisation: an unguessable share token addressing
 * exactly one document.
 *
 * Distinct from `public` because it is NOT open — it is a different credential, and
 * it comes with obligations the guard and the handler must honour: the token scopes
 * the response to one document, it is revocable, it never mints a session, and an
 * unknown, withdrawn or draft token must be answered identically to a malformed one
 * (so a probe cannot learn which documents exist).
 */
export const ShareTokenRoute = () => SetMetadata(PROTECTION, { kind: "share-token" } as const);

/**
 * Genuinely open, with the reason recorded in the code.
 *
 * The reason is required, and it is not decoration: it is what makes a review of
 * every public surface a five-second grep instead of an audit. A health check and a
 * payment-gateway callback are both public and are public for very different
 * reasons — one is safe to expose, the other is only safe because it verifies a
 * signature, which the handler must then actually do.
 */
export const PublicRoute = (reason: string) => {
  if (!reason || reason.trim().length < 10) {
    // Thrown at class-definition time, so it fails on import rather than on the
    // first request. "temp" or "" would make this decorator a rubber stamp.
    throw new Error(
      "PublicRoute needs a real reason (at least 10 characters) explaining why this endpoint is open to anyone.",
    );
  }
  return SetMetadata(PROTECTION, { kind: "public", reason } as const);
};

/**
 * Reads the declaration for a handler, falling back to its controller.
 *
 * Handler wins over controller, so a controller may declare the common case and one
 * route may deviate — which is the shape that stops a developer from removing the
 * controller-level declaration in order to make one route public.
 */
export function routeProtectionOf(
  reflector: { getAllAndOverride<T>(key: unknown, targets: unknown[]): T | undefined },
  handler: unknown,
  controller: unknown,
): RouteProtection | undefined {
  return reflector.getAllAndOverride<RouteProtection>(PROTECTION, [handler, controller]);
}

/** Exposed for the coverage guard, which needs to name these in its failures. */
export const PROTECTION_DECORATORS = ["Authenticated", "ShareTokenRoute", "PublicRoute"] as const;
