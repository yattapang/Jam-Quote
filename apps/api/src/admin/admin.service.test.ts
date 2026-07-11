import { describe, expect, it, vi } from "vitest";
import { AdminService } from "./admin.service.js";

describe("AdminService.overview", () => {
  it("aggregates platform-wide counts, not scoped to a single business", async () => {
    const prisma = {
      business: { count: vi.fn().mockResolvedValue(8) },
      subscription: { count: vi.fn().mockResolvedValue(5) },
      supplier: { count: vi.fn().mockResolvedValue(6) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any);

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
            subscription: { plan: "Pro", status: "active" },
            _count: { quotes: 4 },
          },
          {
            id: "biz-2",
            name: "No Sub Yet Ltd",
            parish: null,
            trn: null,
            createdAt: now,
            subscription: null,
            _count: { quotes: 0 },
          },
        ]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any);

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
      },
    ]);
    expect(prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        include: { subscription: true, _count: { select: { quotes: true } } },
      }),
    );
  });
});

describe("AdminService.suppliers", () => {
  it("maps sku counts and the latest fetchedAt per supplier", async () => {
    const fetchedAt = new Date("2026-07-10T12:00:00.000Z");
    const prisma = {
      supplier: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "sup-1",
            name: "H&L Hardware",
            parish: "Kingston",
            isPartner: true,
            _count: { priceEntries: 3 },
          },
        ]),
      },
      materialPriceEntry: {
        findFirst: vi.fn().mockResolvedValue({ fetchedAt }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any);

    const suppliers = await svc.suppliers();

    expect(suppliers).toEqual([
      {
        id: "sup-1",
        name: "H&L Hardware",
        parish: "Kingston",
        isPartner: true,
        skuCount: 3,
        lastFetch: fetchedAt.toISOString(),
      },
    ]);
  });

  it("returns lastFetch null when a supplier has no price entries", async () => {
    const prisma = {
      supplier: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "sup-2",
            name: "No Prices Yet",
            parish: null,
            isPartner: false,
            _count: { priceEntries: 0 },
          },
        ]),
      },
      materialPriceEntry: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any);

    const suppliers = await svc.suppliers();

    expect(suppliers[0]?.lastFetch).toBeNull();
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
    const svc = new AdminService(prisma as any);

    const updates = await svc.regulatory();

    expect(updates).toEqual([row]);
    expect(prisma.regulatoryUpdate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { publishedAt: "desc" } }),
    );
  });
});
