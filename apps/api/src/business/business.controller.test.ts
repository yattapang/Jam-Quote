import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { BusinessController } from "./business.controller.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const business = { id: "biz-1", name: "Blackwood Construction" };

describe("BusinessController.findOne", () => {
  it("returns the business when :id matches the caller's own businessId", async () => {
    const businessService = { findById: vi.fn().mockResolvedValue(business) };
    const controller = new BusinessController(businessService as any);

    const result = await controller.findOne("biz-1", "biz-1");

    expect(result).toBe(business);
    expect(businessService.findById).toHaveBeenCalledWith("biz-1");
  });

  it("throws Forbidden for a cross-tenant :id, without ever calling the service (IDOR fix)", () => {
    const businessService = { findById: vi.fn() };
    const controller = new BusinessController(businessService as any);

    // findOne throws synchronously (the ownership check runs before the
    // service call), so assert with toThrow rather than a rejected promise.
    expect(() => controller.findOne("biz-victim", "biz-attacker")).toThrow(ForbiddenException);
    expect(businessService.findById).not.toHaveBeenCalled();
  });
});

describe("BusinessController.update", () => {
  it("updates when :id matches the caller's own businessId", async () => {
    const businessService = { update: vi.fn().mockResolvedValue(business) };
    const controller = new BusinessController(businessService as any);

    const result = await controller.update("biz-1", "biz-1", { name: "New Name" } as any);

    expect(result).toBe(business);
    expect(businessService.update).toHaveBeenCalledWith("biz-1", { name: "New Name" });
  });

  it("throws Forbidden for a cross-tenant :id, without ever calling the service (was an unauthenticated cross-tenant write)", () => {
    const businessService = { update: vi.fn() };
    const controller = new BusinessController(businessService as any);

    expect(() => controller.update("biz-victim", "biz-attacker", { name: "Pwned" } as any)).toThrow(
      ForbiddenException,
    );
    expect(businessService.update).not.toHaveBeenCalled();
  });
});
