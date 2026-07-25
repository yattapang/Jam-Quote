import { describe, expect, it, vi } from "vitest";
import { AuditService } from "./audit.service.js";

describe("AuditService.record", () => {
  it("resolves the actor's email from actorUserId and writes an AuditLog row", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue({ email: "admin@jamquote.jm" }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AuditService(prisma as any);

    await svc.record({
      actorUserId: "admin-1",
      action: "tenant.suspend",
      targetType: "Business",
      targetId: "biz-1",
      details: { name: "Blackwood Construction" },
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { email: true },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorUserId: "admin-1",
        actorEmail: "admin@jamquote.jm",
        action: "tenant.suspend",
        targetType: "Business",
        targetId: "biz-1",
        details: { name: "Blackwood Construction" },
      },
    });
  });

  it("falls back to 'unknown' when the actor user can't be found", async () => {
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AuditService(prisma as any);

    await svc.record({
      actorUserId: "ghost",
      action: "supplier.create",
      targetType: "Supplier",
      targetId: "sup-1",
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actorEmail: "unknown" }) }),
    );
  });
});

describe("AuditService.recent", () => {
  it("returns entries newest-first, capped at the given limit", async () => {
    const prisma = {
      auditLog: { findMany: vi.fn().mockResolvedValue([]) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AuditService(prisma as any);

    await svc.recent();

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });
});
