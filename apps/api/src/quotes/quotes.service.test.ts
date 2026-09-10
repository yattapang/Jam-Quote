import { describe, expect, it, vi } from "vitest";
import { BadRequestException, HttpException } from "@nestjs/common";
import {
  JobComponentKind,
  computeTotals,
  GctTreatment,
  LineCategory,
  PriceSource,
  QuoteDetailLevel,
  QuoteStatus,
  RateUnit,
} from "@jamquote/core";
import { QuotesService } from "./quotes.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const line = {
  category: LineCategory.MATERIAL,
  description: "Carib Cement, 42.5kg bag",
  quantity: 10,
  rateUnit: RateUnit.UNIT,
  unitPriceCents: 120_000,
  priceSource: PriceSource.MANUAL,
  gctTreatment: GctTreatment.STANDARD,
};

describe("QuotesService.create", () => {
  it("persists totals computed by @jamquote/core, never hand-rolled", async () => {
    const businessService = {
      findById: vi.fn().mockResolvedValue({ defaultGctRate: 15 }),
      reserveQuoteNumber: vi.fn().mockResolvedValue("QT-0001"),
    };
    const tx = {
      quote: { create: vi.fn().mockResolvedValue({ id: "q1" }) },
      quoteSection: { create: vi.fn() },
      quoteLineItem: { create: vi.fn() },
    };
    const prisma = {
      // The allowance gate runs before revise now; a pro plan short-circuits it.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      quote: {
        findFirst: vi.fn().mockResolvedValue({ id: "q1", lineItems: [], sections: [] }),
      },
    };

    const svc = new QuotesService(prisma as any, businessService as any, {} as any);
    await svc.create("b1", { sections: [], lineItems: [line], discountPct: 5 } as any);

    const expected = computeTotals({
      lines: [{ quantity: 10, unitPriceCents: 120_000, gctTreatment: GctTreatment.STANDARD }],
      gctRatePct: 15,
      discountPct: 5,
      depositCents: 0,
    });

    expect(tx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subtotalCents: expected.subtotalCents,
          gctCents: expected.gctCents,
          totalCents: expected.totalCents,
        }),
      }),
    );
  });
});

