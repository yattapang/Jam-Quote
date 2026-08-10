import { describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AdminService, type AdminActor } from "./admin.service.js";

const SUPER: AdminActor = { userId: "super-1", isSuperAdmin: true };
const REGULAR: AdminActor = { userId: "reg-1", isSuperAdmin: false };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const make = (prisma: any, record = vi.fn()) => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: new AdminService(prisma as any, {} as any, { record } as any),
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
