import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
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
    };

    const svc = new QuotesService(prisma as any, businessService as any);
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

describe("QuotesService.updateStatus", () => {
  function serviceForQuote(status: QuoteStatus) {
    const quote = { id: "q1", status, lineItems: [], sections: [] };
    const prisma = {
      quote: {
        findFirst: vi.fn().mockResolvedValue(quote),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    return { svc: new QuotesService(prisma as any, {} as any), prisma };
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
    return { svc: new QuotesService(prisma as any, {} as any), prisma };
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
