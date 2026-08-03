import { describe, expect, it } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { extractBusinessId } from "./business-id.decorator.js";

describe("extractBusinessId", () => {
  it("returns req.businessId when TenantAuthGuard has set it", () => {
    const req = { businessId: "biz-1", headers: {} } as unknown as Request;
    expect(extractBusinessId(req)).toBe("biz-1");
  });

  it("throws Unauthorized when req.businessId is unset — even with a raw x-business-id header present", () => {
    // This is the regression test for the vulnerability itself: the old
    // decorator fell back to req.headers["x-business-id"] and trusted it
    // verbatim with no authentication. That fallback is gone; the header
    // must now be completely inert.
    const req = {
      headers: { "x-business-id": "any-uuid-an-attacker-knows" },
    } as unknown as Request;

    expect(() => extractBusinessId(req)).toThrow(UnauthorizedException);
  });

  it("throws Unauthorized when neither req.businessId nor any header is present", () => {
    const req = { headers: {} } as unknown as Request;
    expect(() => extractBusinessId(req)).toThrow(UnauthorizedException);
  });
});
