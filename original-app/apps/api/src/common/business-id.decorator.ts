import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";

/**
 * Extracts the acting business id for the request.
 *
 * Reads req.businessId ONLY. That field is set exclusively by
 * TenantAuthGuard (../auth/tenant-auth.guard.ts) after it has verified a
 * Bearer JWT, re-read the user from the DB, and confirmed their business is
 * still active — never trusted from a client-supplied header.
 *
 * There used to be a fallback to a raw `x-business-id` header for callers
 * without a token. That was a full tenant-isolation bypass: anyone who knew
 * (or guessed) a businessId got complete read/write access to that tenant's
 * data with no authentication at all. It has been removed. Every controller
 * using @BusinessId() MUST be behind @UseGuards(TenantAuthGuard) (class-level
 * on the controller, or method-level where only some routes are tenant-
 * scoped) or this decorator will always throw.
 */
/**
 * Pulled out of the createParamDecorator callback so it can be unit-tested
 * directly (Nest's param-decorator factories aren't independently callable
 * once wrapped) — see business-id.decorator.test.ts, notably the case
 * proving a raw x-business-id header with no req.businessId set grants
 * nothing, which is the exact shape of the fixed vulnerability.
 */
export function extractBusinessId(req: Request): string {
  if (!req.businessId) {
    throw new UnauthorizedException("Authentication is required for this endpoint");
  }
  return req.businessId;
}

export const BusinessId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => extractBusinessId(ctx.switchToHttp().getRequest<Request>()),
);
