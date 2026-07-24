import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
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
    try {
      const payload = this.jwt.verify<AuthTokenPayload>(token);
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
