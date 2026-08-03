import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { TenantAuthGuard } from "./tenant-auth.guard.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeContext(req: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as unknown as ExecutionContext;
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return { headers: {}, ...overrides };
}

describe("TenantAuthGuard", () => {
  it("throws Unauthorized when there is no bearer token", async () => {
    const jwt = { verify: vi.fn() };
    const prisma = { user: { findUnique: vi.fn() } };
    const guard = new TenantAuthGuard(jwt as any, prisma as any);

    await expect(guard.canActivate(makeContext(makeReq()))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  // The actual vulnerability: a raw x-business-id header, with no bearer
  // token at all, must not authenticate anything. Confirms the guard (and
  // therefore @BusinessId(), which only ever reads req.businessId set here)
  // grants nothing from the header alone.
  it("grants nothing from a raw x-business-id header with no token", async () => {
    const jwt = { verify: vi.fn() };
    const prisma = { user: { findUnique: vi.fn() } };
    const guard = new TenantAuthGuard(jwt as any, prisma as any);
    const req = makeReq({ headers: { "x-business-id": "some-other-tenants-business-id" } });

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(req).not.toHaveProperty("businessId");
    expect(jwt.verify).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when the token fails verification", async () => {
    const jwt = { verify: vi.fn(() => { throw new Error("bad signature"); }) };
    const prisma = { user: { findUnique: vi.fn() } };
    const guard = new TenantAuthGuard(jwt as any, prisma as any);
    const req = makeReq({ headers: { authorization: "Bearer garbage" } });

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("throws Unauthorized when the token is valid but the user no longer exists in the DB", async () => {
    const jwt = { verify: vi.fn().mockReturnValue({ sub: "u-deleted", businessId: "biz-1", role: "OWNER" }) };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(null) } };
    const guard = new TenantAuthGuard(jwt as any, prisma as any);
    const req = makeReq({ headers: { authorization: "Bearer valid.token" } });

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("throws Forbidden when the user has no businessId (admin case)", async () => {
    const jwt = { verify: vi.fn().mockReturnValue({ sub: "admin-1", businessId: null, role: "ADMIN" }) };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "admin-1", businessId: null, business: null }),
      },
    };
    const guard = new TenantAuthGuard(jwt as any, prisma as any);
    const req = makeReq({ headers: { authorization: "Bearer admin.token" } });

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("throws Forbidden when the user's business has been soft-deleted (suspended)", async () => {
    const jwt = { verify: vi.fn().mockReturnValue({ sub: "u1", businessId: "biz-1", role: "OWNER" }) };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "u1",
          businessId: "biz-1",
          business: { id: "biz-1", deletedAt: new Date() },
        }),
      },
    };
    const guard = new TenantAuthGuard(jwt as any, prisma as any);
    const req = makeReq({ headers: { authorization: "Bearer valid.token" } });

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("on success sets req.businessId from the freshly-read DB user, NOT the token's claim", async () => {
    // The token claims business A; the DB says the user is now on business B
    // (e.g. moved, or the claim is stale/forged). The guard must use the DB
    // value, never the token payload's businessId.
    const jwt = {
      verify: vi.fn().mockReturnValue({ sub: "u1", businessId: "biz-A-stale-claim", role: "OWNER" }),
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "u1",
          businessId: "biz-B-actual",
          business: { id: "biz-B-actual", deletedAt: null },
        }),
      },
    };
    const guard = new TenantAuthGuard(jwt as any, prisma as any);
    const req = makeReq({ headers: { authorization: "Bearer valid.token" } });

    const result = await guard.canActivate(makeContext(req));

    expect(result).toBe(true);
    expect((req as any).businessId).toBe("biz-B-actual");
    expect((req as any).businessId).not.toBe("biz-A-stale-claim");
    expect((req as any).user).toEqual({ sub: "u1", businessId: "biz-A-stale-claim", role: "OWNER" });
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } }),
    );
  });
});
