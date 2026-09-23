import { describe, expect, it, vi } from "vitest";
import { AuditService, NON_FINANCIAL_AUDIT_ACTIONS } from "./audit.service.js";

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

    await svc.recent(true);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  });

  it("passes non-financial rows through unchanged when includeFinancials is false", async () => {
    const row = {
      id: "log-1",
      action: "tenant.suspend",
      details: { name: "Blackwood Construction" },
    };
    const prisma = { auditLog: { findMany: vi.fn().mockResolvedValue([row]) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AuditService(prisma as any);

    const rows = await svc.recent(false);

    expect(rows[0]?.details).toEqual({ name: "Blackwood Construction" });
  });

  it("redacts details for a financial action when includeFinancials is false", async () => {
    const row = {
      id: "log-2",
      action: "tenant.setPlan",
      details: { plan: "pro", interval: "annual", priceCents: 480000, renewsAt: "2027-01-01" },
    };
    const prisma = { auditLog: { findMany: vi.fn().mockResolvedValue([row]) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AuditService(prisma as any);

    const rows = await svc.recent(false);

    // The bypass: the caller lacks VIEW_FINANCIALS/MANAGE_TENANTS, so the
    // negotiated price must not be reachable through this row at all.
    expect(JSON.stringify(rows[0]?.details)).not.toMatch(/priceCents|480000/);
  });

  it("leaves details untouched for a financial action when includeFinancials is true", async () => {
    const row = {
      id: "log-3",
      action: "subscription.payment.record",
      details: { amountCents: 12000, method: "cash", coversUntil: "2026-12-01" },
    };
    const prisma = { auditLog: { findMany: vi.fn().mockResolvedValue([row]) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AuditService(prisma as any);

    const rows = await svc.recent(true);

    expect(rows[0]?.details).toEqual(row.details);
  });

  it("redacts an UNREGISTERED action's details when includeFinancials is false — the safe default for anything not explicitly allow-listed", async () => {
    const row = {
      id: "log-4",
      action: "some.new.action.nobody.registered.yet",
      details: { anything: "at all", couldBe: 123 },
    };
    const prisma = { auditLog: { findMany: vi.fn().mockResolvedValue([row]) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AuditService(prisma as any);

    const rows = await svc.recent(false);

    expect(rows[0]?.details).toEqual({
      redacted: "financial details — requires VIEW_FINANCIALS or MANAGE_TENANTS",
    });
  });

  it("redacts pricing.update — a financial action deliberately left off the allow-list", async () => {
    const row = {
      id: "log-5",
      action: "pricing.update",
      details: { proMonthlyPriceCents: 250000 },
    };
    const prisma = { auditLog: { findMany: vi.fn().mockResolvedValue([row]) } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AuditService(prisma as any);

    const rows = await svc.recent(false);

    expect(JSON.stringify(rows[0]?.details)).not.toMatch(/proMonthlyPriceCents|250000/);
  });

  it("NON_FINANCIAL_AUDIT_ACTIONS excludes every known money-carrying action", () => {
    for (const financial of [
      "tenant.setPlan",
      "pricing.update",
      "subscription.payment.record",
      "subscription.payment.void",
    ]) {
      expect(NON_FINANCIAL_AUDIT_ACTIONS.has(financial)).toBe(false);
    }
  });
});
