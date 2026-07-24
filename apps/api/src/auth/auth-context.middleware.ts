import { Injectable, NestMiddleware } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { NextFunction, Request, Response } from "express";
import type { AuthTokenPayload } from "./auth.service.js";

/**
 * Non-breaking auth bridge, applied to every route in AppModule.
 *
 * If a valid `Authorization: Bearer <token>` is present, it sets
 * `req.user`/`req.businessId` from the JWT payload. It NEVER rejects the
 * request when the token is absent or invalid — it just calls next() and
 * leaves req.user/req.businessId unset, so plain x-business-id header
 * requests (the current auth stand-in) keep working exactly as before.
 * See @BusinessId() in ../common/business-id.decorator.ts, which prefers
 * req.businessId (set here) and falls back to the header.
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
        if (payload.businessId) {
          req.businessId = payload.businessId;
        }
      } catch {
        // Invalid/expired token: fall through silently, header-based auth still works.
      }
    }
    next();
  }
}
