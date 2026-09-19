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
      { ...line, id: "li1", sectionId: null, sort: 0, markupPct: null, supplierId: null, overrideNote: null, unitLabel: "bag", jobId: null, jobName: null, jobUnit: null, jobComponents: null },
    ],
    sections: [
      {
        id: "s1",
        title: "Foundation",
        sort: 0,
        lineItems: [
          { ...line, id: "li2", sectionId: "s1", sort: 0, quantity: 5, markupPct: null, supplierId: null, overrideNote: null, unitLabel: null, jobId: null, jobName: null, jobUnit: null, jobComponents: null },
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
    // create() reads the business's own GCT rate rather than hardcoding one.
    findById: vi.fn().mockResolvedValue({ id: "b1", defaultGctRate: 15, gctRegistered: true }),
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
    supplier: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const prisma = {
    // A client the caller owns. create/update now prove a caller-supplied
    // clientId belongs to this business before writing it — an id in the body
    // is not a capability. See common/assert-owned.ts.
    client: {
      findFirst: vi.fn(({ where }: { where: { id?: string; businessId?: string } }) =>
        // Honours `where`. A fake resolving regardless would also pass for a
        // service that transposed the arguments — both are strings, so TypeScript
        // cannot object. Echoes the id back so it works whatever the test names it.
        Promise.resolve(
          where.businessId === "b1" && where.id ? { id: where.id, businessId: where.businessId } : null,
        ),
      ),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    quote: {
      findFirst: vi.fn().mockResolvedValue(quote),
    },
    supplier: { findMany: vi.fn().mockResolvedValue([]) },
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

/**
 * Owner decision "a": an unregistered business must not silently charge GCT
 * on a document it creates with no explicit rate. See REVIEW-FINDINGS.md,
 * "GCT is CHARGED regardless of registration".
 */
describe("InvoicesService.create — GCT default depends on gctRegistered", () => {
  it("defaults an unregistered business to 0% when no rate is supplied", async () => {
    const { svc, businessService, createdInvoiceData } = harness();
    businessService.findById.mockResolvedValue({ id: "b1", defaultGctRate: 15, gctRegistered: false });

    await svc.create("b1", { discountPct: 0, depositCents: 0, sections: [], lineItems: [line] });
    expect(createdInvoiceData().gctRate).toBe(0);
  });

  it("defaults a registered business to its own default rate when no rate is supplied", async () => {
    const { svc, businessService, createdInvoiceData } = harness();
    businessService.findById.mockResolvedValue({ id: "b1", defaultGctRate: 15, gctRegistered: true });

    await svc.create("b1", { discountPct: 0, depositCents: 0, sections: [], lineItems: [line] });
    expect(createdInvoiceData().gctRate).toBe(15);
  });

  it("honours an explicit rate for an unregistered business", async () => {
    const { svc, businessService, createdInvoiceData } = harness();
    businessService.findById.mockResolvedValue({ id: "b1", defaultGctRate: 15, gctRegistered: false });

    await svc.create("b1", { gctRatePct: 10, discountPct: 0, depositCents: 0, sections: [], lineItems: [line] });
    expect(createdInvoiceData().gctRate).toBe(10);
  });

  it("honours an explicit rate for a registered business", async () => {
    const { svc, businessService, createdInvoiceData } = harness();
    businessService.findById.mockResolvedValue({ id: "b1", defaultGctRate: 15, gctRegistered: true });

    await svc.create("b1", { gctRatePct: 0, discountPct: 0, depositCents: 0, sections: [], lineItems: [line] });
    expect(createdInvoiceData().gctRate).toBe(0);
  });
});

describe("InvoicesService.create — an invoice with no source quote", () => {
  it("starts DRAFT, reserves a number, and leaves quoteId unset", async () => {
    const { svc, businessService, createdInvoiceData } = harness();

    await svc.create("b1", {
      clientId: "cl1",
      discountPct: 0,
      depositCents: 0,
      sections: [],
      lineItems: [{ ...line, sort: 0 }],
    });

    expect(businessService.reserveInvoiceNumber).toHaveBeenCalledWith("b1");
    const data = createdInvoiceData();
    expect(data.status).toBe(InvoiceStatus.DRAFT);
    expect(data.number).toBe("INV-0001");
    // quoteId records that this invoice CAME FROM a quote, and finalize() uses
    // it to flip that quote to INVOICED. A hand-built invoice has none, and
    // faking the link would flip an unrelated quote.
    expect(data.quoteId).toBeUndefined();
  });

  it("falls back to the business's own GCT rate rather than a hardcoded 15", async () => {
    // The rate is jurisdiction-derived via the rule-pack; hardcoding it here
    // would silently diverge from every other document the tenant produces.
    const { svc, createdInvoiceData } = harness();
    await svc.create("b1", { discountPct: 0, depositCents: 0, sections: [], lineItems: [] });
    expect(createdInvoiceData().gctRate).toBe(15);
  });

  it("honours an explicit GCT rate when one is supplied", async () => {
    const { svc, createdInvoiceData } = harness();
    await svc.create("b1", {
      gctRatePct: 0,
      discountPct: 0,
      depositCents: 0,
      sections: [],
      lineItems: [],
    });
    expect(createdInvoiceData().gctRate).toBe(0);
  });

  it("computes totals across both loose lines and section lines", async () => {
    const { svc, createdInvoiceData } = harness();
    await svc.create("b1", {
      discountPct: 0,
      depositCents: 0,
      lineItems: [{ ...line, sort: 0 }],
      sections: [{ title: "Foundation", sort: 0, lineItems: [{ ...line, quantity: 5, sort: 0 }] }],
    });

    const expected = computeTotals({
      lines: [
        { quantity: 10, unitPriceCents: 120_000, gctTreatment: GctTreatment.STANDARD },
        { quantity: 5, unitPriceCents: 120_000, gctTreatment: GctTreatment.STANDARD },
      ],
      gctRatePct: 15,
      discountPct: 0,
      depositCents: 0,
    });
    const data = createdInvoiceData();
    expect(data.subtotalCents).toBe(expected.subtotalCents);
    expect(data.totalCents).toBe(expected.totalCents);
  });
});

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

  it("keeps the quote's own GCT rate even when the business's current default differs", async () => {
    // A client may already have seen the quote at its own rate. Converting
    // must copy that rate verbatim, never re-derive it from the business's
    // CURRENT default/registration status (which may have changed since).
    const { svc, businessService } = harness(acceptedQuote({ status: QuoteStatus.ACCEPTED }));
    businessService.findById.mockResolvedValue({ id: "b1", defaultGctRate: 0, gctRegistered: false });

    const invoice = await svc.convertFromQuote("b1", "q1");
    expect(invoice.gctRate).toBe(15); // the quote's own rate from acceptedQuote()
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

  // S-review fix: a supplierId copied forward from the quote is no longer
  // trusted just because the quote belongs to this business — it is
  // validated the same grandfathered-but-checked way a normal update would,
  // so a legacy foreign id on the source quote cannot propagate onto the
  // new invoice silently.
  it("refuses to convert a quote whose line carries a legacy foreign supplierId", async () => {
    const quote: any = acceptedQuote();
    quote.lineItems[0].supplierId = "legacy-foreign-supplier";
    const { svc, tx } = harness(quote);
    tx.supplier.findMany.mockResolvedValue([]); // does not belong to b1
    await expect(svc.convertFromQuote("b1", "q1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("copies a supplierId forward once it is confirmed to belong to this business", async () => {
    const quote: any = acceptedQuote();
    quote.lineItems[0].supplierId = "sup-1";
    const { svc, tx, createdLineItems } = harness(quote);
    tx.supplier.findMany.mockResolvedValue([{ id: "sup-1" }]);
    await svc.convertFromQuote("b1", "q1");
    expect(createdLineItems.map((li: any) => li.supplierId)).toContain("sup-1");
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
    // A client the caller owns. create/update now prove a caller-supplied
    // clientId belongs to this business before writing it — an id in the body
    // is not a capability. See common/assert-owned.ts.
    client: {
      findFirst: vi.fn(({ where }: { where: { id?: string; businessId?: string } }) =>
        // Honours `where`. A fake resolving regardless would also pass for a
        // service that transposed the arguments — both are strings, so TypeScript
        // cannot object. Echoes the id back so it works whatever the test names it.
        Promise.resolve(
          where.businessId === "b1" && where.id ? { id: where.id, businessId: where.businessId } : null,
        ),
      ),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    supplier: { findMany: vi.fn().mockResolvedValue([]) },
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

  it("never changes the GCT rate on update, even when none is supplied and the business default has since changed", async () => {
    // A client may already have seen this invoice. update() must preserve
    // its stored rate rather than re-deriving one from the business.
    const { svc, tx } = existingInvoiceHarness(draftInvoice({ gctRate: 15 }));

    await svc.update("b1", "inv1", { discountPct: 10 });

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: expect.objectContaining({ gctRate: 15 }),
    });
  });

  it("reassigns the invoice to a different client", async () => {
    const { svc, tx } = existingInvoiceHarness(draftInvoice());

    await svc.update("b1", "inv1", { clientId: "cl2" });

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: expect.objectContaining({ clientId: "cl2" }),
    });
  });

  // The next two pin the null-vs-undefined distinction. Invoice.clientId is
  // nullable, so an explicit null is a real instruction ("detach this client")
  // and must not be confused with the key simply being absent. The obvious
  // `input.clientId ?? existing.clientId` collapses the two and silently keeps
  // the old client on an invoice the user just cleared.
  it("detaches the client when clientId is explicitly null", async () => {
    const { svc, tx } = existingInvoiceHarness(draftInvoice());

    await svc.update("b1", "inv1", { clientId: null });

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: expect.objectContaining({ clientId: null }),
    });
  });

  it("leaves the client alone when clientId is absent", async () => {
    const { svc, tx } = existingInvoiceHarness(draftInvoice());

    await svc.update("b1", "inv1", { discountPct: 10 });

    expect(tx.invoice.update).toHaveBeenCalledWith({
      where: { id: "inv1" },
      data: expect.objectContaining({ clientId: "cl1" }),
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

/**
 * S7: a caller-supplied `supplierId` on an invoice line item was written
 * with no ownership check at all — unlike `clientId` beside it. See
 * REVIEW-FINDINGS.md. `convertFromQuote` now ALSO validates the supplierId
 * it copies forward from the quote (see the tests in the
 * `InvoicesService.convertFromQuote` block above) — a legacy foreign id on
 * the source quote is not "safe" just because the quote is owned; it must
 * not propagate onto the new invoice unchecked.
 */
describe("InvoicesService — supplierId on line items is not a capability (S7)", () => {
  it("refuses a supplier belonging to another business on create", async () => {
    const { svc, prisma } = harness();
    prisma.supplier.findMany.mockResolvedValue([]);
    await expect(
      svc.create("b1", {
        clientId: "cl1",
        discountPct: 0,
        depositCents: 0,
        sections: [],
        lineItems: [{ ...line, sort: 0, supplierId: "someone-elses-supplier" }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a made-up supplier id on create, with the identical 404", async () => {
    const { svc, prisma } = harness();
    prisma.supplier.findMany.mockResolvedValue([]);
    await expect(
      svc.create("b1", {
        clientId: "cl1",
        discountPct: 0,
        depositCents: 0,
        sections: [],
        lineItems: [{ ...line, sort: 0, supplierId: "not-a-real-id" }],
      } as any),
    ).rejects.toThrow("Supplier not found");
  });

  it("refuses a soft-deleted supplier on create", async () => {
    // supplier.findMany already excludes deletedAt, so a soft-deleted row
    // also resolves to "not returned" — same shape as foreign/made-up.
    const { svc, prisma } = harness();
    prisma.supplier.findMany.mockResolvedValue([]);
    await expect(
      svc.create("b1", {
        clientId: "cl1",
        discountPct: 0,
        depositCents: 0,
        sections: [],
        lineItems: [{ ...line, sort: 0, supplierId: "soft-deleted-supplier" }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("allows a live supplier of this business on create, checked in one batched query", async () => {
    const { svc, prisma, tx } = harness();
    prisma.supplier.findMany.mockResolvedValue([{ id: "sup-1" }]);
    await svc.create("b1", {
      clientId: "cl1",
      discountPct: 0,
      depositCents: 0,
      sections: [],
      lineItems: [{ ...line, sort: 0, supplierId: "sup-1" }],
    } as any);
    expect(tx.invoice.create).toHaveBeenCalled();
    expect(prisma.supplier.findMany).toHaveBeenCalledTimes(1);
  });

  it("keeps an UNCHANGED supplierId on update even if it has since been soft-deleted, but still checks it belongs to this business", async () => {
    // Old invoices must stay editable past a soft-delete — but (S-review fix)
    // an id already on the invoice is no longer exempt from the ownership
    // query entirely. No `deletedAt` filter, which is what lets the
    // soft-deleted case through.
    const { svc, prisma } = existingInvoiceHarness(
      draftInvoice({
        lineItems: [{ ...line, id: "li1", sectionId: null, markupPct: null, supplierId: "sup-old" }],
      }),
    );
    prisma.supplier.findMany.mockResolvedValue([{ id: "sup-old" }]); // still belongs to b1
    await svc.update("b1", "inv1", {
      lineItems: [{ ...line, supplierId: "sup-old" }],
    } as any);
    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      // `businessId in [b1, null]`: an OWNERLESS legacy row is unreachable platform
      // data that must not brick an invoice already referencing it; another tenant's
      // id is still refused (next test).
      expect.objectContaining({
        where: { id: { in: ["sup-old"] }, OR: [{ businessId: "b1" }, { businessId: null }] },
      }),
    );
  });

  it("refuses a legacy foreign supplierId already on the invoice, unchanged", async () => {
    const { svc, prisma } = existingInvoiceHarness(
      draftInvoice({
        lineItems: [{ ...line, id: "li1", sectionId: null, markupPct: null, supplierId: "sup-old" }],
      }),
    );
    prisma.supplier.findMany.mockResolvedValue([]); // does not belong to b1
    await expect(
      svc.update("b1", "inv1", {
        lineItems: [{ ...line, supplierId: "sup-old" }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("still checks a NEWLY introduced supplierId on update", async () => {
    const { svc, prisma } = existingInvoiceHarness(
      draftInvoice({
        lineItems: [{ ...line, id: "li1", sectionId: null, markupPct: null, supplierId: "sup-old" }],
      }),
    );
    prisma.supplier.findMany.mockResolvedValue([]); // foreign
    await expect(
      svc.update("b1", "inv1", {
        lineItems: [{ ...line, supplierId: "sup-new-foreign" }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ["sup-new-foreign"] } }) }),
    );
  });

  it("allows a newly introduced supplierId on update once confirmed live", async () => {
    const { svc, prisma } = existingInvoiceHarness(
      draftInvoice({
        lineItems: [{ ...line, id: "li1", sectionId: null, markupPct: null, supplierId: "sup-old" }],
      }),
    );
    prisma.supplier.findMany.mockResolvedValue([{ id: "sup-new-live" }]);
    await expect(
      svc.update("b1", "inv1", {
        lineItems: [{ ...line, supplierId: "sup-new-live" }],
      } as any),
    ).resolves.toBeDefined();
  });

  it("does not check supplierId at all when the caller isn't replacing lines", async () => {
    const { svc, prisma } = existingInvoiceHarness(draftInvoice());
    await svc.update("b1", "inv1", { discountPct: 10 });
    expect(prisma.supplier.findMany).not.toHaveBeenCalled();
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
