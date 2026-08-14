import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { AdminGuard } from "./admin.guard.js";
import { JwtAuthGuard } from "./jwt-auth.guard.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A view-as-tenant token is deliberately narrow: one tenant, read-only, half
 * an hour, audited. What makes it dangerous is that it is signed for a REAL,
 * currently-serving admin — so any guard that only asks "is the bearer an
 * admin?" will wave it through and hand back exactly the broad authority the
 * narrow token was carved out of.
 *
 * These two guards therefore have to refuse it explicitly. Nothing else in
 * their logic would, which is why this is pinned in its own file rather than
 * left to be noticed in review.
 */
const IMPERSONATION_PAYLOAD = {
  sub: "admin-1",
  businessId: null,
  role: "ADMIN",
  impersonatedBusinessId: "biz-target",
};

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    // AdminGuard reaches for these when resolving @RequireCapability.
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

const req = () => ({ headers: { authorization: "Bearer t" } });

describe("AdminGuard", () => {
  it("refuses a view-as-tenant token, so it can never reach the admin API", async () => {
    const jwt = { verify: vi.fn().mockReturnValue(IMPERSONATION_PAYLOAD) };
    // The admin is genuinely a serving super-admin: without the explicit
    // check, every remaining condition in the guard would pass.
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "admin-1", role: "ADMIN", isSuperAdmin: true, adminCapabilities: [] }),
      },
    };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new AdminGuard(jwt as any, prisma as any, reflector as any);

    await expect(guard.canActivate(makeContext(req()))).rejects.toBeInstanceOf(ForbiddenException);
    // Rejected on the claim alone, before the role lookup could vouch for it.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("still admits an ordinary admin token", async () => {
    const jwt = { verify: vi.fn().mockReturnValue({ sub: "admin-1", businessId: null, role: "ADMIN" }) };
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "admin-1", role: "ADMIN", isSuperAdmin: true, adminCapabilities: [] }),
      },
    };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new AdminGuard(jwt as any, prisma as any, reflector as any);

    await expect(guard.canActivate(makeContext(req()))).resolves.toBe(true);
  });
});

describe("JwtAuthGuard", () => {
  // Routes behind this guard act on the caller's OWN account. A view-as token
  // carries the admin's sub, so it would operate on the admin's account while
  // they believe they are looking at a tenant.
  it("refuses a view-as-tenant token", () => {
    const jwt = { verify: vi.fn().mockReturnValue(IMPERSONATION_PAYLOAD) };
    const guard = new JwtAuthGuard(jwt as any);
    const r = req();

    expect(() => guard.canActivate(makeContext(r))).toThrow(ForbiddenException);
    expect(r).not.toHaveProperty("user");
  });

  it("still admits an ordinary token", () => {
    const payload = { sub: "u1", businessId: "biz-1", role: "OWNER" };
    const jwt = { verify: vi.fn().mockReturnValue(payload) };
    const guard = new JwtAuthGuard(jwt as any);
    const r: Record<string, unknown> = req();

    expect(guard.canActivate(makeContext(r))).toBe(true);
    expect(r.user).toEqual(payload);
  });
});
