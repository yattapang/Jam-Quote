import { BadRequestException, createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * Extracts the acting business id for the request.
 *
 * Prefers req.businessId, set by AuthContextMiddleware (../auth/auth-context.middleware.ts)
 * when the request carries a valid JWT. Falls back to the legacy
 * x-business-id header when there's no token — this is what keeps every
 * existing controller working unchanged for callers that haven't adopted
 * auth yet. Only once JWT auth is mandatory everywhere should the header
 * fallback be removed.
 */
export const BusinessId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (req.businessId) {
      return req.businessId;
    }
    const header = req.headers["x-business-id"];
    const businessId = Array.isArray(header) ? header[0] : header;
    if (!businessId) {
      throw new BadRequestException("Missing required x-business-id header");
    }
    return businessId;
  },
);
