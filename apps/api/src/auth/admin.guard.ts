import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthTokenPayload } from "./auth.service.js";

/**
 * Requires a valid Bearer JWT belonging to a user whose CURRENT role (looked
 * up fresh from the DB, not trusted from the token payload) is ADMIN. A
 * DB check — not the JWT claim — is deliberate: tokens live up to 30 days, so
 * revoking someone's admin access must take effect immediately rather than
 * waiting for their token to expire.
 *
 * Use on any platform-level route that reads across tenants (see
 * AdminController) — never rely on "not linked in the UI" as access control.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Admin access required");
    }

    req.user = payload;
    return true;
  }
}
