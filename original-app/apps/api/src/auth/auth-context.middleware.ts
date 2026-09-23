import { Injectable, NestMiddleware } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { NextFunction, Request, Response } from "express";
import type { AuthTokenPayload } from "./auth.service.js";

/**
 * Best-effort auth bridge, applied to every route in AppModule.
 *
 * If a valid `Authorization: Bearer <token>` is present, it sets req.user
 * from the JWT payload — nothing more. It NEVER rejects the request when
 * the token is absent or invalid; it just calls next() and leaves req.user
 * unset. This makes it suitable ONLY for genuinely optional-auth routes
 * (e.g. a public route that behaves slightly differently when it can see
 * who's asking) — never for anything that needs to trust the caller.
 *
 * Deliberately does NOT set req.businessId. That field is the sole input to
 * @BusinessId() (../common/business-id.decorator.ts) and is now set
 * exclusively by TenantAuthGuard (./tenant-auth.guard.ts), which — unlike
 * this middleware — re-reads the user from the DB and checks for
 * revocation, admin status, and business suspension before trusting the
 * token's claims. If this middleware also set req.businessId from the raw
 * token payload, any tenant controller that forgot @UseGuards(TenantAuthGuard)
 * would silently keep working off an unverified claim instead of failing
 * closed — exactly the kind of gap that let the old x-business-id header
 * bypass every tenant boundary. So: req.user here is fine to read for
 * optional personalization; req.businessId must only ever come from the guard.
 */
@Injectable()
export class AuthContextMiddleware implements NestMiddleware {
  constructor(private readonly jwt: JwtService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (token) {
      try {
        const payload = this.jwt.verify<AuthTokenPayload>(token);
        req.user = payload;
      } catch {
        // Invalid/expired token: fall through silently. Routes that require
        // auth use JwtAuthGuard/TenantAuthGuard/AdminGuard, which reject
        // outright; this middleware never authenticates on its own.
      }
    }
    next();
  }
}
