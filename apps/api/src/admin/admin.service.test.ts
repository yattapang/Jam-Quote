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
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

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
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

    const tenants = await svc.tenants();

    expect(tenants).toEqual([
      {
        id: "biz-1",
        name: "Blackwood Construction",
        parish: "St. Catherine",
        plan: "Pro",
        // The term is part of the tenant row now — "Pro" alone says nothing
        // about what they pay or when they next will.
        interval: "monthly",
        priceCents: null,
        renewsAt: null,
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
        interval: "monthly",
        priceCents: null,
        renewsAt: null,
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
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

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
    const svc = new AdminService(prisma as any, {} as any, { record } as any, {} as any);

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
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

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
    const svc = new AdminService(prisma as any, {} as any, { record } as any, {} as any);

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
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

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
    const svc = new AdminService(prisma as any, {} as any, { record } as any, {} as any);

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
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

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
      project: { deleteMany },
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
    const svc = new AdminService(prisma as any, {} as any, { record } as any, {} as any);

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
      project: { deleteMany },
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
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

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
    const svc = new AdminService(prisma as any, pricingService as any, { record: vi.fn() } as any, {} as any);

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
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

    const updates = await svc.regulatory();

    expect(updates).toEqual([row]);
    expect(prisma.regulatoryUpdate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { publishedAt: "desc" } }),
    );
  });
});

describe("AdminService — regulatory feed CRUD", () => {
  /** The feed was read-only: staff could see a change but not record one,
   * correct one, or mark it dealt with. That is what "regulatory review is
   * static" meant when it was reported. */
  function withReg(regulatoryUpdate: Partial<Record<string, unknown>> = {}) {
    const prisma = {
      regulatoryUpdate: {
        create: vi.fn().mockResolvedValue({ id: "r1", title: "T", category: "GCT" }),
        update: vi.fn().mockResolvedValue({ id: "r1", title: "T" }),
        delete: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue({ id: "r1", title: "T", category: "GCT" }),
        findMany: vi.fn().mockResolvedValue([]),
        ...regulatoryUpdate,
      },
    };
    const audit = { record: vi.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, audit as any, {} as any);
    return { svc, prisma, audit };
  }

  it("records who created an entry — this feed is a compliance record", () => {
    const { svc, audit } = withReg();
    return svc
      .createRegulatory({ title: "GCT change", category: "GCT", summary: "s" }, "admin-1")
      .then(() => {
        expect(audit.record).toHaveBeenCalledWith(
          expect.objectContaining({ actorUserId: "admin-1", action: "regulatory.create" }),
        );
      });
  });

  it("leaves omitted fields alone but lets an explicit null clear one", async () => {
    // The distinction is the whole reason update takes a partial: omitting
    // sourceUrl must not wipe it, but sending null must.
    const { svc, prisma } = withReg();
    await svc.updateRegulatory("r1", { sourceUrl: null }, "admin-1");
    const data = prisma.regulatoryUpdate.update.mock.calls[0]![0].data;
    expect(data).toEqual({ sourceUrl: null });
    expect(data).not.toHaveProperty("title");
  });

  it("stamps reviewedAt and the reviewer when marked reviewed", async () => {
    const { svc, prisma } = withReg();
    await svc.reviewRegulatory("r1", true, "admin-7");
    const data = prisma.regulatoryUpdate.update.mock.calls[0]![0].data;
    expect(data.reviewedAt).toBeInstanceOf(Date);
    expect(data.reviewedByUserId).toBe("admin-7");
  });

  it("clears both when reopened, so a mistake does not need a DB edit to undo", async () => {
    const { svc, prisma } = withReg();
    await svc.reviewRegulatory("r1", false, "admin-7");
    expect(prisma.regulatoryUpdate.update.mock.calls[0]![0].data).toEqual({
      reviewedAt: null,
      reviewedByUserId: null,
    });
  });

  it("refuses to act on an entry that does not exist", async () => {
    const { svc, prisma } = withReg({ findUnique: vi.fn().mockResolvedValue(null) });
    await expect(svc.reviewRegulatory("missing", true, "a")).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.deleteRegulatory("missing", "a")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.regulatoryUpdate.update).not.toHaveBeenCalled();
    expect(prisma.regulatoryUpdate.delete).not.toHaveBeenCalled();
  });

  it("hard-deletes, and the audit entry is the record it existed", async () => {
    // Unlike a tenant: nothing references a regulatory row and no document
    // snapshots it, so a row created in error should leave rather than linger
    // as a tombstone in a compliance feed.
    const { svc, prisma, audit } = withReg();
    await svc.deleteRegulatory("r1", "admin-1");
    expect(prisma.regulatoryUpdate.delete).toHaveBeenCalledWith({ where: { id: "r1" } });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "regulatory.delete", details: expect.objectContaining({ title: "T" }) }),
    );
  });
});

