import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import {
  computeTotals,
  GctTreatment,
  InvoiceStatus,
  LineCategory,
  PriceSource,
  QuoteDetailLevel,
  QuoteStatus,
  RateUnit,
} from "@jamquote/core";
import { InvoicesService } from "./invoices.service.js";

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

/** Builds a fully-populated ACCEPTED quote (one top-level line, one
 * sectioned line) the way `prisma.quote.findFirst` would return it. */
function acceptedQuote(overrides: Partial<{ status: QuoteStatus }> = {}) {
  return {
    id: "q1",
    businessId: "b1",
    clientId: "cl1",
    status: overrides.status ?? QuoteStatus.ACCEPTED,
    detailLevel: QuoteDetailLevel.SUMMARY,
    gctRate: 15,
    discountPct: 0,
    depositCents: 0,
    terms: "Net 30",
    lineItems: [
      { ...line, id: "li1", sectionId: null, sort: 0, markupPct: null, supplierId: null, overrideNote: null, unitLabel: "bag", assemblyId: null, assemblyName: null, assemblyUnit: null, assemblyComponents: null },
    ],
    sections: [
      {
        id: "s1",
        title: "Foundation",
        sort: 0,
        lineItems: [
          { ...line, id: "li2", sectionId: "s1", sort: 0, quantity: 5, markupPct: null, supplierId: null, overrideNote: null, unitLabel: null, assemblyId: null, assemblyName: null, assemblyUnit: null, assemblyComponents: null },
        ],
      },
    ],
  };
}

/** Harness whose fake prisma actually captures create() calls so findOne's
 * read-back reflects what was written — mirrors quotes.service.test.ts. */