describe("QuotesService.create — job lines + detail level", () => {
  const assemblyLine = {
    category: LineCategory.LABOUR,
    description: "Tiling — per sq ft",
    quantity: 100,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 2_500,
    priceSource: PriceSource.MANUAL,
    gctTreatment: GctTreatment.STANDARD,
    jobId: "asm-1",
    jobName: "Tiling — per sq ft",
    jobUnit: "sq ft",
    jobComponents: [
      {
        kind: JobComponentKind.MATERIAL,
        description: "Tile, 12x12",
        quantityPerUnit: 1,
        unitPriceCents: 1500,
      },
      {
        kind: JobComponentKind.LABOUR,
        description: "Mason",
        quantityPerUnit: 0.5,
        unitPriceCents: 2000,
      },
    ],
  };

  // Priced identically to assemblyLine (same category/quantity/unitPriceCents/
  // gctTreatment) but with no job fields at all — the plain-line case.
  const plainEquivalentLine = {
    category: LineCategory.LABOUR,
    description: "Tiling — per sq ft",
    quantity: 100,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 2_500,
    priceSource: PriceSource.MANUAL,
    gctTreatment: GctTreatment.STANDARD,
  };

  /** Harness whose fake prisma actually captures create() calls so findOne's
   * read-back reflects what was written — enough to assert a round-trip. */
  function harness() {
    const businessService = {
      findById: vi.fn().mockResolvedValue({ defaultGctRate: 15 }),
      reserveQuoteNumber: vi.fn().mockResolvedValue("QT-0001"),
    };
    const createdLineItems: any[] = [];
    let createdQuoteData: any;
    const tx = {
      quote: {
        create: vi.fn((args: any) => {
          createdQuoteData = args.data;
          return Promise.resolve({ id: "q1" });
        }),
      },
      quoteSection: { create: vi.fn() },
      quoteLineItem: {
        create: vi.fn((args: any) => {
          createdLineItems.push(args.data);
          return Promise.resolve({});
        }),
      },
    };
    const prisma = {
      // The allowance gate runs before revise now; a pro plan short-circuits it.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      quote: {
        findFirst: vi.fn(() =>
          Promise.resolve({
            id: "q1",
            ...createdQuoteData,
            lineItems: createdLineItems.filter((li) => !li.sectionId),
            sections: [],
          }),
        ),
      },
    };
    const svc = new QuotesService(prisma as any, businessService as any, {} as any);
    return { svc };
  }

  it("round-trips detailLevel + the job snapshot, with totals unchanged vs an equivalent plain line", async () => {
    const assemblyQuote = await harness().svc.create("b1", {
      sections: [],
      lineItems: [assemblyLine],
      detailLevel: QuoteDetailLevel.DETAILED,
    } as any);

    // Round-trip: detailLevel and the job fields come back as given.
    expect(assemblyQuote.detailLevel).toBe(QuoteDetailLevel.DETAILED);
    expect(assemblyQuote.lineItems).toHaveLength(1);
    expect(assemblyQuote.lineItems[0]).toMatchObject({
      jobId: "asm-1",
      jobName: "Tiling — per sq ft",
      jobUnit: "sq ft",
      jobComponents: assemblyLine.jobComponents,
    });

    const plainQuote = await harness().svc.create("b1", {
      sections: [],
      lineItems: [plainEquivalentLine],
    } as any);

    // A normal (non-job) line leaves the job fields unset, and
    // detailLevel defaults to SUMMARY when not supplied.
    expect(plainQuote.detailLevel).toBe(QuoteDetailLevel.SUMMARY);
    expect(plainQuote.lineItems[0]?.jobId).toBeUndefined();
    expect(plainQuote.lineItems[0]?.jobComponents).toBeUndefined();

    // Totals math is UNCHANGED by the job snapshot: an job line
    // is priced like any line (quantity x unitPriceCents), the component
    // snapshot is display-only and never fed into computeTotals, so the two
    // quotes' totals are identical despite one being DETAILED with a
    // component breakdown and the other a plain SUMMARY line.
    expect(assemblyQuote.subtotalCents).toBe(plainQuote.subtotalCents);
    expect(assemblyQuote.gctCents).toBe(plainQuote.gctCents);
    expect(assemblyQuote.totalCents).toBe(plainQuote.totalCents);

    const expected = computeTotals({
      lines: [{ quantity: 100, unitPriceCents: 2_500, gctTreatment: GctTreatment.STANDARD }],
      gctRatePct: 15,
      discountPct: 0,
      depositCents: 0,
    });
    expect(assemblyQuote.totalCents).toBe(expected.totalCents);
  });
});

