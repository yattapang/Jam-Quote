import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AdminService, type AdminActor } from "./admin.service.js";

const SUPER: AdminActor = { userId: "super-1", isSuperAdmin: true };
const REGULAR: AdminActor = { userId: "reg-1", isSuperAdmin: false };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const make = (prisma: any, record = vi.fn()) => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: new AdminService(prisma as any, {} as any, { record } as any, {} as any),
  record,
});

describe("AdminService.promoteAdmin", () => {
  it("throws NotFound when no user has that email", async () => {
    const prisma = { user: { findFirst: vi.fn().mockResolvedValue(null) } };
    const { svc } = make(prisma);
    await expect(
      svc.promoteAdmin({ email: "ghost@example.com", capabilities: [] }, SUPER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("forbids a non-super-admin from granting super-admin status", async () => {
    const prisma = { user: { findFirst: vi.fn(), update: vi.fn() } };
    const { svc } = make(prisma);
    await expect(
      svc.promoteAdmin({ email: "x@y.com", capabilities: [], isSuperAdmin: true }, REGULAR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("forbids a non-super-admin from reaching an existing super-admin's row via promote", async () => {
    // The target is ALREADY a super-admin; the actor's request doesn't set
    // isSuperAdmin at all (just tries to clear their capabilities). The old
    // code only checked `input.isSuperAdmin && !actor.isSuperAdmin`, which is
    // false here, so it fell through to prisma.user.update and wiped the
    // super-admin's capabilities. updateAdmin/revokeAdmin both refuse this;
    // promoteAdmin must too.
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: "super-victim", isSuperAdmin: true }),
        update: vi.fn(),
      },
    };
    const { svc } = make(prisma);

    await expect(
      svc.promoteAdmin({ email: "victim@jamquote.com", capabilities: [] }, REGULAR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("promotes an existing user, sets capabilities, and audits", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({ id: "u-9", isSuperAdmin: false }),
        update: vi.fn().mockResolvedValue({
          id: "u-9",
          email: "staff@jamquote.com",
          fullName: "New Staff",
          isSuperAdmin: false,
          adminCapabilities: ["MANAGE_PRICING"],
          createdAt: new Date("2026-07-30T00:00:00.000Z"),
        }),
      },
    };
    const { svc, record } = make(prisma);

    const result = await svc.promoteAdmin(
      { email: "Staff@JamQuote.com", capabilities: ["MANAGE_PRICING"] },
      SUPER,
    );

    expect(result.capabilities).toEqual(["MANAGE_PRICING"]);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-9" },
        data: expect.objectContaining({ role: "ADMIN", adminCapabilities: ["MANAGE_PRICING"] }),
      }),
    );
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.promote", targetId: "u-9" }));
  });

  // Decision 4b: an admin must not also be a contractor for their business.
  it("clears businessId when promoting a user who is not a business's sole owner", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "u-staff",
          isSuperAdmin: false,
          businessId: "biz-1",
          role: "STAFF",
        }),
        count: vi.fn(),
        update: vi.fn().mockResolvedValue({
          id: "u-staff",
          email: "staff2@jamquote.com",
          fullName: "Staff Two",
          isSuperAdmin: false,
          adminCapabilities: [],
          businessId: null,
          createdAt: new Date("2026-07-30T00:00:00.000Z"),
        }),
      },
    };
    const { svc } = make(prisma);

    const result = await svc.promoteAdmin({ email: "staff2@jamquote.com", capabilities: [] }, SUPER);

    expect(result.businessId).toBeNull();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "u-staff" },
        data: expect.objectContaining({ businessId: null }),
      }),
    );
    // STAFF can never orphan a business, so the sole-owner count is never even checked.
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it("refuses to promote a business's sole OWNER, leaving businessId untouched", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "u-owner",
          isSuperAdmin: false,
          businessId: "biz-1",
          role: "OWNER",
        }),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn(),
      },
    };
    const { svc } = make(prisma);

    await expect(
      svc.promoteAdmin({ email: "owner@jamquote.com", capabilities: [] }, SUPER),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { businessId: "biz-1", role: "OWNER" } });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("clears businessId when promoting an OWNER who shares ownership with another OWNER", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "u-owner2",
          isSuperAdmin: false,
          businessId: "biz-2",
          role: "OWNER",
        }),
        count: vi.fn().mockResolvedValue(2),
        update: vi.fn().mockResolvedValue({
          id: "u-owner2",
          email: "owner2@jamquote.com",
          fullName: "Co-owner",
          isSuperAdmin: false,
          adminCapabilities: [],
          businessId: null,
          createdAt: new Date("2026-07-30T00:00:00.000Z"),
        }),
      },
    };
    const { svc } = make(prisma);

    const result = await svc.promoteAdmin({ email: "owner2@jamquote.com", capabilities: [] }, SUPER);

    expect(result.businessId).toBeNull();
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessId: null }) }),
    );
  });
});

