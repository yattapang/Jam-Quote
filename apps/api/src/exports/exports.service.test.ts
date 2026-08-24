import { describe, expect, it, vi } from "vitest";
import { InvoiceStatus } from "@jamquote/core";
import { ExportsService } from "./exports.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const RANGE = {
  from: new Date("2026-08-01T00:00:00.000Z"),
  to: new Date("2026-08-31T00:00:00.000Z"),
};

/** Two invoices whose line totals sum to their stated subtotals — the shape
 * the real data has, so reconciliation is a meaningful assertion. */
function invoices() {
  return [
    {
      number: "INV-0001",
      issueDate: new Date("2026-08-03T00:00:00.000Z"),
      dueDate: new Date("2026-08-17T00:00:00.000Z"),
      status: InvoiceStatus.INVOICED,
      client: { firstName: "Marcia", lastName: "Brown" },
      subtotalCents: 150_000,
      gctCents: 22_500,
      totalCents: 172_500,
      paidCents: 0,
      retentionCents: 0,
      lineItems: [
        {
          sectionId: null, sort: 0, category: "MATERIAL", description: "Cement, 42.5kg",
          quantity: 10, rateUnit: "UNIT", unitLabel: "bag", unitPriceCents: 12_000,
          gctTreatment: "STANDARD",
        },
      ],
      sections: [
        {
          title: "Foundation", sort: 0,
          lineItems: [
            {
              sectionId: "s1", sort: 0, category: "LABOUR", description: "Blockwork",
              quantity: 2, rateUnit: "DAY", unitLabel: null, unitPriceCents: 15_000,
              gctTreatment: "STANDARD",
            },
          ],
        },
      ],
    },
    {
      number: "INV-0002",
      issueDate: new Date("2026-08-20T00:00:00.000Z"),
      dueDate: null,
      status: InvoiceStatus.PARTIAL,
      client: { firstName: "Kevin", lastName: "" },
      subtotalCents: 40_000,
      gctCents: 0,
      totalCents: 40_000,
      paidCents: 15_000,
      retentionCents: 0,
      lineItems: [
        {
          sectionId: null, sort: 0, category: "MATERIAL", description: "Sand, =load",
          quantity: 4, rateUnit: "UNIT", unitLabel: "m3", unitPriceCents: 10_000,
          gctTreatment: "ZERO_RATED",
        },
      ],
      sections: [],
    },
  ];
}

function harness(rows = invoices()) {
  // Typed with the args parameter so the tests below can assert on the WHERE
  // clause — the filtering (drafts out, tenant scoping, the range) is the part
  // worth pinning, and it is only observable in the query.
  const prisma = {
    invoice: { findMany: vi.fn((_args: any) => Promise.resolve(rows)) },
    payment: { findMany: vi.fn((_args: any) => Promise.resolve([])) },
    client: { findMany: vi.fn((_args: any) => Promise.resolve([])) },
  };
  return { svc: new ExportsService(prisma as any), prisma };
}

/** Data rows only — past the meta block, the blank line and the headers. */
function dataRows(csv: string, headerStartsWith: string): string[] {
  const lines = csv.slice(1).split("\r\n").filter((l) => l.length > 0);
  const headerIndex = lines.findIndex((l) => l.startsWith(headerStartsWith));
  return lines.slice(headerIndex + 1);
}

describe("ExportsService — the detail file reconciles with the summary", () => {
  it("invoice-lines sums exactly to the Subtotal column of invoices-issued", async () => {
    // The invariant this whole feature stands on. An accountant who cannot
    // tie the line file to the document file has to check every row by hand,
    // and the money seam is where this project has already been bitten twice.
    const { svc } = harness();

    const summary = await svc.invoicesIssued("b1", RANGE);
    const detail = await svc.invoiceLines("b1", RANGE);

    const subtotalSum = dataRows(summary.csv, "Invoice number,Issue date,Due date")
      .map((r) => Number(r.split(",")[5] ?? 0))
      .reduce((a, b) => a + b, 0);

    const lineSum = dataRows(detail.csv, "Invoice number,Issue date,Client")
      .map((r) => {
        // "Line total" is the 10th column, but descriptions may be quoted and
        // contain commas — so split on the tail, which is unquoted.
        const cells = r.split(",");
        return Number(cells[cells.length - 3] ?? 0);
      })
      .reduce((a, b) => a + b, 0);

    expect(lineSum).toBe(subtotalSum);
    expect(lineSum).toBe(1900); // 1,200 + 300 + 400
  });
});

