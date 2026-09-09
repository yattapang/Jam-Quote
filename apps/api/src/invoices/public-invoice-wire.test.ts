import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { publicInvoiceWire } from "@jamquote/core";
import type { PublicInvoiceView } from "./invoices.service.js";

/**
 * The public invoice view keeps its promise, and promises nothing more.
 *
 * The twin of `public-quote-wire.test.ts`. Same double coupling — TypeScript
 * against the service's real return type, Zod against the contract — and the
 * same `.strict()`, because this is the unauthenticated surface and an extra
 * field is a disclosure.
 *
 * The extra thing worth asserting here is the payment LEDGER. `paidCents` is a
 * total the client is entitled to; which method, which date, which bank
 * reference is the contractor's record of their own banking, and a client needs
 * none of it to pay an invoice.
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

const sample: PublicInvoiceView = {
  number: "INV-0007",
  status: "PARTIAL",
  issueDate: new Date("2026-09-01T00:00:00.000Z"),
  dueDate: new Date("2026-09-15T00:00:00.000Z"),
  terms: "Net 14",
  detailLevel: "SUMMARY",
  gctRate: new Prisma.Decimal("15.00"),
  discountPct: new Prisma.Decimal("0"),
  depositCents: 0,
  subtotalCents: 1_200_000,
  gctCents: 180_000,
  totalCents: 1_380_000,
  paidCents: 400_000,
  retentionCents: 138_000,
  retentionReleased: false,
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

function overTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("the public invoice wire contract", () => {
  it("is satisfied by what the service returns", () => {
    expect(() => publicInvoiceWire.parse(overTheWire(sample))).not.toThrow();
  });

  it("REJECTS the payment ledger", () => {
    // A client is entitled to the TOTAL they have paid. Which method, which
    // date, which reference is the contractor's own banking record.
    const widened = {
      ...overTheWire(sample),
      payments: [{ amountCents: 400_000, method: "BANK_TRANSFER", providerRef: "TX-8891" }],
    };
    expect(() => publicInvoiceWire.parse(widened)).toThrow();
  });

  it("REJECTS the reminder ledger", () => {
    // How many times a contractor has chased this client, and when, is between
    // the contractor and their own records.
    const widened = { ...overTheWire(sample), reminders: [{ channel: "WHATSAPP" }] };
    expect(() => publicInvoiceWire.parse(widened)).toThrow();
  });

  it("REJECTS markupPct on a line", () => {
    const wire = overTheWire(sample) as { lineItems: Record<string, unknown>[] };
    wire.lineItems[0]!.markupPct = "30";
    expect(() => publicInvoiceWire.parse(wire)).toThrow();
  });

  it("REJECTS an extra field on a nested section's lines", () => {
    const wire = overTheWire(sample) as { sections: { lineItems: Record<string, unknown>[] }[] };
    wire.sections[0]!.lineItems[0]!.supplierId = "sup_1";
    expect(() => publicInvoiceWire.parse(wire)).toThrow();
  });

  it("sends retention as its own figure, so the client can see what they hold", () => {
    // Hiding it would make the balance look wrong: retention is not a shortfall,
    // and an invoice with it held is settled when the rest arrives.
    const parsed = publicInvoiceWire.parse(overTheWire(sample));
    expect(parsed.retentionCents).toBe(138_000);
    expect(parsed.retentionReleased).toBe(false);
  });

  it("allows an invoice with no due date, which is never overdue", () => {
    const noTerms: PublicInvoiceView = { ...sample, dueDate: null, terms: null };
    expect(() => publicInvoiceWire.parse(overTheWire(noTerms))).not.toThrow();
  });

  it("REJECTS a response missing a promised field", () => {
    const { paidCents: _dropped, ...without } = overTheWire(sample);
    expect(() => publicInvoiceWire.parse(without)).toThrow(/paidCents/);
  });
});
