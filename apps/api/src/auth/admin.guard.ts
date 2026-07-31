import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import type { AdminCapability } from "@jamquote/core";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service.js";
import { ADMIN_CAPABILITY_KEY } from "./require-capability.decorator.js";
import type { AuthTokenPayload } from "./auth.service.js";

/**
 * Requires a valid Bearer JWT belonging to a user whose CURRENT role (looked
 * up fresh from the DB, not trusted from the token payload) is ADMIN. A
 * DB check — not the JWT claim — is deliberate: tokens live up to 30 days, so
 * revoking someone's admin access must take effect immediately rather than
 * waiting for their token to expire.
 *
 * On top of the role check, a route may declare a required admin capability
 * with @RequireCapability(...). A super-admin implicitly holds every
 * capability; a regular admin must have it in User.adminCapabilities or the
 * request is Forbidden. The resolved authorization is attached to
 * req.adminContext for controllers/services that need to know who is acting
 * (e.g. admin-management self-lockout guards).
 *
 * Use on any platform-level route that reads across tenants (see
 * AdminController) — never rely on "not linked in the UI" as access control.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
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

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isSuperAdmin: true, adminCapabilities: true },
    });
    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Admin access required");
    }

    // Route-level capability gate. Absent → any admin may proceed (basic reads).
    const required = this.reflector.getAllAndOverride<AdminCapability | undefined>(ADMIN_CAPABILITY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && !user.isSuperAdmin && !user.adminCapabilities.includes(required)) {
      throw new ForbiddenException(`Missing required admin capability: ${required}`);
    }

    req.user = payload;
    req.adminContext = {
      userId: user.id,
      isSuperAdmin: user.isSuperAdmin,
      capabilities: user.adminCapabilities,
    };
    return true;
  }
}
