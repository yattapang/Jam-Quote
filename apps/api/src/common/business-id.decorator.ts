import { BadRequestException, createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";

/**
 * Extracts the acting business id for the request.
 *
 * TODO(auth): this is a stand-in for real authentication. Once JWT auth lands,
 * derive businessId from the authenticated user/session (and verify the user
 * actually belongs to that business) instead of trusting a client-supplied
 * header. Every controller in this file's callers should swap this decorator
 * out (or have it swapped under the hood) with no route signature changes.
 */
export const BusinessId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const header = req.headers["x-business-id"];
    const businessId = Array.isArray(header) ? header[0] : header;
    if (!businessId) {
      throw new BadRequestException("Missing required x-business-id header");
    }
    return businessId;
  },
);