describe("QuotesService.create free-tier gating", () => {
  /** Builds a full create() harness; `plan`/`quotesThisMonth` drive the gate. */
  function harness(plan: "free" | "pro", quotesThisMonth: number) {
    const businessService = {
      findById: vi.fn().mockResolvedValue({ defaultGctRate: 15 }),
      reserveQuoteNumber: vi.fn().mockResolvedValue("QT-0001"),
    };
    const pricingService = {
      get: vi.fn().mockResolvedValue({
        freeQuotesPerMonth: 5,
        proMonthlyPriceCents: 200_000,
        proAnnualPriceCents: 2_000_000,
        currency: "JMD",
      }),
    };
    const tx = {
      quote: { create: vi.fn().mockResolvedValue({ id: "q1" }) },
      quoteSection: { create: vi.fn() },
      quoteLineItem: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      quote: {
        findFirst: vi.fn().mockResolvedValue({ id: "q1", lineItems: [], sections: [] }),
        count: vi.fn().mockResolvedValue(quotesThisMonth),
      },
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan }) },
    };
    const svc = new QuotesService(prisma as any, businessService as any, pricingService as any);
    return { svc, prisma, businessService, pricingService, tx };
  }

  it("blocks a free business that has reached its monthly limit (402)", async () => {
    const { svc, prisma, businessService } = harness("free", 5);

    const attempt = svc.create("b1", { sections: [], lineItems: [line] } as any);

    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await attempt.catch((err: HttpException) => {
      expect(err.getStatus()).toBe(402);
      expect(err.getResponse()).toEqual(
        expect.objectContaining({ code: "FREE_LIMIT_REACHED" }),
      );
    });
    // Gate runs before any quote is actually created.
    expect(businessService.findById).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("allows a free business under its monthly limit", async () => {
    const { svc, tx } = harness("free", 2);

    await svc.create("b1", { sections: [], lineItems: [line] } as any);

    expect(tx.quote.create).toHaveBeenCalled();
  });

  it("never limits a Pro business, regardless of quote count", async () => {
    const { svc, tx, pricingService } = harness("pro", 999);

    await svc.create("b1", { sections: [], lineItems: [line] } as any);

    expect(tx.quote.create).toHaveBeenCalled();
    // Pro short-circuits before even reading the pricing config.
    expect(pricingService.get).not.toHaveBeenCalled();
  });
});

describe("QuotesService.updateStatus", () => {
  function serviceForQuote(status: QuoteStatus) {
    const quote = { id: "q1", status, lineItems: [], sections: [] };
    const prisma = {
      // The allowance gate runs first now: `revise` and `createVariation` were
      // ungated, so a tenant at the cap had an unlimited supply of sendable
      // documents. A pro plan short-circuits it.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
      quote: {
        findFirst: vi.fn().mockResolvedValue(quote),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    return { svc: new QuotesService(prisma as any, {} as any, {} as any), prisma };
  }

  it("allows SENT -> ACCEPTED without passing through VIEWED", async () => {
    // VIEWED is a tracking artifact nothing in this app can detect. Gating
    // acceptance behind it would force a contractor whose client phoned to say
    // yes to first record a "view" that never happened.
    const { svc, prisma } = serviceForQuote(QuoteStatus.SENT);
    await svc.updateStatus("b1", "q1", QuoteStatus.ACCEPTED);
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: QuoteStatus.ACCEPTED } }),
    );
  });

  it("allows a legal forward transition (DRAFT -> SENT)", async () => {
    const { svc, prisma } = serviceForQuote(QuoteStatus.DRAFT);
    await svc.updateStatus("b1", "q1", QuoteStatus.SENT);
    expect(prisma.quote.update).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: { status: QuoteStatus.SENT },
    });
  });

  it("rejects an illegal transition (DRAFT -> ACCEPTED)", async () => {
    const { svc, prisma } = serviceForQuote(QuoteStatus.DRAFT);
    await expect(svc.updateStatus("b1", "q1", QuoteStatus.ACCEPTED)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });
});

