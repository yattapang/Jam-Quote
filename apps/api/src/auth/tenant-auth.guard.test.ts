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

/**
 * The admin "view as tenant" path. This is the only route by which
 * req.businessId is set from a token claim rather than the caller's own DB
 * row, so each guarantee that makes that acceptable is pinned here.
 */
describe("TenantAuthGuard — view-as-tenant tokens", () => {
  const IMP_TOKEN = { sub: "admin-1", businessId: null, role: "ADMIN", impersonatedBusinessId: "biz-target" };

  function harness(opts: { role?: string; deletedAt?: Date | null; missingAdmin?: boolean; missingBiz?: boolean } = {}) {
    const jwt = { verify: vi.fn().mockReturnValue(IMP_TOKEN) };
    const prisma = {
      user: {
        findUnique: vi
          .fn()
          .mockResolvedValue(opts.missingAdmin ? null : { id: "admin-1", role: opts.role ?? "ADMIN" }),
      },
      business: {
        findUnique: vi
          .fn()
          .mockResolvedValue(
            opts.missingBiz ? null : { id: "biz-target", deletedAt: opts.deletedAt ?? null },
          ),
      },
    };
    return { jwt, prisma, guard: new TenantAuthGuard(jwt as any, prisma as any) };
  }

  it("scopes a GET to the impersonated business", async () => {
    const { prisma, guard } = harness();
    const req = makeReq({ method: "GET", headers: { authorization: "Bearer t" } });

    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect((req as any).businessId).toBe("biz-target");
    // The admin is never looked up as a member of that business — they are
    // authorized as an admin and the target is validated separately.
    expect(prisma.business.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "biz-target" } }),
    );
  });

  // The property the whole feature rests on. An admin looking at a support
  // case must not be able to act as the contractor — emailing that
  // contractor's customer, taking a payment, deleting their work — because
  // the tenant would later see those as their own doing.
  it.each(["POST", "PATCH", "PUT", "DELETE"])("refuses %s outright", async (method) => {
    const { prisma, guard } = harness();
    const req = makeReq({ method, headers: { authorization: "Bearer t" } });

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect((req as any).businessId).toBeUndefined();
    // Refused before any lookup — the method alone settles it.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuses once the admin has been demoted, without waiting for expiry", async () => {
    const { guard } = harness({ role: "OWNER" });
    const req = makeReq({ method: "GET", headers: { authorization: "Bearer t" } });

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect((req as any).businessId).toBeUndefined();
  });

  it("refuses when the admin account no longer exists", async () => {
    const { guard } = harness({ missingAdmin: true });
    const req = makeReq({ method: "GET", headers: { authorization: "Bearer t" } });

    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses when the target tenant is suspended or gone", async () => {
    for (const opts of [{ deletedAt: new Date() }, { missingBiz: true }]) {
      const { guard } = harness(opts);
      const req = makeReq({ method: "GET", headers: { authorization: "Bearer t" } });
      await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
      expect((req as any).businessId).toBeUndefined();
    }
  });
});
