import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { publicQuoteWire } from "@jamquote/core";
import type { PublicQuoteView } from "./quotes.service.js";

/**
 * The public quote view keeps its promise, and promises nothing more.
 *
 * Same double coupling as the other wire tests — TypeScript checks the sample
 * against `PublicQuoteView`, the service's real return type; Zod checks it
 * against the contract — but with one difference that matters:
 *
 * **the contract is `.strict()`.** Everywhere else in `wire/` a schema is a
 * FLOOR and extra fields are tolerated, because the browser cannot be broken by
 * data it never reads. Here an extra field is a DISCLOSURE, so the parse fails.
 *
 * That is the guard against how this boundary widened the first time: the view
 * reused the tenant's Prisma include, and every line arrived carrying
 * `markupPct` — the contractor's margin. A spread inherits decisions nobody
 * re-made, and a floor would have accepted it silently.
 */

const line = {
  id: "li_1",
  category: "MATERIAL",
  description: "Cement, 42.5kg",
  quantity: new Prisma.Decimal("10"),
  rateUnit: "UNIT",
  unitLabel: "bag",
  unitPriceCents: 120_000,
  gctTreatment: "STANDARD",
} as const;

const sample: PublicQuoteView = {
  number: "QT-0143",
  status: "SENT",
  validUntil: new Date("2026-09-22T00:00:00.000Z"),
  terms: "Net 30",
  detailLevel: "SUMMARY",
  gctRate: new Prisma.Decimal("15.00"),
  discountPct: new Prisma.Decimal("0"),
  depositCents: 0,
  subtotalCents: 1_200_000,
  gctCents: 180_000,
  totalCents: 1_380_000,
  lineItems: [line],
  sections: [{ id: "s_1", title: "Foundation", lineItems: [line] }],
  clientName: "Marcia Brown",
  business: {
    name: "Blackwood Construction",
    addressLine: "12 Hope Road",
    town: "Kingston",
    parish: "Kingston",
    trn: "102458963",
  },
};

/** What the client's browser actually receives. */
function overTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("the public quote wire contract", () => {
  it("is satisfied by what the service returns", () => {
    expect(() => publicQuoteWire.parse(overTheWire(sample))).not.toThrow();
  });

  it("REJECTS an extra top-level field, because that would be a disclosure", () => {
    // The difference from every other schema in wire/. A floor would shrug.
    const widened = { ...overTheWire(sample), internalNote: "chase the deposit" };
    expect(() => publicQuoteWire.parse(widened)).toThrow();
  });

  it("REJECTS markupPct on a line — the field that started this", () => {
    const wire = overTheWire(sample) as { lineItems: Record<string, unknown>[] };
    wire.lineItems[0]!.markupPct = "30";
    expect(() => publicQuoteWire.parse(wire)).toThrow();
  });

  it("REJECTS supplierId on a line", () => {
    const wire = overTheWire(sample) as { lineItems: Record<string, unknown>[] };
    wire.lineItems[0]!.supplierId = "sup_1";
    expect(() => publicQuoteWire.parse(wire)).toThrow();
  });

  it("REJECTS an extra field on a nested SECTION's lines too", () => {
    // The sections are where the original spread did its damage, so the nested
    // strictness is checked rather than assumed.
    const wire = overTheWire(sample) as {
      sections: { lineItems: Record<string, unknown>[] }[];
    };
    wire.sections[0]!.lineItems[0]!.overrideNote = "matched a competitor";
    expect(() => publicQuoteWire.parse(wire)).toThrow();
  });

  it("sends money as integer cents and rates as strings", () => {
    const parsed = publicQuoteWire.parse(overTheWire(sample));
    expect(typeof parsed.totalCents).toBe("number");
    // A serialized Decimal: "15", with the trailing zeros dropped.
    expect(parsed.gctRate).toBe("15");
    expect(parsed.lineItems[0]!.quantity).toBe("10");
  });

  it("allows a quote with no client and no expiry", () => {
    const bare: PublicQuoteView = { ...sample, clientName: null, validUntil: null, terms: null };
    expect(() => publicQuoteWire.parse(overTheWire(bare))).not.toThrow();
  });

  it("REJECTS a response missing a promised field", () => {
    const { totalCents: _dropped, ...without } = overTheWire(sample);
    expect(() => publicQuoteWire.parse(without)).toThrow(/totalCents/);
  });
});