describe("QuotesService.revise", () => {
  function serviceForRevise(original: {
    status: QuoteStatus;
    number: string;
    version: number;
  }) {
    const originalQuote = {
      id: "q1",
      businessId: "b1",
      clientId: "cl1",
      projectId: "job1",
      status: original.status,
      number: original.number,
      version: original.version,
      gctRate: 15,
      discountPct: 0,
      depositCents: 0,
      validUntil: null,
      terms: null,
      subtotalCents: 1000,
      gctCents: 150,
      totalCents: 1150,
      lineItems: [],
      sections: [],
    };
    const revisedQuote = { ...originalQuote, id: "q2" };

    const tx = {
      quote: {
        create: vi.fn().mockResolvedValue({ id: "q2" }),
        aggregate: vi.fn(),
      },
      quoteSection: { create: vi.fn() },
      quoteLineItem: { create: vi.fn() },
    };
    const businessService = {
      reserveQuoteNumber: vi.fn().mockResolvedValue("QT-0200"),
    };
    const prisma = {
      // The allowance gate runs before revise now; a pro plan short-circuits it.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      quote: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(originalQuote)
          .mockResolvedValueOnce(revisedQuote),
      },
    };
    const svc = new QuotesService(prisma as any, businessService as any, {} as any);
    return { svc, tx, businessService, prisma };
  }

  it("reserves a brand-new number and resets to version 1 for an ACCEPTED quote", async () => {
    const { svc, tx, businessService } = serviceForRevise({
      status: QuoteStatus.ACCEPTED,
      number: "QT-0100",
      version: 1,
    });

    await svc.revise("b1", "q1");

    expect(businessService.reserveQuoteNumber).toHaveBeenCalledWith("b1");
    expect(tx.quote.aggregate).not.toHaveBeenCalled();
    expect(tx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: "QT-0200",
          version: 1,
          parentQuoteId: "q1",
        }),
      }),
    );
  });

  it("reserves a brand-new number and resets to version 1 for an INVOICED quote", async () => {
    const { svc, tx, businessService } = serviceForRevise({
      status: QuoteStatus.INVOICED,
      number: "QT-0100",
      version: 1,
    });

    await svc.revise("b1", "q1");

    expect(businessService.reserveQuoteNumber).toHaveBeenCalledWith("b1");
    expect(tx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ number: "QT-0200", version: 1, parentQuoteId: "q1" }),
      }),
    );
  });

  it("keeps the number and takes the next free version for a SENT quote", async () => {
    const { svc, tx, businessService } = serviceForRevise({
      status: QuoteStatus.SENT,
      number: "QT-0100",
      version: 1,
    });
    tx.quote.aggregate.mockResolvedValue({ _max: { version: 1 } });

    await svc.revise("b1", "q1");

    expect(businessService.reserveQuoteNumber).not.toHaveBeenCalled();
    expect(tx.quote.aggregate).toHaveBeenCalledWith({
      where: { businessId: "b1", number: "QT-0100" },
      _max: { version: true },
    });
    expect(tx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: "QT-0100",
          version: 2,
          parentQuoteId: "q1",
        }),
      }),
    );
  });

  it("does not collide when a v2 revision already exists (produces v3)", async () => {
    const { svc, tx } = serviceForRevise({
      status: QuoteStatus.SENT,
      number: "QT-0100",
      version: 2,
    });
    // The already-revised quote's own `version` is 2, but the max version
    // among all quotes sharing that number is what must drive the next one.
    tx.quote.aggregate.mockResolvedValue({ _max: { version: 2 } });

    await svc.revise("b1", "q1");

    expect(tx.quote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          number: "QT-0100",
          version: 3,
          parentQuoteId: "q1",
        }),
      }),
    );
  });
});

