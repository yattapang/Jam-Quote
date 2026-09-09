import { describe, expect, it } from "vitest";
import { Prisma, type Quote, type QuoteLineItem, type QuoteSection } from "@prisma/client";
import { quoteDetailWire, quoteWire } from "@jamquote/core";

/**
 * Seam 1 in `CONTRACTS.md`, for the quote — the largest shape the web reads, and
 * the last of the flat-plus-nested set.
 *
 * Same double coupling: TypeScript checks the samples against Prisma's generated
 * types, Zod checks them against what the web is typed to read.
 *
 * Two things this file is really about.
 *
 * **The list and the detail read send different shapes.** `GET /quotes` runs a
 * `findMany` with no include; `GET /quotes/:id` includes sections and lines. Both
 * must parse, and `quoteDetailWire` exists so a caller that needs the lines can
 * say so in a type rather than checking at runtime.
 *
 * **`markupPct` belongs here and nowhere public.** This is the contractor's own
 * read, so their margin is theirs to see. `publicQuoteWire` is `.strict()` and
 * rejects it — the two contracts disagreeing on purpose is the whole point, and
 * the test at the bottom asserts that difference rather than trusting it.
 */

const line: QuoteLineItem = {
  id: "li_1",
  quoteId: "q_1",
  sectionId: null,
  category: "MATERIAL",
  description: "Carib Cement, 42.5kg",
  quantity: new Prisma.Decimal("10"),
  rateUnit: "UNIT",
  unitLabel: "bag",
  unitPriceCents: 120_000,
  priceSource: "MANUAL",
  supplierId: null,
  gctTreatment: "STANDARD",
  markupPct: null,
  overrideNote: null,
  jobId: null,
  jobName: null,
  jobUnit: null,
  jobComponents: null,
  sort: 0,
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  deletedAt: null,
};

const section: QuoteSection & { lineItems: QuoteLineItem[] } = {
  id: "s_1",
  quoteId: "q_1",
  title: "Foundation",
  sort: 0,
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  deletedAt: null,
  lineItems: [{ ...line, id: "li_2", sectionId: "s_1" }],
};

const listRow: Quote = {
  id: "q_1",
  businessId: "biz_1",
  clientId: "cl_1",
  projectId: null,
  parentQuoteId: null,
  variationOfQuoteId: null,
  number: "QT-0143",
  // Part of the (businessId, number, version) uniqueness that makes a REVISION
  // reuse its number. The web does not read it, so it is deliberately absent
  // from the contract - the contract is a floor, not a mirror.
  version: 1,
  status: "SENT",
  detailLevel: "SUMMARY",
  gctRate: new Prisma.Decimal("15.00"),
  discountPct: new Prisma.Decimal("0"),
  depositCents: 0,
  subtotalCents: 1_200_000,
  gctCents: 180_000,
  totalCents: 1_380_000,
  validUntil: new Date("2026-09-22T00:00:00.000Z"),
  terms: "Net 30",
  shareToken: null,
  sharedAt: null,
  firstViewedAt: null,
  decidedAt: null,
  decidedByName: null,
  declineReason: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  deletedAt: null,
};

function overTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("the quote wire contract — the two shapes", () => {
  it("accepts a LIST row, which carries no nested items", () => {
    const parsed = quoteWire.parse(overTheWire(listRow));
    expect(parsed.lineItems).toBeUndefined();
    expect(parsed.sections).toBeUndefined();
  });

  it("accepts a DETAIL row, with sections and lines", () => {
    const detail = { ...listRow, lineItems: [line], sections: [section] };
    expect(() => quoteDetailWire.parse(overTheWire(detail))).not.toThrow();
  });

  it("REFUSES a list row where the detail shape is required", () => {
    // The point of the second export: a caller that needs the lines gets a type
    // error rather than an undefined at runtime.
    expect(() => quoteDetailWire.parse(overTheWire(listRow))).toThrow(/lineItems/);
  });
});