describe("AdminService.financials — annual terms and negotiated prices", () => {
  const pricing = { proMonthlyPriceCents: 200_000, proAnnualPriceCents: 2_000_000, currency: "JMD", freeQuotesPerMonth: 15 };

  function withSubs(subs: Array<{ plan: string; interval?: string; priceCents?: number | null; renewsAt?: Date | null }>) {
    const prisma = {
      business: {
        findMany: vi.fn().mockResolvedValue(
          subs.map((s, i) => ({
            id: `b${i}`,
            name: `Biz ${i}`,
            subscription: {
              plan: s.plan,
              interval: s.interval ?? "monthly",
              priceCents: s.priceCents ?? null,
              renewsAt: s.renewsAt ?? null,
            },
          })),
        ),
      },
    };
    const pricingService = { get: vi.fn().mockResolvedValue(pricing) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, pricingService as any, { record: vi.fn() } as any, {} as any);
    return { svc };
  }

  it("counts a monthly pro tenant at the monthly price", async () => {
    const { svc } = withSubs([{ plan: "pro" }]);
    expect((await svc.financials()).mrrCents).toBe(200_000);
  });

  it("divides an annual term by twelve — MRR is a monthly figure", async () => {
    // Counting the whole annual price would overstate revenue 12x in the month
    // it renews and report zero for the other eleven.
    const { svc } = withSubs([{ plan: "pro", interval: "annual" }]);
    expect((await svc.financials()).mrrCents).toBe(Math.round(2_000_000 / 12));
  });

  it("does not report an annual tenant at the monthly list price", async () => {
    // That would ignore the discount they were actually given, which is the
    // whole point of offering a yearly term.
    const { svc } = withSubs([{ plan: "pro", interval: "annual" }]);
    expect((await svc.financials()).mrrCents).not.toBe(200_000);
  });

  it("honours a negotiated price over the list price", async () => {
    const { svc } = withSubs([{ plan: "pro", priceCents: 150_000 }]);
    expect((await svc.financials()).mrrCents).toBe(150_000);
  });

  it("honours a negotiated ANNUAL price, still per month", async () => {
    const { svc } = withSubs([{ plan: "pro", interval: "annual", priceCents: 1_200_000 }]);
    expect((await svc.financials()).mrrCents).toBe(100_000);
  });

  it("ignores free tenants entirely", async () => {
    const { svc } = withSubs([{ plan: "free" }, { plan: "free", priceCents: 999_999 }]);
    const f = await svc.financials();
    expect(f.mrrCents).toBe(0);
    expect(f.proCount).toBe(0);
    expect(f.freeCount).toBe(2);
  });

  it("sums a mixed book and reports how many are annual", async () => {
    const { svc } = withSubs([
      { plan: "pro" },
      { plan: "pro", interval: "annual" },
      { plan: "pro", interval: "annual", priceCents: 1_200_000 },
      { plan: "free" },
    ]);
    const f = await svc.financials();
    expect(f.proCount).toBe(3);
    expect(f.annualCount).toBe(2);
    expect(f.freeCount).toBe(1);
    expect(f.mrrCents).toBe(200_000 + Math.round(2_000_000 / 12) + 100_000);
  });
});
