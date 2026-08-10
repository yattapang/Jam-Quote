import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AdminService } from "./admin.service.js";

describe("AdminService.overview", () => {
  it("aggregates platform-wide counts, not scoped to a single business", async () => {
    const prisma = {
      business: { count: vi.fn().mockResolvedValue(8) },
      subscription: { count: vi.fn().mockResolvedValue(5) },
      supplier: { count: vi.fn().mockResolvedValue(6) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any);

    const overview = await svc.overview();

    expect(overview).toEqual({
      businesses: 8,
      activeSubscriptions: 5,
      suppliersTracked: 6,
      jurisdictionsLive: 1, // only JM is live today
    });
    expect(prisma.business.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
    expect(prisma.subscription.count).toHaveBeenCalledWith({ where: { status: "active" } });
  });
});

describe("AdminService.tenants", () => {
  it("maps subscription plan/status with defaults when no subscription exists", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const prisma = {
      business: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "biz-1",
            name: "Blackwood Construction",
            parish: "St. Catherine",
            trn: "102458963",
            createdAt: now,
            deletedAt: null,
            subscription: { plan: "Pro", status: "active" },
            _count: { quotes: 4 },
          },
          {
            id: "biz-2",
            name: "No Sub Yet Ltd",
            parish: null,
            trn: null,
            createdAt: now,
            deletedAt: null,
            subscription: null,
            _count: { quotes: 0 },
          },
        ]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any);

    const tenants = await svc.tenants();

    expect(tenants).toEqual([
      {
        id: "biz-1",
        name: "Blackwood Construction",
        parish: "St. Catherine",
        plan: "Pro",
        trn: "102458963",
        status: "active",
        createdAt: now,
        quoteCount: 4,
        suspended: false,
      },
      {
        id: "biz-2",
        name: "No Sub Yet Ltd",
        parish: null,
        plan: "Free",
        trn: null,
        status: "active",
        createdAt: now,
        quoteCount: 0,
        suspended: false,
      },
    ]);
    expect(prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        include: { subscription: true, _count: { select: { quotes: true } } },
      }),
    );
  });

  it("includes suspended tenants (flagged) when includeSuspended is true", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const prisma = {
      business: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "biz-3",
            name: "Suspended Co",
            parish: null,
            trn: null,
            createdAt: now,
            deletedAt: now,
            subscription: null,
            _count: { quotes: 0 },
          },
        ]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any);

    const tenants = await svc.tenants(true);

    expect(tenants[0]?.suspended).toBe(true);
    expect(prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });
});