describe("the quote wire contract — money and rates", () => {
  const detail = { ...listRow, lineItems: [line], sections: [section] };

  it("sends cents as integers and rates as strings", () => {
    const parsed = quoteDetailWire.parse(overTheWire(detail));
    expect(typeof parsed.totalCents).toBe("number");
    // "15", not "15.00" - serialization drops trailing zeros.
    expect(parsed.gctRate).toBe("15");
    expect(parsed.lineItems[0]!.quantity).toBe("10");
  });

  it("REJECTS a total that arrives as a string", () => {
    const wire = overTheWire(detail);
    expect(() => quoteDetailWire.parse({ ...wire, totalCents: "1380000" })).toThrow(/totalCents/);
  });

  it("REJECTS fractional cents", () => {
    // Half a cent means a caller has divided somewhere.
    const wire = overTheWire(detail);
    expect(() => quoteDetailWire.parse({ ...wire, gctCents: 180_000.5 })).toThrow(/gctCents/);
  });
});

describe("the quote wire contract — the client's own decision", () => {
  it("is null until the client answers", () => {
    const parsed = quoteWire.parse(overTheWire(listRow));
    expect(parsed.decidedByName).toBeNull();
  });

  it("carries who answered and when, once they have", () => {
    const decided: Quote = {
      ...listRow,
      status: "ACCEPTED",
      decidedAt: new Date("2026-09-05T10:00:00.000Z"),
      decidedByName: "Marcia Brown",
    };
    const parsed = quoteWire.parse(overTheWire(decided));
    expect(parsed.decidedByName).toBe("Marcia Brown");
    expect(parsed.decidedAt).toBe("2026-09-05T10:00:00.000Z");
  });

  it("keeps a decline reason where one was given", () => {
    const declined: Quote = {
      ...listRow,
      status: "DECLINED",
      decidedByName: "Marcia Brown",
      declineReason: "Too expensive right now",
    };
    expect(quoteWire.parse(overTheWire(declined)).declineReason).toBe("Too expensive right now");
  });
});

describe("the quote wire contract — job components", () => {
  it("accepts a snapshot whose numbers came over as strings", () => {
    const withJob: QuoteLineItem = {
      ...line,
      jobId: "j_1",
      jobName: "Blockwork per m²",
      jobUnit: "m²",
      jobComponents: [
        { kind: "MATERIAL", description: "Block", quantityPerUnit: "12.5", unitPriceCents: 9000 },
      ] as unknown as Prisma.JsonValue,
    };
    const detail = { ...listRow, lineItems: [withJob], sections: [] };
    expect(() => quoteDetailWire.parse(overTheWire(detail))).not.toThrow();
  });

  it("accepts one whose numbers came over as numbers", () => {
    // A JSON snapshot carries whatever the writer put there. This is the one
    // place in wire/ where a union is honest rather than lazy.
    const withJob: QuoteLineItem = {
      ...line,
      jobComponents: [
        { kind: "MATERIAL", description: "Block", quantityPerUnit: 12.5, unitPriceCents: 9000 },
      ] as unknown as Prisma.JsonValue,
    };
    const detail = { ...listRow, lineItems: [withJob], sections: [] };
    expect(() => quoteDetailWire.parse(overTheWire(detail))).not.toThrow();
  });
});

describe("the tenant and public contracts disagree, deliberately", () => {
  it("the tenant contract carries markupPct", () => {
    // The contractor's own margin, on their own read. The public contract is
    // .strict() and rejects it - that asymmetry is the disclosure boundary, so
    // it is asserted rather than assumed.
    const withMarkup: QuoteLineItem = { ...line, markupPct: new Prisma.Decimal("30.00") };
    const detail = { ...listRow, lineItems: [withMarkup], sections: [] };
    const parsed = quoteDetailWire.parse(overTheWire(detail));
    expect(parsed.lineItems[0]!.markupPct).toBe("30");
  });
});
