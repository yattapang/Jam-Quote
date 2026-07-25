import { describe, expect, it, vi } from "vitest";
import { BadRequestException, HttpException } from "@nestjs/common";
import {
  computeTotals,
  GctTreatment,
  LineCategory,
  PriceSource,
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
      $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
      quote: {
        findFirst: vi.fn().mockResolvedValue({ id: "q1", lineItems: [], sections: [] }),
      },
      // "pro" so the free-tier gate returns early without needing
      // pricingService/quote.count mocks for this unrelated test.
      subscription: { findUnique: vi.fn().mockResolvedValue({ plan: "pro" }) },
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
      quote: {
        findFirst: vi.fn().mockResolvedValue(quote),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    return { svc: new QuotesService(prisma as any, {} as any, {} as any), prisma };
  }

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
      jobId: "job1",
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
      quote: {
        findFirst: vi.fn().mockResolvedValue({ id: "q1", status, lineItems: [], sections: [] }),
        delete: vi.fn(),
      },
      quoteLineItem: { deleteMany: vi.fn() },
      quoteSection: { deleteMany: vi.fn() },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    return { svc: new QuotesService(prisma as any, {} as any, {} as any), prisma };
  }

  it("deletes a DRAFT quote", async () => {
    const { svc, prisma } = serviceForQuote(QuoteStatus.DRAFT);
    await svc.remove("b1", "q1");
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("refuses to delete a non-DRAFT quote", async () => {
    const { svc, prisma } = serviceForQuote(QuoteStatus.SENT);
    await expect(svc.remove("b1", "q1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