describe("AdminService.suspendTenant / restoreTenant", () => {
  it("soft-deletes the business and records an audit entry", async () => {
    const business = { id: "biz-1", name: "Blackwood Construction", deletedAt: null };
    const record = vi.fn();
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue(business),
        update: vi.fn().mockResolvedValue({ ...business, deletedAt: new Date() }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any);

    await svc.suspendTenant("biz-1", "admin-1");

    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "biz-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: "admin-1",
        action: "tenant.suspend",
        targetType: "Business",
        targetId: "biz-1",
      }),
    );
  });

  it("rejects suspending an already-suspended tenant", async () => {
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: "biz-1", name: "X", deletedAt: new Date() }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any);

    await expect(svc.suspendTenant("biz-1", "admin-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("restores a suspended tenant and records an audit entry", async () => {
    const business = { id: "biz-1", name: "Blackwood Construction", deletedAt: new Date() };
    const record = vi.fn();
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue(business),
        update: vi.fn().mockResolvedValue({ ...business, deletedAt: null }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any);

    await svc.restoreTenant("biz-1", "admin-1");

    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "biz-1" },
      data: { deletedAt: null },
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant.restore", targetId: "biz-1" }),
    );
  });

  it("rejects restoring a tenant that isn't suspended", async () => {
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: "biz-1", name: "X", deletedAt: null }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any);

    await expect(svc.restoreTenant("biz-1", "admin-1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("AdminService.hardDeleteTenant", () => {
  it("rejects when confirmName does not match the business's exact name", async () => {
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: "biz-1", name: "Blackwood Construction" }),
      },
      $transaction: vi.fn(),
    };
    const record = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any);

    await expect(
      svc.hardDeleteTenant("biz-1", "wrong name", "admin-1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it("throws NotFound when the business does not exist", async () => {
    const prisma = {
      business: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any);

    await expect(svc.hardDeleteTenant("biz-1", "anything", "admin-1")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("runs the cascade delete in a transaction and audits on an exact confirmName match", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      messageLog: { deleteMany },
      invoice: { deleteMany },
      attachment: { deleteMany },
      quote: { deleteMany },
      job: { deleteMany },
      client: { deleteMany },
      labourRate: { deleteMany },
      materialFavourite: { deleteMany },
      equipmentItem: { deleteMany },
      connection: { deleteMany },
      subscription: { deleteMany },
      materialPriceEntry: { deleteMany },
      supplier: { deleteMany },
      user: { deleteMany },
      business: { delete: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: "biz-1", name: "Blackwood Construction" }),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    const record = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record } as any);

    const result = await svc.hardDeleteTenant("biz-1", "Blackwood Construction", "admin-1");

    expect(result).toEqual({ deleted: true, businessId: "biz-1" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.business.delete).toHaveBeenCalledWith({ where: { id: "biz-1" } });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant.delete", targetId: "biz-1" }),
    );
  });

  it("clears the tenant's suppliers (and their price entries) before the business row", async () => {
    // Supplier.businessId cascades in the DB, but leaving it to that would
    // delete suppliers as a side effect of the Business delete — and
    // MaterialPriceEntry.supplierId is ON DELETE RESTRICT, which aborts
    // immediately instead of deferring to the end of the statement. The
    // explicit order in deleteBusinessCascade is what keeps a hard delete
    // from failing on any tenant that has recorded a price.
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const priceEntryDelete = vi.fn().mockResolvedValue({ count: 0 });
    const supplierDelete = vi.fn().mockResolvedValue({ count: 0 });
    const businessDelete = vi.fn().mockResolvedValue({});
    const tx = {
      messageLog: { deleteMany },
      invoice: { deleteMany },
      attachment: { deleteMany },
      quote: { deleteMany },
      job: { deleteMany },
      client: { deleteMany },
      labourRate: { deleteMany },
      materialFavourite: { deleteMany },
      equipmentItem: { deleteMany },
      connection: { deleteMany },
      subscription: { deleteMany },
      materialPriceEntry: { deleteMany: priceEntryDelete },
      supplier: { deleteMany: supplierDelete },
      user: { deleteMany },
      business: { delete: businessDelete },
    };
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: "biz-1", name: "Blackwood Construction" }),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any);

    await svc.hardDeleteTenant("biz-1", "Blackwood Construction", "admin-1");

    expect(supplierDelete).toHaveBeenCalledWith({ where: { businessId: "biz-1" } });
    expect(priceEntryDelete.mock.invocationCallOrder[0]).toBeLessThan(
      supplierDelete.mock.invocationCallOrder[0]!,
    );
    expect(supplierDelete.mock.invocationCallOrder[0]).toBeLessThan(
      businessDelete.mock.invocationCallOrder[0]!,
    );
  });
});

// Supplier CRUD used to be tested here. Suppliers are tenant-owned now and
// the admin service has no supplier surface — see suppliers.service.test.ts.

describe("AdminService.financials", () => {
  it("computes free/pro counts, MRR, and upcoming renewals within 60 days", async () => {
    const now = Date.now();
    const soon = new Date(now + 10 * 24 * 60 * 60 * 1000);
    const tooFar = new Date(now + 90 * 24 * 60 * 60 * 1000);
    const prisma = {
      business: {
        findMany: vi.fn().mockResolvedValue([
          { id: "biz-1", name: "Pro Co", subscription: { plan: "pro", renewsAt: soon } },
          { id: "biz-2", name: "Free Co", subscription: null },
          {
            id: "biz-3",
            name: "Pro Later Co",
            subscription: { plan: "pro", renewsAt: tooFar },
          },
        ]),
      },
    };
    const pricingService = {
      get: vi.fn().mockResolvedValue({
        freeQuotesPerMonth: 5,
        proMonthlyPriceCents: 200_000,
        proAnnualPriceCents: 2_000_000,
        currency: "JMD",
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, pricingService as any, { record: vi.fn() } as any);

    const financials = await svc.financials();

    expect(financials.freeCount).toBe(1);
    expect(financials.proCount).toBe(2);
    expect(financials.currency).toBe("JMD");
    expect(financials.proMonthlyPriceCents).toBe(200_000);
    expect(financials.mrrCents).toBe(400_000);
    expect(financials.upcomingRenewals).toEqual([
      { businessId: "biz-1", businessName: "Pro Co", plan: "pro", renewsAt: soon },
    ]);
  });
});

describe("AdminService.regulatory", () => {
  it("returns regulatory updates ordered by publishedAt desc", async () => {
    const row = {
      id: "reg-1",
      title: "GCT threshold change",
      category: "GCT",
      summary: "Registration threshold increases.",
      effectiveDate: new Date("2026-08-01T00:00:00.000Z"),
      sourceUrl: "https://jamaicatax.gov.jm",
      actionNeeded: "Review pricing for small clients.",
    };
    const prisma = {
      regulatoryUpdate: { findMany: vi.fn().mockResolvedValue([row]) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any);

    const updates = await svc.regulatory();

    expect(updates).toEqual([row]);
    expect(prisma.regulatoryUpdate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { publishedAt: "desc" } }),
    );
  });
});
