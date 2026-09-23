import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import type { AuthTokenPayload } from "./auth.service.js";

/**
 * Requires a valid `Authorization: Bearer <token>`. Unlike
 * auth-context.middleware (which is best-effort and never rejects), this
 * guard throws when the token is missing/invalid — use it on routes that
 * must be authenticated (e.g. GET /auth/me).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new UnauthorizedException("Missing bearer token");
    }
    let payload: AuthTokenPayload;
    try {
      payload = this.jwt.verify<AuthTokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    if (payload.impersonatedBusinessId) {
      // Routes behind this guard act on the CALLER'S OWN account — /auth/me,
      // changing a password. A view-as-tenant token carries the admin's `sub`,
      // so it would operate on the admin's own account while they believe
      // themselves to be looking at a tenant. Nothing good is on the other
      // side of that confusion; these tokens belong only on read-only,
      // tenant-scoped routes.
      throw new ForbiddenException("View-as-tenant sessions cannot be used here");
    }
    req.user = payload;
    return true;
  }
}