describe("AdminService.updateAdmin", () => {
  it("blocks demoting the last super-admin", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "super-1",
          role: "ADMIN",
          isSuperAdmin: true,
          adminCapabilities: [],
        }),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const { svc } = make(prisma);
    await expect(
      svc.updateAdmin("super-1", { isSuperAdmin: false }, SUPER),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("forbids a non-super-admin from editing a super-admin", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "super-2",
          role: "ADMIN",
          isSuperAdmin: true,
          adminCapabilities: [],
        }),
      },
    };
    const { svc } = make(prisma);
    await expect(
      svc.updateAdmin("super-2", { capabilities: ["MANAGE_TENANTS"] }, REGULAR),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("updates a regular admin's capabilities and audits", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "u-2",
          role: "ADMIN",
          isSuperAdmin: false,
          adminCapabilities: [],
        }),
        update: vi.fn().mockResolvedValue({
          id: "u-2",
          email: "a@b.com",
          fullName: null,
          isSuperAdmin: false,
          adminCapabilities: ["MANAGE_PRICING", "VIEW_FINANCIALS"],
          createdAt: new Date(),
        }),
      },
    };
    const { svc, record } = make(prisma);

    const result = await svc.updateAdmin(
      "u-2",
      { capabilities: ["MANAGE_PRICING", "VIEW_FINANCIALS"] },
      SUPER,
    );

    expect(result.capabilities).toEqual(["MANAGE_PRICING", "VIEW_FINANCIALS"]);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.update", targetId: "u-2" }));
  });
});

describe("AdminService.revokeAdmin", () => {
  it("blocks revoking yourself", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "super-1", role: "ADMIN", isSuperAdmin: true }),
      },
    };
    const { svc } = make(prisma);
    await expect(svc.revokeAdmin("super-1", SUPER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("blocks revoking the last super-admin", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "super-2", role: "ADMIN", isSuperAdmin: true }),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const { svc } = make(prisma);
    await expect(svc.revokeAdmin("super-2", SUPER)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("revokes a regular admin back to OWNER, clears capabilities, and audits", async () => {
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "u-3", role: "ADMIN", isSuperAdmin: false }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const { svc, record } = make(prisma);

    const result = await svc.revokeAdmin("u-3", SUPER);

    expect(result).toEqual({ revoked: true, userId: "u-3" });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-3" },
      data: { role: "OWNER", isSuperAdmin: false, adminCapabilities: [] },
    });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.revoke", targetId: "u-3" }));
  });

  it("throws NotFound when the target isn't an admin", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: "u-4", role: "OWNER", isSuperAdmin: false }) },
    };
    const { svc } = make(prisma);
    await expect(svc.revokeAdmin("u-4", SUPER)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// Decision 5b: "view as tenant" is gated on IMPERSONATE_TENANTS, not
// MANAGE_TENANTS. AdminGuard/@RequireCapability already enforce this at the
// route, but AdminService.impersonateTenant re-checks it itself (defense in
// depth for the console's single most sensitive action).
describe("AdminService.impersonateTenant — capability re-check", () => {
  const business = { id: "biz-1", name: "Acme", deletedAt: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const makeWithAuth = (issueImpersonationToken = vi.fn()) => {
    const prisma = {
      business: { findUnique: vi.fn().mockResolvedValue(business) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: "admin-1", role: "ADMIN" }) },
    };
    const record = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any, { issueImpersonationToken } as any);
    return { svc, prisma, record, issueImpersonationToken };
  };

  it("refuses an actor with MANAGE_TENANTS but not IMPERSONATE_TENANTS", async () => {
    const { svc, prisma, issueImpersonationToken } = makeWithAuth();
    const actor: AdminActor = { userId: "admin-1", isSuperAdmin: false, capabilities: ["MANAGE_TENANTS"] };

    await expect(svc.impersonateTenant("biz-1", "admin-1", actor)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.business.findUnique).not.toHaveBeenCalled();
    expect(issueImpersonationToken).not.toHaveBeenCalled();
  });

  it("allows an actor with IMPERSONATE_TENANTS", async () => {
    const issueImpersonationToken = vi.fn().mockReturnValue({ token: "tok", expiresAt: "later" });
    const { svc } = makeWithAuth(issueImpersonationToken);
    const actor: AdminActor = { userId: "admin-1", isSuperAdmin: false, capabilities: ["IMPERSONATE_TENANTS"] };

    const result = await svc.impersonateTenant("biz-1", "admin-1", actor);

    expect(result.token).toBe("tok");
    expect(issueImpersonationToken).toHaveBeenCalled();
  });

  it("allows a super-admin regardless of their explicit capability list", async () => {
    const issueImpersonationToken = vi.fn().mockReturnValue({ token: "tok", expiresAt: "later" });
    const { svc } = makeWithAuth(issueImpersonationToken);
    const actor: AdminActor = { userId: "admin-1", isSuperAdmin: true, capabilities: [] };

    await expect(svc.impersonateTenant("biz-1", "admin-1", actor)).resolves.toMatchObject({ token: "tok" });
  });
});