describe("QuotesService.remove", () => {
  function serviceForQuote(status: QuoteStatus) {
    const prisma = {
      // The allowance gate runs first now: `revise` and `createVariation` were
      // ungated, so a tenant at the cap had an unlimited supply of sendable
      // documents. A pro plan short-circuits it.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
      quote: {
        findFirst: vi.fn().mockResolvedValue({ id: "q1", status, lineItems: [], sections: [] }),
        // `remove` soft-deletes now: the schema declares deletedAt for offline
        // sync, and a hard delete also DECREMENTED the free-plan allowance, which
        // made create-email-delete an unlimited issuance loop.
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
        delete: vi.fn(),
      },
      quoteLineItem: { deleteMany: vi.fn() },
      quoteSection: { deleteMany: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    return { svc: new QuotesService(prisma as any, {} as any, {} as any), prisma };
  }

  it("SOFT-deletes a DRAFT quote, leaving a tombstone", async () => {
    // Two things the hard delete broke. `deletedAt` is declared "soft-delete for
    // offline sync", and a hard-deleted row means a device that was offline never
    // learns the quote is gone. And the allowance counts rows, so deleting one
    // gave the slot back: create a draft, email the PDF, delete, repeat.
    const { svc, prisma } = serviceForQuote(QuoteStatus.DRAFT);
    await svc.remove("b1", "q1");
    expect(prisma.quote.update).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.quote.delete).not.toHaveBeenCalled();
  });

  it("keeps the line items, so the tombstone records what was deleted", async () => {
    const { svc, prisma } = serviceForQuote(QuoteStatus.DRAFT);
    await svc.remove("b1", "q1");
    expect(prisma.quoteLineItem.deleteMany).not.toHaveBeenCalled();
    expect(prisma.quoteSection.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses to delete a non-DRAFT quote", async () => {
    const { svc, prisma } = serviceForQuote(QuoteStatus.SENT);
    await expect(svc.remove("b1", "q1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it("hides a tombstoned quote from the tenant's list and detail reads", async () => {
    // The other half: a soft delete is only a delete if nothing shows the row.
    const { svc, prisma } = serviceForQuote(QuoteStatus.DRAFT);
    await svc.findAll("b1");
    expect(prisma.quote.findMany.mock.calls[0]![0].where.deletedAt).toBeNull();
    await svc.findOne("b1", "q1");
    expect(prisma.quote.findFirst.mock.calls[0]![0].where.deletedAt).toBeNull();
  });
});

describe("variations", () => {
  it("refuses to vary a quote the client has not agreed to", async () => {
    // Varying a DRAFT or SENT quote is just editing it, and `revise` already
    // does that properly. The distinction is the point: a revision REPLACES,
    // a variation ADDS to something already agreed — and rewriting an accepted
    // quote would destroy the record of what the client actually agreed to.
    const prisma = {
      // The allowance gate runs first now: `revise` and `createVariation` were
      // ungated, so a tenant at the cap had an unlimited supply of sendable
      // documents. A pro plan short-circuits it.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
      quote: {
        findFirst: vi.fn().mockResolvedValue({
          id: "q1",
          businessId: "biz-1",
          status: "SENT",
          lineItems: [],
          sections: [],
        }),
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new QuotesService(prisma as any, {} as any, {} as any);
    await expect(svc.createVariation("biz-1", "q1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("inherits the job from the original, so the extra work counts against it", async () => {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      // The allowance gate runs first now: `revise` and `createVariation` were
      // ungated, so a tenant at the cap had an unlimited supply of sendable
      // documents. A pro plan short-circuits it.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
      quote: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "q1",
            businessId: "biz-1",
            status: "ACCEPTED",
            clientId: "c1",
            projectId: "proj-1",
            gctRate: 15,
            detailLevel: "SUMMARY",
            terms: null,
            lineItems: [],
            sections: [],
          })
          .mockResolvedValue({ id: "q2", lineItems: [], sections: [] }),
        create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
          created.push(args.data);
          return { id: "q2" };
        }),
      },
    };
    const businessService = { reserveQuoteNumber: vi.fn().mockResolvedValue("QT-0099") };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new QuotesService(prisma as any, businessService as any, {} as any);

    await svc.createVariation("biz-1", "q1");

    expect(created[0]).toMatchObject({
      variationOfQuoteId: "q1",
      projectId: "proj-1",
      clientId: "c1",
      status: "DRAFT",
    });
  });

  it("starts EMPTY — a variation is the new work, not a copy of the old", async () => {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      // The allowance gate runs first now: `revise` and `createVariation` were
      // ungated, so a tenant at the cap had an unlimited supply of sendable
      // documents. A pro plan short-circuits it.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
      quote: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({
            id: "q1",
            businessId: "biz-1",
            status: "ACCEPTED",
            clientId: "c1",
            projectId: null,
            gctRate: 15,
            detailLevel: "SUMMARY",
            terms: null,
            lineItems: [{ id: "li1" }],
            sections: [],
          })
          .mockResolvedValue({ id: "q2", lineItems: [], sections: [] }),
        create: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
          created.push(args.data);
          return { id: "q2" };
        }),
      },
    };
    const businessService = { reserveQuoteNumber: vi.fn().mockResolvedValue("QT-0099") };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new QuotesService(prisma as any, businessService as any, {} as any);

    await svc.createVariation("biz-1", "q1");

    // No lineItems key at all: copying the original's lines would double-bill
    // work the client has already agreed and paid for.
    expect(created[0]).not.toHaveProperty("lineItems");
  });
});