function harness(quote = acceptedQuote()) {
  const businessService = {
    reserveInvoiceNumber: vi.fn().mockResolvedValue("INV-0001"),
  };
  const createdLineItems: any[] = [];
  const createdSections: any[] = [];
  let createdInvoiceData: any;
  let seq = 0;
  const tx = {
    invoice: {
      create: vi.fn((args: any) => {
        createdInvoiceData = args.data;
        return Promise.resolve({ id: "inv1" });
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    invoiceSection: {
      create: vi.fn((args: any) => {
        const id = `sec-${++seq}`;
        createdSections.push({ ...args.data, id });
        return Promise.resolve({ id });
      }),
      deleteMany: vi.fn(),
    },
    invoiceLineItem: {
      create: vi.fn((args: any) => {
        createdLineItems.push(args.data);
        return Promise.resolve({});
      }),
      deleteMany: vi.fn(),
    },
    quote: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    quote: {
      findFirst: vi.fn().mockResolvedValue(quote),
    },
    invoice: {
      findFirst: vi.fn((args: any) => {
        // findOne's read-back after create/update
        if (args?.include) {
          return Promise.resolve({
            id: "inv1",
            ...createdInvoiceData,
            lineItems: createdLineItems.filter((li) => !li.sectionId),
            sections: createdSections.map((s) => ({
              ...s,
              lineItems: createdLineItems.filter((li) => li.sectionId === s.id),
            })),
          });
        }
        // "existing invoice for this quote?" check — none by default
        return Promise.resolve(null);
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const svc = new InvoicesService(prisma as any, businessService as any);
  return { svc, prisma, businessService, tx, createdInvoiceData: () => createdInvoiceData, createdLineItems };
}

describe("InvoicesService.convertFromQuote", () => {
  it("copies sections + line items from an ACCEPTED quote, computes totals, and starts DRAFT", async () => {
    const { svc, businessService, createdLineItems } = harness();

    const invoice = await svc.convertFromQuote("b1", "q1");

    expect(businessService.reserveInvoiceNumber).toHaveBeenCalledWith("b1");
    expect(invoice.status).toBe(InvoiceStatus.DRAFT);
    expect(invoice.number).toBe("INV-0001");
    expect(invoice.quoteId).toBe("q1");
    expect(invoice.clientId).toBe("cl1");
    expect(invoice.terms).toBe("Net 30");

    // Both lines copied: one top-level, one under the cloned section.
    expect(createdLineItems).toHaveLength(2);
    expect(invoice.lineItems).toHaveLength(1);
    expect(invoice.sections).toHaveLength(1);
    expect(invoice.sections[0]?.lineItems).toHaveLength(1);
    expect(invoice.sections[0]?.title).toBe("Foundation");

    const expected = computeTotals({
      lines: [
        { quantity: 10, unitPriceCents: 120_000, gctTreatment: GctTreatment.STANDARD },
        { quantity: 5, unitPriceCents: 120_000, gctTreatment: GctTreatment.STANDARD },
      ],
      gctRatePct: 15,
      discountPct: 0,
      depositCents: 0,
    });
    expect(invoice.subtotalCents).toBe(expected.subtotalCents);
    expect(invoice.gctCents).toBe(expected.gctCents);
    expect(invoice.totalCents).toBe(expected.totalCents);
  });

  it("carries each line's sold-by unit onto the invoice", async () => {
    // The invoice is a customer-facing document too: a line quoted in bags
    // must not silently become "unit" when the quote is converted. unitLabel
    // is a snapshot, so it is copied rather than re-resolved from the
    // material, which may have been renamed or deleted since.
    const { svc, createdLineItems } = harness();
    await svc.convertFromQuote("b1", "q1");

    expect(createdLineItems.map((li) => li.unitLabel)).toEqual(["bag", undefined]);
  });

  it("rejects conversion when the quote is not ACCEPTED", async () => {
    const { svc, businessService, prisma } = harness(acceptedQuote({ status: QuoteStatus.SENT }));

    await expect(svc.convertFromQuote("b1", "q1")).rejects.toBeInstanceOf(BadRequestException);
    expect(businessService.reserveInvoiceNumber).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects a second conversion of the same quote", async () => {
    const { svc, prisma, businessService } = harness();
    prisma.invoice.findFirst = vi.fn().mockResolvedValue({ id: "inv-existing", number: "INV-0000" });

    await expect(svc.convertFromQuote("b1", "q1")).rejects.toBeInstanceOf(BadRequestException);
    await svc.convertFromQuote("b1", "q1").catch((err: BadRequestException) => {
      expect(err.message).toContain("INV-0000");
    });
    expect(businessService.reserveInvoiceNumber).not.toHaveBeenCalled();
  });
});

/** Harness for an already-DRAFT (or otherwise-statused) invoice, for
 * update/finalize/remove tests that don't go through convertFromQuote. */
function existingInvoiceHarness(invoice: any) {
  const tx = {
    invoice: { update: vi.fn().mockResolvedValue({}) },
    invoiceSection: { create: vi.fn().mockResolvedValue({ id: "sec-1" }), deleteMany: vi.fn() },
    invoiceLineItem: { create: vi.fn().mockResolvedValue({}), deleteMany: vi.fn() },
    quote: { update: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    invoice: {
      findFirst: vi.fn().mockResolvedValue(invoice),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const businessService = { reserveInvoiceNumber: vi.fn() };
  const svc = new InvoicesService(prisma as any, businessService as any);
  return { svc, prisma, tx };
}

function draftInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv1",
    businessId: "b1",
    clientId: "cl1",
    quoteId: "q1",
    status: InvoiceStatus.DRAFT,
    detailLevel: QuoteDetailLevel.SUMMARY,
    gctRate: 15,
    discountPct: 0,
    depositCents: 0,
    terms: "Net 30",
    dueDate: null,
    subtotalCents: 1_200_000,
    gctCents: 180_000,
    totalCents: 1_380_000,
    lineItems: [
      { ...line, id: "li1", sectionId: null, markupPct: null },
    ],
    sections: [],
    ...overrides,
  };
}

describe("InvoicesService.update", () => {
  it("succeeds while DRAFT and recomputes totals", async () => {
    const { svc, tx } = existingInvoiceHarness(draftInvoice());

    await svc.update("b1", "inv1", { discountPct: 10 });

    const expected = computeTotals({
      lines: [{ quantity: 10, unitPriceCents: 120_000, gctTreatment: GctTreatment.STANDARD }],
      gctRatePct: 15,
      discountPct: 10,
      depositCents: 0,
    });
    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: expect.objectContaining({
        discountPct: 10,
        subtotalCents: expected.subtotalCents,
        gctCents: expected.gctCents,
        totalCents: expected.totalCents,
      }),
    });
  });

  it("rejects editing when status is INVOICED", async () => {
    const { svc, tx } = existingInvoiceHarness(draftInvoice({ status: InvoiceStatus.INVOICED }));

    await expect(svc.update("b1", "inv1", { discountPct: 10 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });
});

describe("InvoicesService.finalize", () => {
  it("flips the invoice to INVOICED and the linked quote to INVOICED", async () => {
    const { svc, tx } = existingInvoiceHarness(draftInvoice());

    await svc.finalize("b1", "inv1");

    expect(tx.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv1" },
        data: expect.objectContaining({ status: InvoiceStatus.INVOICED }),
      }),
    );
    expect(tx.quote.update).toHaveBeenCalledWith({
      where: { id: "q1" },
      data: { status: QuoteStatus.INVOICED },
    });
  });

  it("does not touch a quote when the invoice has no quoteId", async () => {
    const { svc, tx } = existingInvoiceHarness(draftInvoice({ quoteId: null }));

    await svc.finalize("b1", "inv1");

    expect(tx.quote.update).not.toHaveBeenCalled();
  });

  it("rejects finalizing when not DRAFT", async () => {
    const { svc, tx } = existingInvoiceHarness(draftInvoice({ status: InvoiceStatus.PAID }));

    await expect(svc.finalize("b1", "inv1")).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });
});

describe("InvoicesService.remove", () => {
  it("rejects deleting when not DRAFT", async () => {
    const { svc, prisma } = existingInvoiceHarness(draftInvoice({ status: InvoiceStatus.INVOICED }));

    await expect(svc.remove("b1", "inv1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.invoice.update).not.toHaveBeenCalled();
  });

  it("soft-deletes a DRAFT invoice", async () => {
    const { svc, prisma } = existingInvoiceHarness(draftInvoice());

    await svc.remove("b1", "inv1");

    expect(prisma.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: { deletedAt: expect.any(Date) },
    });
  });
});

describe("InvoicesService tenant scoping", () => {
  it("does not find another business's invoice", async () => {
    const prisma = {
      invoice: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const svc = new InvoicesService(prisma as any, {} as any);

    await expect(svc.findOne("other-biz", "inv1")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inv1", businessId: "other-biz", deletedAt: null } }),
    );
  });
});
