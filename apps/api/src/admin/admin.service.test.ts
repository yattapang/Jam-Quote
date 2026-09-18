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

describe("AdminService.setTenantPlan — renewsAt follows the LEDGER", () => {
  const DAY = 86_400_000;
  const NOW = new Date("2026-09-13T15:00:00.000Z");
  /** Returns both the resulting renewsAt and the payment query that produced it,
   * so the `voidedAt`/`orderBy` half of the rule is pinned too. */
  const runFull = async (
    current: { plan: string; interval: string; renewsAt: Date | null } | null,
    input: object,
    latestPayment: { coversUntil: Date } | null = null,
  ) => {
    vi.useFakeTimers({ now: NOW });
    try {
      const upsert = vi.fn().mockImplementation(({ update }) => update);
      const findFirst = vi.fn().mockResolvedValue(latestPayment);
      const prisma = {
        business: { findUnique: vi.fn().mockResolvedValue({ id: "b" }) },
        subscription: { findUnique: vi.fn().mockResolvedValue(current), upsert },
        subscriptionPayment: { findFirst },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = await svc.setTenantPlan("b", input as any, "actor");
      return {
        iso: sub.renewsAt ? (sub.renewsAt as Date).toISOString() : null,
        paymentQuery: findFirst.mock.calls[0]?.[0] as
          | { where: Record<string, unknown>; orderBy: Record<string, unknown> }
          | undefined,
      };
    } finally {
      vi.useRealTimers();
    }
  };
  const run = async (...args: Parameters<typeof runFull>) => (await runFull(...args)).iso;

  const left20 = new Date(NOW.getTime() + 20 * DAY); // 2026-10-03, a live term
  // Deliberately NOT equal to `left20`. Both earlier tests here set
  // `coversUntil === renewsAt`, which made them pass with `base = current.renewsAt`
  // — i.e. with the defect this rule exists to prevent — so the fixtures differ now.
  const paidThrough40 = new Date(NOW.getTime() + 40 * DAY); // 2026-10-23

  it("re-saving the SAME plan and interval is a true no-op on renewsAt", async () => {
    expect(await run({ plan: "pro", interval: "monthly", renewsAt: left20 }, { plan: "pro", interval: "monthly" }))
      .toBe(left20.toISOString());
  });

  it("a switch sets renewsAt to what the LEDGER is paid through, granting no term", async () => {
    // The base is the payment's coversUntil, which is 40 days out while renewsAt is
    // 20 days out: `base = current.renewsAt` gives a different (wrong) answer here.
    expect(
      await run(
        { plan: "pro", interval: "monthly", renewsAt: left20 },
        { plan: "pro", interval: "annual" },
        { coversUntil: paidThrough40 },
      ),
    ).toBe(paidThrough40.toISOString());
  });

  it("a NEARER ledger date cannot shorten a FURTHER granted term", async () => {
    // The merge-gate attack: renewsAt 2028-01-01 from a term granted by hand, one
    // surviving payment covering 18 days out. Returning the first future candidate
    // (the ledger) deleted 15 months the tenant was entitled to, and `recordPayment`
    // then took `coversFrom` from the reduced date, so no later payment restored it.
    const granted = new Date(NOW.getTime() + 840 * DAY);
    const nearLedger = new Date(NOW.getTime() + 18 * DAY);
    expect(
      await run(
        { plan: "pro", interval: "annual", renewsAt: granted },
        { plan: "pro", interval: "monthly" },
        { coversUntil: nearLedger },
      ),
    ).toBe(granted.toISOString());
  });

  it("looks up the latest SURVIVING payment by coversUntil, not the latest paidAt", async () => {
    const { paymentQuery } = await runFull(
      { plan: "pro", interval: "monthly", renewsAt: left20 },
      { plan: "pro", interval: "annual" },
      { coversUntil: paidThrough40 },
    );
    // A voided payment is money that was taken back; ordering by `paidAt` picks the
    // most RECENTLY PAID row, which after a backdated catch-up payment is not the one
    // that reaches furthest into the future. Both substitutions left 145 tests green.
    expect(paymentQuery?.where).toEqual({ businessId: "b", voidedAt: null });
    expect(paymentQuery?.orderBy).toEqual({ coversUntil: "desc" });
  });

  it("alternating switches never stack a term", async () => {
    const ledger = { coversUntil: paidThrough40 };
    const toAnnual = await run(
      { plan: "pro", interval: "monthly", renewsAt: left20 },
      { plan: "pro", interval: "annual" },
      ledger,
    );
    const toMonthly = await run(
      { plan: "pro", interval: "annual", renewsAt: paidThrough40 },
      { plan: "pro", interval: "monthly" },
      ledger,
    );
    expect(toAnnual).toBe(paidThrough40.toISOString());
    expect(toMonthly).toBe(paidThrough40.toISOString());
  });

  it("HIGH: a switch never moves renewsAt into the PAST, whatever the ledger says", async () => {
    // Sub {pro, annual, renewsAt 2027-01-01} with one surviving payment covering only
    // through 2026-03-01 (the others voided, or the term granted by hand). Basing the
    // new term on that stale coversUntil produced 2026-03-29 — PAST_DUE — and the next
    // revert sweep downgraded a live, paying tenant to free.
    const granted = new Date("2027-01-01T00:00:00.000Z");
    expect(
      await run(
        { plan: "pro", interval: "annual", renewsAt: granted },
        { plan: "pro", interval: "monthly" },
        { coversUntil: new Date("2026-03-01T00:00:00.000Z") },
      ),
    ).toBe(granted.toISOString());
  });

  it("MEDIUM: paid -> free -> paid keeps the paid time the ledger still shows", async () => {
    // Setting free nulls renewsAt, so the only surviving record of the paid term is the
    // ledger. Reading it only for a currently-PAID row destroyed it.
    const annualPaidThrough = new Date("2027-06-01T00:00:00.000Z");
    expect(
      await run(
        { plan: "free", interval: "annual", renewsAt: null },
        { plan: "pro", interval: "monthly" },
        { coversUntil: annualPaidThrough },
      ),
    ).toBe(annualPaidThrough.toISOString());
  });

  it("a switch on a manual sub with no payment row keeps its granted term", async () => {
    expect(
      await run({ plan: "pro", interval: "monthly", renewsAt: left20 }, { plan: "pro", interval: "annual" }, null),
    ).toBe(left20.toISOString());
  });

  it("free -> pro with nothing paid or granted ahead starts today", async () => {
    expect(await run({ plan: "free", interval: "monthly", renewsAt: null }, { plan: "pro", interval: "monthly" }))
      .toBe("2026-10-13T15:00:00.000Z");
  });

  it("a lapsed pro term reactivated with the same plan starts today (not frozen in the past)", async () => {
    const lapsed = new Date(NOW.getTime() - 10 * DAY);
    expect(await run({ plan: "pro", interval: "monthly", renewsAt: lapsed }, { plan: "pro", interval: "monthly" }))
      .toBe("2026-10-13T15:00:00.000Z");
  });

  it("a lapsed ledger and a lapsed renewsAt start today, one term out", async () => {
    expect(
      await run(
        { plan: "pro", interval: "annual", renewsAt: new Date(NOW.getTime() - 10 * DAY) },
        { plan: "pro", interval: "annual" },
        { coversUntil: new Date(NOW.getTime() - 5 * DAY) },
      ),
    ).toBe("2027-09-13T15:00:00.000Z");
  });

  it("no subscription row starts today", async () => {
    expect(await run(null, { plan: "pro", interval: "monthly" })).toBe("2026-10-13T15:00:00.000Z");
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
            // Newest-first, `take: 1` — the tenant's last activity.
            quotes: [{ updatedAt: new Date("2026-02-14T09:30:00.000Z") }],
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
            // Never created a quote, so there is no activity to report.
            quotes: [],
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
        createdAt: now,
        // Last activity, NOT the signup date. The console's LAST ACTIVE column
        // rendered `createdAt`, so a dormant tenant who signed up yesterday looked
        // active and a busy one from 2024 looked abandoned — on the screen used to
        // decide who to suspend. `Subscription.status` is gone from this row: it was
        // written the literal "active" once and never updated again.
        lastActiveAt: new Date("2026-02-14T09:30:00.000Z"),
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
        createdAt: now,
        lastActiveAt: null,
        quoteCount: 0,
        suspended: false,
      },
    ]);
    expect(prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        include: {
          subscription: true,
          _count: { select: { quotes: { where: { deletedAt: null } } } },
          quotes: {
            where: { deletedAt: null },
            select: { updatedAt: true },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      }),
    );
  });

  it("excludes soft-deleted quotes from the last-activity query, falling back to an earlier non-deleted quote", async () => {
    // A tenant's only RECENT quote is soft-deleted. The `quotes` include
    // must filter `deletedAt: null` (asserted above), so a real Prisma
    // query never returns the deleted one — here that's simulated by the
    // mock only ever returning what such a filtered query would: the
    // newest quote that is NOT soft-deleted, not the newer deleted one.
    const now = new Date("2026-01-01T00:00:00.000Z");
    const earlierNonDeleted = new Date("2026-02-01T00:00:00.000Z");
    const prisma = {
      business: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "biz-4",
            name: "Soft-Deleted Latest Ltd",
            parish: null,
            trn: null,
            createdAt: now,
            deletedAt: null,
            subscription: null,
            _count: { quotes: 1 },
            // A correctly-filtered query never sees the newer, soft-deleted
            // quote at all — this IS the filtered result, the earlier live one.
            quotes: [{ updatedAt: earlierNonDeleted }],
          },
        ]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

    const tenants = await svc.tenants();

    expect(tenants[0]?.lastActiveAt).toEqual(earlierNonDeleted);
  });

  it("reports no recent activity when a tenant's only quote is soft-deleted", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const prisma = {
      business: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "biz-5",
            name: "Only Deleted Quote Ltd",
            parish: null,
            trn: null,
            createdAt: now,
            deletedAt: null,
            subscription: null,
            _count: { quotes: 0 },
            // The filtered query finds nothing to report.
            quotes: [],
          },
        ]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

    const tenants = await svc.tenants();

    expect(tenants[0]?.lastActiveAt).toBeNull();
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
            quotes: [],
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

  it("omits priceCents when includePrice is false", async () => {
    // AdminController.tenants passes includePrice: false for a caller
    // without VIEW_FINANCIALS/MANAGE_TENANTS. GET /admin/tenants itself
    // requires no capability, and plan + interval + priceCents across every
    // row is exactly what would let such a caller reconstruct the
    // financials screen (MRR, renewal mix) by summing this list. Without
    // this the negotiated price leaks straight through.
    const now = new Date("2026-01-01T00:00:00.000Z");
    const prisma = {
      business: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "biz-9",
            name: "Priced Co",
            parish: null,
            trn: null,
            createdAt: now,
            deletedAt: null,
            subscription: { plan: "Pro", interval: "annual", priceCents: 480000, renewsAt: now },
            _count: { quotes: 1 },
            quotes: [{ updatedAt: now }],
          },
        ]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

    const tenants = await svc.tenants(false, false);

    expect(tenants[0]?.priceCents).toBeNull();
  });

  it("includes priceCents when includePrice is true (the default)", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const prisma = {
      business: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "biz-9",
            name: "Priced Co",
            parish: null,
            trn: null,
            createdAt: now,
            deletedAt: null,
            subscription: { plan: "Pro", interval: "annual", priceCents: 480000, renewsAt: now },
            _count: { quotes: 1 },
            quotes: [{ updatedAt: now }],
          },
        ]),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new AdminService(prisma as any, {} as any, { record: vi.fn() } as any, {} as any);

    const tenants = await svc.tenants();

    expect(tenants[0]?.priceCents).toBe(480000);
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
      subscriptionPayment: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: 0 } }),
      },
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

  function withSubs(
    subs: Array<{ plan: string; interval?: string; priceCents?: number | null; renewsAt?: Date | null }>,
    collectedThisMonth = 0,
  ) {
    const prisma = {
      // The platform payment ledger behind "collected this month".
      subscriptionPayment: {
        aggregate: vi.fn().mockResolvedValue({ _sum: { amountCents: collectedThisMonth } }),
      },
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

  it("reports money that ACTUALLY arrived, separately from MRR", async () => {
    // With only MRR visible, recording a payment looked like it did nothing —
    // the tenant already owed the same amount. These are different questions
    // and the console has to ask both.
    const { svc } = withSubs([{ plan: "pro" }], 175_000);
    const f = await svc.financials();
    expect(f.mrrCents).toBe(200_000);
    expect(f.collectedThisMonthCents).toBe(175_000);
  });

  it("counts a lapsed paying tenant as past due", async () => {
    // Derived from renewsAt, never from Subscription.status, which is written
    // once as "active" and never updated.
    const { svc } = withSubs([
      { plan: "pro", renewsAt: new Date(Date.now() - 5 * 86_400_000) },
      { plan: "pro", renewsAt: new Date(Date.now() + 5 * 86_400_000) },
    ]);
    expect((await svc.financials()).pastDueCount).toBe(1);
  });

  it("does not count a free tenant as past due whatever its dates say", async () => {
    const { svc } = withSubs([{ plan: "free", renewsAt: new Date(Date.now() - 99 * 86_400_000) }]);
    expect((await svc.financials()).pastDueCount).toBe(0);
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
