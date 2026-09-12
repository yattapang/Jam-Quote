import { describe, expect, it, vi } from "vitest";
import { InvoiceStatus } from "@jamquote/core";
import { ExportsService } from "./exports.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

// These are what the controller actually hands the service: Jamaica calendar
// midnights, expressed as UTC instants (Jamaica is UTC-5, no DST, so Jamaica
// midnight is 05:00 UTC) — not UTC midnights. Using UTC midnight here would
// let this whole suite pass against a boundary five hours off from what the
// Reports page (and the controller) actually mean by "2026-08-01".
const RANGE = {
  from: new Date("2026-08-01T05:00:00.000Z"),
  to: new Date("2026-08-31T05:00:00.000Z"),
};

/**
 * Two invoices whose line totals sum to their stated subtotals.
 *
 * This used to be described as "the shape the real data has". It is not: it omits
 * `markupPct` and `discountPct`, and both change the arithmetic. A review pointed
 * out that the reconciliation test below therefore passed while the lines file was
 * out by every line's markup. `invoicesWithMarkupAndDiscount` is the honest shape;
 * these two stay for the simple case.
 */
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

// `rows` is deliberately loose: the fixtures differ by design — one carries
// markup and a discount, the others do not — and inferring the type from one of
// them would make adding the honest shape a type error rather than a test.
function harness(rows: any[] = invoices(), payments: unknown[] = []) {
  // Typed with the args parameter so the tests below can assert on the WHERE
  // clause — the filtering (drafts out, tenant scoping, the range) is the part
  // worth pinning, and it is only observable in the query.
  const prisma = {
    invoice: { findMany: vi.fn((_args: any) => Promise.resolve(rows)) },
    payment: { findMany: vi.fn((_args: any) => Promise.resolve(payments)) },
    client: { findMany: vi.fn((_args: any) => Promise.resolve([])) },
  };
  return { svc: new ExportsService(prisma as any), prisma };
}

/**
 * One cell, located by its HEADER name rather than by counting commas.
 *
 * The file already knew better in one place — "descriptions may be quoted and
 * contain commas, so split on the tail, which is unquoted" — and the tests added
 * with the Discount column read cells by fixed forward index anyway. A client named
 * `"Grant, Ann"` gets quoted by `csvCell`, shifts every index, and those assertions
 * silently read the wrong cells; so does inserting a column.
 *
 * ## Exactly what this is safe against, and what it is not
 *
 * The real invariant is narrower than "comma-safe", and a review said so after the
 * first docstring overclaimed: **the number of comma-split fields to the RIGHT of
 * the target must match between the header row and the data row.**
 *
 * - A quoted comma BEFORE the target — a client name — is safe. Both
 *   `columns.length` and `at` shift by one, so the distance from the end does not.
 * - A quoted comma AFTER the target would return the wrong cell **silently**. No
 *   column right of the money columns holds free text today; the `headerRow` pins
 *   below are what would catch one being added.
 * - A duplicated header name resolves to the first, silently.
 *
 * Those limits are tested directly in `cellByHeader — what it is safe against`,
 * because a helper that guards the exports had no guard of its own.
 */
function cellByHeader(csv: string, header: string, column: string): number {
  const lines = csv.slice(1).split("\r\n").filter((l) => l.length > 0);
  const headerIndex = lines.findIndex((l) => l.startsWith(header));
  expect(headerIndex, `header not found: ${header}`).toBeGreaterThan(-1);
  const columns = lines[headerIndex]!.split(",");
  const at = columns.indexOf(column);
  expect(at, `column not found: ${column}`).toBeGreaterThan(-1);
  const fromEnd = columns.length - at;
  const row = lines[headerIndex + 1]!.split(",");
  return Number(row[row.length - fromEnd]);
}

