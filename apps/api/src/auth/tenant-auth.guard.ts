import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthTokenPayload } from "./auth.service.js";

/**
 * Requires a valid Bearer JWT belonging to a user who currently has an
 * active business account, and attaches that business as req.businessId
 * for @BusinessId() (../common/business-id.decorator.ts) to read.
 *
 * Everything that matters is re-checked against the DB rather than trusted
 * from the token payload — same rationale as AdminGuard's docblock: tokens
 * live up to 30 days, so any of the following must take effect immediately,
 * not only once the caller's token happens to expire:
 *  - the user's account being deleted
 *  - the user being converted to/created as an admin (businessId: null —
 *    see auth.service.ts issueToken, where admins are issued no businessId)
 *  - the user's business being suspended (soft-deleted; see
 *    AdminService tenant suspension and AuthService.login, which blocks new
 *    logins the same way but can't retroactively invalidate a live token)
 *
 * In particular req.businessId is always set from the freshly-read DB user,
 * never from the token's `businessId` claim, so a stale/forged claim in an
 * old token can't grant access to a different business than the one the
 * user is presently assigned to.
 *
 * Use @UseGuards(TenantAuthGuard) at the controller class level for every
 * tenant-scoped route (anything using @BusinessId()). Admins are expected
 * to get a clear 403 here, not a confusing 401 — they authenticate fine,
 * they just aren't a tenant.
 */
@Injectable()
export class TenantAuthGuard implements CanActivate {
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

    if (payload.impersonatedBusinessId) {
      return this.allowImpersonatedRead(req, payload, payload.impersonatedBusinessId);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        businessId: true,
        business: { select: { id: true, deletedAt: true } },
      },
    });
    if (!user) {
      // Account no longer exists (deleted since the token was issued) —
      // treat identically to any other invalid credential.
      throw new UnauthorizedException("Invalid or expired token");
    }

    if (!user.businessId || !user.business) {
      // Admins are deliberately issued businessId: null (see issueToken).
      // A confusing 401 here would make it look like auth itself failed;
      // this is really "you authenticated fine, but this isn't your route."
      throw new ForbiddenException("This endpoint requires a business account");
    }

    if (user.business.deletedAt) {
      // The business was suspended after this token was issued. login()
      // blocks this at sign-in time, but a token issued before suspension
      // is valid for up to 30 days — this closes that gap.
      throw new ForbiddenException("This business account has been suspended");
    }

    req.user = payload;
    req.businessId = user.businessId;
    return true;
  }

  /**
   * The admin "view as tenant" path. This is the ONE case where req.businessId
   * comes from the token rather than from the caller's own DB row, so it earns
   * its own method and its own checks.
   *
   * That is not a hole in the rule the class docblock states, but it does
   * invert what is being proved. Normally we prove "this user belongs to this
   * business". Here we prove "this caller is, right now, an admin entitled to
   * look at any business" — re-read from the DB, never trusted from the
   * token's role claim — and only then treat the token's target as the scope.
   * An admin demoted a minute ago is refused on their next request, exactly
   * like every other authorization decision in this file.
   */
  private async allowImpersonatedRead(
    req: Request,
    payload: AuthTokenPayload,
    targetBusinessId: string,
  ): Promise<boolean> {
    // Read-only, enforced by HTTP method. A support session exists to look at
    // a contractor's books, never to act as them: an admin must not be able to
    // email a quote to that contractor's customer, record a payment against
    // their invoice, or delete their work — actions the tenant would later see
    // as their own with nothing on screen to say otherwise. Fails closed, so a
    // write route added tomorrow is refused without anyone remembering to
    // update this list.
    if (req.method !== "GET" && req.method !== "HEAD") {
      throw new ForbiddenException("View-as-tenant sessions are read-only");
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true },
    });
    if (!admin || admin.role !== UserRole.ADMIN) {
      // Either the account is gone or it is no longer an admin. Both mean the
      // authorization that justified minting this token no longer holds.
      throw new ForbiddenException("Admin access required");
    }

    const business = await this.prisma.business.findUnique({
      where: { id: targetBusinessId },
      select: { id: true, deletedAt: true },
    });
    if (!business || business.deletedAt) {
      throw new ForbiddenException("This business account is unavailable");
    }

    req.user = payload;
    req.businessId = business.id;
    return true;
  }
}