describe("ExportsService — what the files promise", () => {
  it("excludes drafts, in the query rather than after the fact", async () => {
    const { svc, prisma } = harness();
    await svc.invoicesIssued("b1", RANGE);
    const where = prisma.invoice.findMany.mock.calls[0]?.[0].where;
    expect(where.status).toEqual({ not: InvoiceStatus.DRAFT });
    // Tenant scoping is not optional on the largest disclosure the API offers.
    expect(where.businessId).toBe("b1");
  });

  it("includes the whole of the final day", async () => {
    // "to 31 August" means through the END of the 31st. Comparing against
    // midnight silently drops a day of revenue with nothing to show for it.
    const { svc, prisma } = harness();
    await svc.invoicesIssued("b1", RANGE);
    const { lte } = prisma.invoice.findMany.mock.calls[0]?.[0].where.issueDate;
    expect(lte.toISOString()).toBe("2026-08-31T23:59:59.999Z");
  });

  it("dates invoices by issueDate, not by when the row was written", async () => {
    const { svc, prisma } = harness();
    await svc.invoicesIssued("b1", RANGE);
    const where = prisma.invoice.findMany.mock.calls[0]?.[0].where;
    expect(where.issueDate).toBeDefined();
    expect(where.createdAt).toBeUndefined();
  });

  it("names its basis inside the file, not only in the filename", async () => {
    // Files get renamed, forwarded and printed. A basis you have to look up
    // elsewhere is a basis the accountant will assume instead.
    const accrual = await harness().svc.invoicesIssued("b1", RANGE);
    const cash = await harness().svc.paymentsReceived("b1", RANGE);
    expect(accrual.csv).toContain("Accrual");
    expect(cash.csv).toContain("Cash");
    expect(accrual.csv).toContain("Draft documents are excluded");
  });

  it("names the file with its basis and period", async () => {
    const { filename } = await harness().svc.invoicesIssued("b1", RANGE);
    expect(filename).toBe("invoices-issued-2026-08-01-to-2026-08-31.csv");
  });

  it("keeps GCT treatment per line, so output tax can be split", async () => {
    const detail = await harness().svc.invoiceLines("b1", RANGE);
    expect(detail.csv).toContain("STANDARD");
    expect(detail.csv).toContain("ZERO_RATED");
  });

  it("defuses a description Excel would run as a formula", async () => {
    // "Sand, =load" — a comma AND a formula lead, both from tenant input.
    const detail = await harness().svc.invoiceLines("b1", RANGE);
    expect(detail.csv).toContain('"Sand, =load"');
  });

  it("carries the client's own TRN, forced to text so Excel cannot eat it", async () => {
    // A TRN with a leading zero, or long enough to be shown as 1.23457E+11,
    // is the reason this column is not a plain number. It is the client's own
    // tax number, not the contractor's.
    const { svc, prisma } = harness();
    prisma.client.findMany.mockResolvedValueOnce([
      {
        firstName: "Marcia", lastName: "Brown", trn: "012345678",
        phone: "8765550100", email: null, addressLine: null, town: null,
        parish: null, createdAt: new Date("2026-01-05T00:00:00.000Z"),
      },
    ] as any);

    const out = await svc.clients("b1", RANGE);
    expect(out.csv).toContain("TRN");
    expect(out.csv).toContain('="012345678"');
  });

  it("leaves the TRN cell blank for a client who has none", async () => {
    // Most of a jobbing contractor's customers are households. A blank cell is
    // the honest answer; an empty ="" formula would be noise in every row.
    const { svc, prisma } = harness();
    prisma.client.findMany.mockResolvedValueOnce([
      {
        firstName: "Kevin", lastName: "", trn: null, phone: null, email: null,
        addressLine: null, town: null, parish: null,
        createdAt: new Date("2026-01-05T00:00:00.000Z"),
      },
    ] as any);

    const out = await svc.clients("b1", RANGE);
    expect(out.csv).not.toContain('=""');
  });

  it("does not period-limit the customer listing", async () => {
    // A customer list limited to whoever was invoiced in March is not the list
    // anyone asked for.
    const { svc, prisma } = harness();
    await svc.clients("b1", RANGE);
    const where = prisma.client.findMany.mock.calls[0]?.[0].where;
    expect(where.createdAt).toBeUndefined();
    expect(where.businessId).toBe("b1");
  });

  it("leaves out voided payments, which never were payments", async () => {
    const { svc, prisma } = harness();
    await svc.paymentsReceived("b1", RANGE);
    expect(prisma.payment.findMany.mock.calls[0]?.[0].where.deletedAt).toBeNull();
  });

  it("still produces a usable file for an empty period", async () => {
    // Headers with no rows say "nothing was invoiced". A zero-byte file looks
    // like the export broke.
    const { svc } = harness([]);
    const out = await svc.invoicesIssued("b1", RANGE);
    expect(out.csv).toContain("Invoice number");
    expect(dataRows(out.csv, "Invoice number,Issue date,Due date")).toEqual([]);
  });
});