/**
 * The free allowance counts JOBS QUOTED, not documents produced.
 *
 * The old count was every `Quote` row created this month, which was wrong twice
 * over. It **over-charged**: a contractor who quoted two jobs and revised one of
 * them twice had used four of five, their own corrections eating an allowance
 * meant to measure how much work they were quoting for. And it **under-charged**,
 * which was the bigger hole: `revise` and `createVariation` mint a usable DRAFT
 * and never consulted the gate at all, so a tenant at the cap could keep going.
 *
 * A revision replaces an unagreed quote; a variation adds to an accepted one. The
 * job was counted when the original was created, so neither is counted again.
 */
describe("what the free allowance counts", () => {
  function countHarness(quotesThisMonth: number) {
    const prisma = {
      $transaction: vi.fn(async (cb: (t: unknown) => unknown) => cb({
        quote: { create: vi.fn().mockResolvedValue({ id: "q1" }) },
        quoteSection: { create: vi.fn() },
        quoteLineItem: { create: vi.fn() },
      })),
      quote: {
        findFirst: vi.fn().mockResolvedValue({ id: "q1", lineItems: [], sections: [] }),
        count: vi.fn().mockResolvedValue(quotesThisMonth),
      },
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "free" }) },
    };
    const businessService = {
      findById: vi.fn().mockResolvedValue({ id: "b1", defaultGctRate: 15 }),
      reserveQuoteNumber: vi.fn().mockResolvedValue("Q-0001"),
    };
    const pricingService = { get: vi.fn().mockResolvedValue({ freeQuotesPerMonth: 5 }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new QuotesService(prisma as any, businessService as any, pricingService as any);
    return { svc, prisma };
  }

  it("excludes revisions and variations from the count", async () => {
    const { svc, prisma } = countHarness(0);
    await svc.create("b1", { sections: [], lineItems: [line] } as never).catch(() => undefined);

    const where = prisma.quote.count.mock.calls[0]![0].where;
    // Keyed on LINEAGE, not version. The first attempt used `version: 1`, and a
    // review found that `revise` of a CLOSED quote reserves a new number and starts
    // again at version 1 — so the ordinary "client agreed, then we corrected the
    // sheet" path still ate an allowance. parentQuoteId catches all three kinds of
    // descendant; version caught two.
    expect(where.parentQuoteId).toBeNull();
    expect(where.variationOfQuoteId).toBeNull();
    expect(where.version, "version is the wrong key — see above").toBeUndefined();
  });

  it("still scopes the count to this business and this month", async () => {
    // The narrowing must not have lost the two clauses that make it a per-tenant
    // monthly allowance at all.
    const { svc, prisma } = countHarness(0);
    await svc.create("b1", { sections: [], lineItems: [line] } as never).catch(() => undefined);
    const where = prisma.quote.count.mock.calls[0]![0].where;
    expect(where.businessId).toBe("b1");
    expect(where.createdAt.gte).toBeInstanceOf(Date);
  });
});


