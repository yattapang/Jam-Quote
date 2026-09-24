/**
 * CORE: auth — the guard that makes "no declaration" mean "no access".
 *
 * Owns:        the single decision point for every request into the API.
 * Trusted by:  every module. It is registered GLOBALLY; a module cannot opt out.
 * Never does:  trust anything in the request about who the caller is. It asks the
 *              CallerResolver, which asks the database.
 *
 * WHY A GLOBAL GUARD RATHER THAN ONE PER CONTROLLER
 *
 * Because per-controller guards are what the Phase 0 audit found, and the failure
 * mode is silent: a new controller written without one is unguarded, looks normal,
 * and nothing fails. Registered globally, the default is refusal, and a developer's
 * mistake is a route that stops working rather than a route that stops protecting.
 *
 * WHAT IT DOES AND DOES NOT DECIDE
 *
 * It decides: is this route declared, and for an authenticated route, is there a
 * live caller? It attaches the resolved caller to the request.
 *
 * It does NOT decide whether that caller may perform this particular action. Roles,
 * capabilities and entitlements are separate questions, answered by core/entitlements
 * and by each module, because a guard that also knew every business rule would be the
 * place every rule ended up.
 */
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";

import { type CallerResolver, REFUSAL_MESSAGE, type SessionRef } from "./caller.js";
import { type RouteProtection, routeProtectionOf } from "./route-protection.js";

/** The minimum of Nest's Reflector this guard needs, so tests need no Nest container. */
export interface ProtectionReader {
  getAllAndOverride<T>(key: unknown, targets: unknown[]): T | undefined;
}

/** Reads a claimed session off the request. Transport lives behind this, not in the guard. */
export interface SessionReader {
  read(request: unknown): SessionRef | null;
}

/**
 * Injection tokens for the two ports.
 *
 * An interface does not exist at runtime, so Nest cannot inject one by type. These are the tokens
 * `app.module.ts` binds, and they live here — beside the interfaces they name — so that the port
 * and the way it is injected cannot drift apart.
 */
export const SESSION_READER = Symbol("pryvis:session-reader");
export const CALLER_RESOLVER = Symbol("pryvis:caller-resolver");

@Injectable()
export class DefaultDenyGuard implements CanActivate {
  private readonly log = new Logger(DefaultDenyGuard.name);

  constructor(
    private readonly reflector: ProtectionReader,
    private readonly sessions: SessionReader,
    private readonly callers: CallerResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const protection: RouteProtection | undefined = routeProtectionOf(
      this.reflector,
      context.getHandler(),
      context.getClass(),
    );

    if (!protection) {
      // A programming error, not a caller error. It is refused rather than allowed,
      // and it is logged loudly with the route named, because the developer who
      // forgot is the only person who can fix it. route-protection-coverage.test.ts
      // is meant to catch this before it ever runs; this is the second line.
      const where = `${context.getClass()?.name}.${(context.getHandler() as { name?: string })?.name}`;
      this.log.error(
        `${where} declares no route protection, so it is refused. Add @Authenticated(), ` +
          `@ShareTokenRoute() or @PublicRoute("why") — see core/auth/route-protection.ts.`,
      );
      throw new ForbiddenException("This endpoint is not available.");
    }

    // A public route is open, and the reason is already recorded in the code. Note
    // what does NOT happen here: no caller is resolved, so a handler on a public
    // route cannot accidentally receive a half-trusted identity.
    if (protection.kind === "public") return true;

    // A share token is a different credential, not a weaker session. The guard does
    // not validate it, because only the module that owns the document can say which
    // token addresses which row — and it must answer an unknown token exactly as it
    // answers a malformed one. Letting the guard "partly" check it would create two
    // places that decide, which is how the old application's public surfaces drifted.
    if (protection.kind === "share-token") return true;

    const result = await this.callers.resolve(this.sessions.read(context.switchToHttp().getRequest()));

    if (!result.ok) {
      // The reason is logged, never returned: distinguishing "unknown session" from
      // "tenant suspended" in a response tells anyone holding a stale token facts
      // about an account they no longer have access to.
      this.log.warn(`Caller refused: ${result.refusal}`);
      throw new UnauthorizedException(REFUSAL_MESSAGE);
    }

    // Handlers and core/tenancy read the caller from here. Nothing downstream may
    // take a tenant id from the request body, the query string or a header — that is
    // the rule core/tenancy's header states, and this is the only place a tenant id
    // legitimately enters a request.
    const request = context.switchToHttp().getRequest() as { caller?: unknown };
    request.caller = result.caller;
    return true;
  }
}
