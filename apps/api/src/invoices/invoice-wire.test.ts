import { describe, expect, it } from "vitest";
import { Prisma, type Invoice, type InvoiceLineItem, type Payment } from "@prisma/client";
import { invoiceDetailWire, invoiceWire } from "@jamquote/core";

/**
 * Seam 1's last shape. Same double coupling as the rest: TypeScript against
 * Prisma's generated types, Zod against what the web reads.
 *
 * The retention fields are what this file is really for. There are three of
 * them and they mean different things, and the money bugs in this project have
 * all lived in exactly that kind of gap:
 *
 * - `retentionPct` is the percentage AGREED — nullable, because null ("not
 *   agreed") and `"0"` ("none on this contract") are different statements
 * - `retentionCents` is a SNAPSHOT of the amount, so editing the job's
 *   percentage later cannot restate a document the client already holds
 * - `retentionReleasedAt` is when it became payable
 */

const line: InvoiceLineItem = {
  id: "ili_1",
  invoiceId: "inv_1",
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

const payment: Payment = {
  id: "pay_1",
  invoiceId: "inv_1",
  amountCents: 400_000,
  method: "BANK_TRANSFER",
  providerCode: null,
  providerRef: "TX-8891",
  providerRaw: null,
  status: "recorded",
  paidAt: new Date("2026-09-05T00:00:00.000Z"),
  createdAt: new Date("2026-09-05T00:00:00.000Z"),
  updatedAt: new Date("2026-09-05T00:00:00.000Z"),
  deletedAt: null,
};

const listRow: Invoice = {
  id: "inv_1",
  businessId: "biz_1",
  clientId: "cl_1",
  quoteId: "q_1",
  projectId: null,
  number: "INV-0007",
  status: "PARTIAL",
  detailLevel: "SUMMARY",
  gctRate: new Prisma.Decimal("15.00"),
  discountPct: new Prisma.Decimal("0"),
  depositCents: 0,
  terms: "Net 14",
  dueDate: new Date("2026-09-15T00:00:00.000Z"),
  issueDate: new Date("2026-09-01T00:00:00.000Z"),
  retentionPct: null,
  retentionCents: 0,
  retentionReleasedAt: null,
  shareToken: null,
  sharedAt: null,
  firstViewedAt: null,
  subtotalCents: 1_200_000,
  gctCents: 180_000,
  totalCents: 1_380_000,
  paidCents: 400_000,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  deletedAt: null,
};

function overTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

const detail = {
  ...listRow,
  lineItems: [line],
  sections: [{ title: "Foundation", lineItems: [{ ...line, id: "ili_2" }] }],
  payments: [payment],
  reminders: [
    {
      id: "r_1",
      channel: "WHATSAPP",
      sentTo: "8765550100",
      outstandingCents: 980_000,
      sentAt: "2026-09-10T00:00:00.000Z",
    },
  ],
};

describe("the invoice wire contract — the two shapes", () => {
  it("accepts a LIST row with no nested collections", () => {
    const parsed = invoiceWire.parse(overTheWire(listRow));
    expect(parsed.lineItems).toBeUndefined();
    expect(parsed.payments).toBeUndefined();
  });

  it("accepts a DETAIL row with lines, payments and reminders", () => {
    expect(() => invoiceDetailWire.parse(overTheWire(detail))).not.toThrow();
  });

  it("REFUSES a list row where the detail shape is required", () => {
    expect(() => invoiceDetailWire.parse(overTheWire(listRow))).toThrow();
  });
});

describe("the invoice wire contract — retention's three fields", () => {
  it("keeps null and zero DISTINCT on the percentage", () => {
    // Null is "not agreed"; "0" is "no retention on this contract". Different
    // statements, and the form keeps them apart deliberately.
    expect(invoiceWire.parse(overTheWire(listRow)).retentionPct).toBeNull();
    const zero: Invoice = { ...listRow, retentionPct: new Prisma.Decimal("0") };
    expect(invoiceWire.parse(overTheWire(zero)).retentionPct).toBe("0");
  });

  it("sends the withheld AMOUNT as integer cents, not a Decimal", () => {
    // It is a snapshot of money, so it obeys the money invariant: editing the
    // job's percentage later must not restate a document the client holds.
    const held: Invoice = {
      ...listRow,
      retentionPct: new Prisma.Decimal("10.00"),
      retentionCents: 138_000,
    };
    const parsed = invoiceWire.parse(overTheWire(held));
    expect(parsed.retentionCents).toBe(138_000);
    expect(parsed.retentionPct).toBe("10");
  });

  it("REJECTS retentionCents arriving as a string", () => {
    expect(() => invoiceWire.parse({ ...overTheWire(listRow), retentionCents: "138000" })).toThrow(
      /retentionCents/,
    );
  });

  it("marks release with a timestamp, and null while still held", () => {
    expect(invoiceWire.parse(overTheWire(listRow)).retentionReleasedAt).toBeNull();
    const released: Invoice = {
      ...listRow,
      retentionReleasedAt: new Date("2026-10-01T00:00:00.000Z"),
    };
    expect(invoiceWire.parse(overTheWire(released)).retentionReleasedAt).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });
});

describe("the invoice wire contract — dates that drive money", () => {
  it("carries issueDate, which reports bucket revenue by", () => {
    // Distinct from createdAt on purpose: June's work written up in July is
    // still June revenue.
    const parsed = invoiceWire.parse(overTheWire(listRow));
    expect(parsed.issueDate).toBe("2026-09-01T00:00:00.000Z");
  });

  it("allows a null dueDate, which is never overdue", () => {
    // Not a missing value - a real state. Inventing a deadline would put terms
    // on a client nobody agreed.
    const noTerms: Invoice = { ...listRow, dueDate: null, terms: null };
    expect(invoiceWire.parse(overTheWire(noTerms)).dueDate).toBeNull();
  });
});

describe("the invoice wire contract — the ledgers", () => {
  it("carries paidCents AND the payments behind it, because this is the tenant's read", () => {
    // publicInvoiceWire sends the total and refuses the ledger. The asymmetry is
    // the disclosure boundary, so both halves are asserted somewhere.
    const parsed = invoiceDetailWire.parse(overTheWire(detail));
    expect(parsed.paidCents).toBe(400_000);
    expect(parsed.payments[0]!.providerRef).toBe("TX-8891");
  });

  it("carries what a reminder said at the time it was sent", () => {
    // A reminder for $9,800 must still read as $9,800 after a part payment, or
    // the ledger misrepresents what the client was told.
    const parsed = invoiceDetailWire.parse(overTheWire(detail));
    expect(parsed.reminders[0]!.outstandingCents).toBe(980_000);
  });

  it("REJECTS a response missing a promised field", () => {
    const { paidCents: _dropped, ...without } = overTheWire(listRow);
    expect(() => invoiceWire.parse(without)).toThrow(/paidCents/);
  });
});