/** The full header row, so adding or reordering a column has to be deliberate. */
function headerRow(csv: string, startsWith: string): string[] {
  const lines = csv.slice(1).split("\r\n").filter((l) => l.length > 0);
  const line = lines.find((l) => l.startsWith(startsWith));
  expect(line, `header not found: ${startsWith}`).toBeDefined();
  return line!.split(",");
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

  it("includes the whole of the final day, in Jamaica terms", async () => {
    // "to 31 August" means through the END of the 31st IN JAMAICA, not in UTC.
    // This used to assert "2026-08-31T23:59:59.999Z" — that pinned the bug: it
    // is midnight UTC plus 86,399,999ms, five hours short of the real Jamaica
    // end of day. RANGE.to is now a Jamaica midnight (05:00 UTC), so the whole
    // of the 31st in Jamaica runs through 2026-09-01T04:59:59.999Z UTC.
    const { svc, prisma } = harness();
    await svc.invoicesIssued("b1", RANGE);
    // Not `calls[0]?.[0]`: if the call never happened, `?.` yields undefined and
    // the property access after it throws a TypeError that reads like a bug in the
    // service. Assert the call first, then read it.
    const call = prisma.invoice.findMany.mock.calls[0];
    expect(call).toBeDefined();
    const { lte } = call![0].where.issueDate;
    expect(lte.toISOString()).toBe("2026-09-01T04:59:59.999Z");
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


/**
 * An invoice carrying the two fields the fixtures above leave out.
 *
 * Line-level markup and an invoice-level discount are both ordinary, and each
 * breaks a different reconciliation:
 *
 * - `markupPct` is part of the SUBTOTAL, so a lines file that ignores it sums low.
 * - `discountPct` sits between the subtotal and the total, so a summary file with
 *   no Discount column shows Subtotal + GCT exceeding Total with nothing to
 *   explain the difference.
 *
 * Figures: one line, 10 x $120.00 = $1,200.00, plus 20% markup = $1,440.00
 * subtotal. 10% discount = $144.00. GCT at 15% on the discounted base = $194.40.
 * Total = $1,440.00 - $144.00 + $194.40 = $1,490.40.
 */
function invoicesWithMarkupAndDiscount() {
  return [
    {
      number: "INV-0009",
      issueDate: new Date("2026-08-10T00:00:00.000Z"),
      dueDate: null,
      status: InvoiceStatus.INVOICED,
      client: { firstName: "Ann", lastName: "Grant" },
      subtotalCents: 144_000,
      gctCents: 19_440,
      totalCents: 149_040,
      discountPct: 10,
      paidCents: 0,
      retentionCents: 0,
      lineItems: [
        {
          sectionId: null,
          sort: 0,
          category: "MATERIAL",
          description: "Blockwork",
          quantity: 10,
          rateUnit: "UNIT",
          unitLabel: null,
          unitPriceCents: 12_000,
          markupPct: 20,
          gctTreatment: "STANDARD",
        },
      ],
      sections: [],
    },
  ];
}

describe("the accountant's two accrual files reconcile on real data", () => {
  it("invoice-lines sums to the Subtotal column, WITH markup", async () => {
    // The defect: the lines file printed quantity x unit price and never read
    // markupPct, so it summed to $1,200.00 against a stated subtotal of $1,440.00.
    // The comment above the offending line claimed any other rounding would break
    // reconciliation — the rounding was right; the unread field was the problem.
    const { svc } = harness(invoicesWithMarkupAndDiscount());
    const summary = await svc.invoicesIssued("b1", RANGE);
    const detail = await svc.invoiceLines("b1", RANGE);

    const subtotal = cellByHeader(summary.csv, "Invoice number,Issue date,Due date", "Subtotal");
    const lineSum = dataRows(detail.csv, "Invoice number,Issue date,Client").reduce((n, r) => {
      // From the tail: a description containing a comma is quoted and shifts every
      // forward index.
      const cells = r.split(",");
      return n + Number(cells[cells.length - 3] ?? 0);
    }, 0);
    expect(subtotal).toBe(1_440);
    expect(lineSum).toBe(subtotal);
  });

  it("Subtotal - Discount + GCT equals Total", async () => {
    // Without a Discount column an accountant saw 1440 + 194.40 against a total of
    // 1490.40 and no way to account for the missing 144.
    const { svc } = harness(invoicesWithMarkupAndDiscount());
    const csv = (await svc.invoicesIssued("b1", RANGE)).csv;
    const head = "Invoice number,Issue date,Due date";
    const [subtotal, discount, gct, total] = ["Subtotal", "Discount", "GCT", "Total"].map((c) =>
      cellByHeader(csv, head, c),
    );
    expect(discount).toBe(144);
    expect(subtotal! - discount! + gct!).toBe(total);
  });
});


describe("payments-received carries only cash that actually arrived", () => {
  const payment = (over: Record<string, unknown> = {}) => ({
    paidAt: new Date("2026-08-05T00:00:00.000Z"),
    amountCents: 500_000,
    method: "CARD",
    status: "completed",
    providerCode: null,
    reference: null,
    invoice: { number: "INV-0001", client: { firstName: "Marcia", lastName: "Brown" } },
    ...over,
  });

  it("asks the database for completed and recorded payments only", () => {
    // The defect: no status filter at all. Opening a WiPay checkout writes a
    // `pending` row for the FULL invoice balance with paidAt defaulting to now, and
    // an abandoned checkout is never upgraded and never removed — so this file
    // carried money that never came, dated today, for ever. A contractor
    // downloading August would have handed their accountant a phantom $500,000.
    //
    // Asserted on the QUERY rather than the output, because that is where the
    // exclusion has to happen: filtering after the read would still pull every
    // pending row into memory and rely on a second list matching the first.
    const { svc, prisma } = harness();
    void svc.paymentsReceived("b1", RANGE);
    expect(prisma.payment.findMany.mock.calls[0]![0].where.status).toEqual({
      in: ["completed", "recorded"],
    });
  });

  it("uses the SAME list the Reports page uses", async () => {
    // The two sat on one screen disagreeing: Reports filtered, the download did
    // not. The list now lives in core and both import it, so a third surface
    // cannot invent a fourth answer.
    const { COLLECTED_PAYMENT_STATUSES } = await import("@jamquote/core");
    const { svc, prisma } = harness();
    void svc.paymentsReceived("b1", RANGE);
    expect(prisma.payment.findMany.mock.calls[0]![0].where.status.in).toEqual(
      COLLECTED_PAYMENT_STATUSES,
    );
  });

  it("the paidAt window covers a whole Jamaica day at each edge, not a UTC one", () => {
    // RANGE is the August window as the controller now builds it: Jamaica
    // midnights (05:00 UTC), covering "2026-08-01" through "2026-08-31" in
    // Jamaica terms. A payment at 20:00 Jamaica on 31 August is
    // 2026-09-01T01:00:00.000Z — it must be IN this window. A payment at 20:00
    // Jamaica on 31 July (the day before the range starts) is
    // 2026-08-01T01:00:00.000Z — it must be OUT. Both used to land on the
    // wrong side: the old UTC-midnight parse excluded the first and included
    // the second.
    const { svc, prisma } = harness();
    void svc.paymentsReceived("b1", RANGE);
    const { gte, lte } = prisma.payment.findMany.mock.calls[0]![0].where.paidAt;

    const lastDay8pmJamaica = new Date("2026-09-01T01:00:00.000Z");
    const dayBefore8pmJamaica = new Date("2026-08-01T01:00:00.000Z");

    expect(lastDay8pmJamaica.getTime()).toBeGreaterThanOrEqual(gte.getTime());
    expect(lastDay8pmJamaica.getTime()).toBeLessThanOrEqual(lte.getTime());

    expect(
      dayBefore8pmJamaica.getTime() >= gte.getTime() && dayBefore8pmJamaica.getTime() <= lte.getTime(),
    ).toBe(false);
  });

  it("still lists a payment that did arrive, so the filter is not simply off", async () => {
    const { svc } = harness(invoices(), [payment({ method: "CASH" })]);
    const file = await svc.paymentsReceived("b1", RANGE);
    expect(dataRows(file.csv, "Date received,Invoice number")).toHaveLength(1);
    // No thousands separator: csvMoney emits plain digits so a spreadsheet reads
    // the cell as a number rather than text.
    expect(file.csv).toContain("5000.00");
  });
});


/**
 * The header rows, pinned in full.
 *
 * Adding the Discount column changed a header and shifted the meaning of every
 * forward cell index, and **no test failed** — `dataRows` locates a header by its
 * first three columns only. An accountant's file is a contract with a spreadsheet
 * someone else built: a column appearing, moving or being renamed is a change they
 * have to be told about, so it must never be silent here.
 */
describe("the export headers are a contract", () => {
  it("invoices-issued", async () => {
    const { svc } = harness();
    expect(
      headerRow((await svc.invoicesIssued("b1", RANGE)).csv, "Invoice number,Issue date,Due date"),
    ).toEqual([
      "Invoice number",
      "Issue date",
      "Due date",
      "Status",
      "Client",
      "Subtotal",
      "Discount",
      "GCT",
      "Total",
      "Paid",
      "Outstanding",
      "Retention held",
      "Currency",
    ]);
  });

  it("invoice-lines", async () => {
    const { svc } = harness();
    expect(
      headerRow((await svc.invoiceLines("b1", RANGE)).csv, "Invoice number,Issue date,Client"),
    ).toEqual([
      "Invoice number",
      "Issue date",
      "Client",
      "Section",
      "Category",
      "Description",
      "Quantity",
      "Unit",
      "Unit price",
      "Line total",
      "GCT treatment",
      "Currency",
    ]);
  });

  it("payments-received", async () => {
    const { svc } = harness();
    expect(
      headerRow((await svc.paymentsReceived("b1", RANGE)).csv, "Date received,Invoice number"),
    ).toEqual([
      "Date received",
      "Invoice number",
      "Client",
      "Amount",
      "Method",
      "Provider",
      "Reference",
      "Status",
      "Currency",
    ]);
  });
});


/**
 * The helper that guards the exports, guarded.
 *
 * A review broke the first version in four ways and pointed out that the "verified
 * by hand" in its commit message was exactly that — by hand, not committed. So the
 * limits are now assertions, including the two cases where it is knowingly wrong,
 * which is the difference between a documented limit and a latent bug.
 */
describe("cellByHeader — what it is safe against", () => {
  const csv = (header: string, row: string) => "﻿" + ["meta", "", header, row].join("\r\n");

  it("resolves a column by name", () => {
    expect(cellByHeader(csv("A,B,C", "1,2,3"), "A,B", "B")).toBe(2);
  });

  it("survives a quoted comma BEFORE the target", () => {
    // The case that actually occurs: a client named "Grant, Ann".
    expect(cellByHeader(csv("Client,Subtotal,GCT", '"Grant, Ann",1440,216'), "Client", "Subtotal")).toBe(
      1440,
    );
  });

  it("is NOT safe against a quoted comma AFTER the target, and this pins that", () => {
    // Documented, not fixed: no column right of the money columns holds free text,
    // and `headerRow` catches one being added. If this assertion ever starts
    // failing, someone added such a column and this helper needs a real parser.
    const wrong = cellByHeader(csv("Subtotal,Notes", '1440,"a, b"'), "Subtotal", "Subtotal");
    expect(wrong).not.toBe(1440);
  });

  it("takes the FIRST of a duplicated header name", () => {
    expect(cellByHeader(csv("Total,Total", "5,9"), "Total", "Total")).toBe(5);
  });

  it("fails loudly on a column that is not there", () => {
    expect(() => cellByHeader(csv("A,B", "1,2"), "A,B", "Nope")).toThrow();
  });
});