/**
 * A revision keeps the client of the quote it came from.
 *
 * This is what actually closes the free-plan bypass, and the first attempt at F16
 * missed it entirely. `revise` and `createVariation` are ungated on purpose — the
 * job they descend from already consumed an allowance, and charging a contractor to
 * correct their own quote is wrong. But a revision is a fully-priced DRAFT, and
 * `update` let its `clientId` be changed:
 *
 *   POST /quotes/:id/revise   -> a priced DRAFT, no allowance consumed
 *   PATCH /quotes/:newId      -> point it at a different client
 *   PATCH .../status -> SENT, then share
 *
 * Two requests, repeatable without limit, from one seed quote. A tenant at the cap
 * had an unlimited supply of sendable quotes for new clients. The previous commit
 * described that as "a nudge toward Pro, not DRM" — reframing a revenue hole as a
 * design stance, and PLANNING §4e is explicit that the free tier IS the trial.
 *
 * Quoting a different client is a different job, and a different job is a new quote.
 */
describe("a descendant quote cannot be retargeted at another client", () => {
  function editHarness(existing: Record<string, unknown>) {
    const prisma = {
      // The allowance gate runs before revise now; a pro plan short-circuits it.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
      $transaction: vi.fn(async (cb: (t: unknown) => unknown) =>
        cb({
          quoteLineItem: { deleteMany: vi.fn(), create: vi.fn() },
          quoteSection: { deleteMany: vi.fn(), create: vi.fn() },
          quote: { update: vi.fn().mockResolvedValue({}) },
        }),
      ),
      quote: { findFirst: vi.fn().mockResolvedValue(existing) },
      client: { findFirst: vi.fn().mockResolvedValue({ id: "cl-2", businessId: "b1" }) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new QuotesService(prisma as any, {} as any, {} as any);
    return { svc, prisma };
  }

  const draft = {
    id: "q2",
    businessId: "b1",
    status: "DRAFT",
    clientId: "cl-1",
    projectId: null,
    parentQuoteId: null,
    variationOfQuoteId: null,
    version: 1,
    gctRate: 15,
    discountPct: 0,
    depositCents: 0,
    detailLevel: "SUMMARY",
    lineItems: [],
    sections: [],
  };

  it("REFUSES a client change on a revision", async () => {
    const { svc } = editHarness({ ...draft, parentQuoteId: "q1" });
    await expect(svc.update("b1", "q2", { clientId: "cl-2" } as never)).rejects.toThrow(
      /keeps the client/,
    );
  });

  it("REFUSES a client change on a variation", async () => {
    const { svc } = editHarness({ ...draft, variationOfQuoteId: "q1" });
    await expect(svc.update("b1", "q2", { clientId: "cl-2" } as never)).rejects.toThrow(
      /keeps the client/,
    );
  });

  it("ALLOWS a client change on an original draft", async () => {
    // The ordinary case has to keep working: a contractor who picked the wrong
    // client on a quote they have not sent must be able to fix it.
    const { svc } = editHarness(draft);
    await expect(
      svc.update("b1", "q2", { clientId: "cl-2", discountPct: 0 } as never),
    ).resolves.toBeDefined();
  });

  it("ALLOWS editing a revision as long as the client is unchanged", async () => {
    // Correcting the sheet is the whole point of a revision, and it stays free.
    const { svc } = editHarness({ ...draft, parentQuoteId: "q1" });
    await expect(
      svc.update("b1", "q2", { clientId: "cl-1", discountPct: 5 } as never),
    ).resolves.toBeDefined();
  });
});


/**
 * The gate and the counter cannot drift apart.
 *
 * `assertCanCreateQuote` enforces the allowance; `BillingService` shows the
 * contractor "quotes used this month". They had different clauses — billing counted
 * every row, the gate counted originals — so the number on the Settings card was not
 * the number being enforced. A contractor could read "3 of 5" and be refused.
 */
describe("the allowance clause is shared", () => {
  it("the gate and the billing counter use the same where-clause", async () => {
    const { quoteAllowanceWhere } = await import("../common/quote-allowance.js");
    const where = quoteAllowanceWhere("b1");
    // Issuance, not stock: no deletedAt filter, or a deleted draft would give the
    // slot back and restore the create-email-delete loop.
    expect("deletedAt" in where).toBe(false);
    expect(where.parentQuoteId).toBeNull();
    expect(where.variationOfQuoteId).toBeNull();
    expect(where.businessId).toBe("b1");
  });

  it("the month boundary is Jamaica's, not the server's", async () => {
    const { quoteAllowanceWhere } = await import("../common/quote-allowance.js");
    // 1 January 02:00 UTC is still 31 December in Jamaica, so the allowance has NOT
    // reset yet. The old server-clock boundary gave a fresh five quotes five hours
    // early, every month.
    const where = quoteAllowanceWhere("b1", new Date("2026-01-01T02:00:00.000Z"));
    const gte = (where.createdAt as { gte: Date }).gte;
    expect(gte.toISOString()).toBe("2025-12-01T05:00:00.000Z");
  });
});

describe("a revision of a CLIENTLESS quote can still be given a client", () => {
  it("allows setting a client where there was none", async () => {
    // `create` permits a draft with no client, and `revise` has no status gate — so
    // the retarget guard refused the one legitimate case it should allow, with a
    // message about keeping a client that did not exist.
    const prisma = {
      // The allowance gate runs before revise now; a pro plan short-circuits it.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
      $transaction: vi.fn(async (cb: (t: unknown) => unknown) =>
        cb({
          quoteLineItem: { deleteMany: vi.fn(), create: vi.fn() },
          quoteSection: { deleteMany: vi.fn(), create: vi.fn() },
          quote: { update: vi.fn().mockResolvedValue({}) },
        }),
      ),
      quote: {
        findFirst: vi.fn().mockResolvedValue({
          id: "q2",
          businessId: "b1",
          status: "DRAFT",
          clientId: null,
          projectId: null,
          parentQuoteId: "q1",
          variationOfQuoteId: null,
          version: 2,
          gctRate: 15,
          discountPct: 0,
          depositCents: 0,
          detailLevel: "SUMMARY",
          lineItems: [],
          sections: [],
        }),
      },
      client: { findFirst: vi.fn().mockResolvedValue({ id: "cl-1", businessId: "b1" }) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = new QuotesService(prisma as any, {} as any, {} as any);
    await expect(svc.update("b1", "q2", { clientId: "cl-1" } as never)).resolves.toBeDefined();
  });
});


/**
 * `revise` and `createVariation` are gated, even though they do not COUNT.
 *
 * The allowance excludes descendants on purpose — the job was counted when the
 * original was made, and charging a contractor to correct their own quote is wrong.
 * But both paths mint a fully-priced, sendable DRAFT and neither consulted the gate,
 * so a tenant at the cap had an unlimited supply.
 *
 * The retarget guard in `update` was supposed to be enough. It was not: a CLIENTLESS
 * original produces a clientless descendant, and the exemption added so such a
 * revision could be given a client at all handed the loop straight back — one
 * clientless draft, revised repeatedly, retargeted each time. A review found that in
 * the commit that claimed to close it.
 */
describe("the allowance gate covers every path that mints a quote", () => {
  function harnessAtCap(status: string) {
    const prisma = {
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "free" }) },
      quote: {
        findFirst: vi.fn().mockResolvedValue({
          id: "q1",
          businessId: "b1",
          status,
          clientId: null,
          projectId: null,
          number: "Q-0001",
          version: 1,
          lineItems: [],
          sections: [],
        }),
        count: vi.fn().mockResolvedValue(5),
      },
    };
    const pricingService = { get: vi.fn().mockResolvedValue({ freeQuotesPerMonth: 5 }) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new QuotesService(prisma as any, {} as any, pricingService as any);
  }

  it("refuses `revise` at the cap", async () => {
    await expect(harnessAtCap("SENT").revise("b1", "q1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "FREE_LIMIT_REACHED" }),
    });
  });

  it("refuses `createVariation` at the cap", async () => {
    await expect(harnessAtCap("ACCEPTED").createVariation("b1", "q1")).rejects.toMatchObject({
      response: expect.objectContaining({ code: "FREE_LIMIT_REACHED" }),
    });
  });
});
