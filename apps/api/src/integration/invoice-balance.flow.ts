/**
 * FLOW 3 — invoice -> payments -> balance, over the real services and a real Postgres.
 *
 * Partial payments, an overpayment, a void, and retention applied from the project and
 * then released. After every step the same money is read back through every surface
 * that reports it — the tenant's invoice read, the public share view, the reports
 * summary and the accountant's CSV export — and each must agree with
 * `settlementOf` / `invoiceSettlement` from core, the one definition of a balance.
 *
 * Two measures, deliberately different (see core computeReceivables):
 * - "due now" / settled — `settlementOf`, retention held back;
 * - "outstanding" (accrual) — total less paid, retention included, never negative.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
  InvoiceStatus,
  LineCategory,
  PaymentMethod,
  QuoteStatus,
  RateUnit,
  settlementOf,
} from "@jamquote/core";
import { createQuoteSchema } from "../quotes/quotes.dto.js";
import { createClientSchema } from "../clients/clients.dto.js";
import { createProjectSchema } from "../projects/projects.dto.js";
import { recordManualPaymentSchema } from "../payments/payments.dto.js";
import { failure, type Integration } from "./fixture.js";

let env: Integration;

const RANGE = { from: new Date("2000-01-01T05:00:00Z"), to: new Date("2100-01-01T05:00:00Z") };

/** One invoice's row of the accrual export, as header -> cell. */
async function csvRow(businessId: string, number: string): Promise<Record<string, string>> {
  const { csv } = await env.svc.exports.invoicesIssued(businessId, RANGE);
  const BOM = String.fromCharCode(0xfeff);
  const lines = (csv.startsWith(BOM) ? csv.slice(1) : csv).split("\r\n");
  const headerAt = lines.findIndex((l) => l.startsWith("Invoice number,"));
  expect(headerAt).toBeGreaterThan(-1);
  const headers = lines[headerAt]!.split(",");
  const row = lines.slice(headerAt + 1).find((l) => l.startsWith(`${number},`));
  expect(row, `export has a row for ${number}`).toBeDefined();
  return Object.fromEntries(row!.split(",").map((v, i) => [headers[i], v]));
}

const money = (cents: number) =>
  `${cents < 0 ? "'-" : ""}${Math.floor(Math.abs(cents) / 100)}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;

/** Every surface's reading of one invoice, and the checks that bind them to core. */
/**
 * `accrual` is the expected accrual outstanding, worked by hand at each call site
 * rather than computed here: `total - paid` written in this file would be a second
 * copy of the rule (core's retention-usage guard refuses one), and an oracle that
 * shares the implementation's arithmetic proves nothing.
 */
async function assertSurfacesAgree(
  businessId: string,
  invoiceId: string,
  token: string,
  accrual: number,
  opts: { overpaid?: boolean } = {},
) {
  const inv = await env.svc.invoices.findOne(businessId, invoiceId);
  const s = settlementOf(inv);

  // The ledger: paidCents is exactly the sum of the live collected payments.
  expect(inv.paidCents).toBe(inv.payments.reduce((sum, p) => sum + p.amountCents, 0));

  // Status is derived from core's settlement, not restated.
  const expectedStatus = s.settledForNow
    ? InvoiceStatus.PAID
    : inv.paidCents > 0
      ? InvoiceStatus.PARTIAL
      : InvoiceStatus.INVOICED;
  expect(inv.status, "status agrees with settlementOf").toBe(expectedStatus);

  // Public view carries the inputs of the same settlement.
  const pub = await env.svc.publicInvoices.findByToken(token);
  expect(settlementOf({ ...pub, retentionReleasedAt: pub.retentionReleased ? new Date() : null })).toEqual(s);

  // Reports: accrual outstanding (billed, not received, retention included, never negative).
  const summary = await env.svc.reports.getSummary(businessId, RANGE.from, RANGE.to);
  expect(summary.receivables.totalOutstandingCents).toBe(accrual);
  expect(summary.revenue.collectedCents).toBe(inv.paidCents);

  // CSV export agrees with the reports figure and with the invoice read.
  const row = await csvRow(businessId, inv.number);
  expect(row["Total"]).toBe(money(inv.totalCents));
  expect(row["Paid"]).toBe(money(inv.paidCents));
  expect(row["Retention held"]).toBe(money(inv.retentionCents));
  expect(row["Status"]).toBe(inv.status);
  // KNOWN DEFECT D2 (see the `it.fails` below): on an OVERPAID invoice the export
  // prints total - paid unclamped. Everywhere else it must agree with reports.
  if (!opts.overpaid) {
    expect(row["Outstanding"], "CSV outstanding agrees with reports").toBe(money(accrual));
  }

  // And the payments export sums to the same cash.
  const { csv } = await env.svc.exports.paymentsReceived(businessId, RANGE);
  const payLines = csv.split("\r\n").filter((l) => l.includes(`,${inv.number},`));
  expect(payLines).toHaveLength(inv.payments.length);
  return { inv, s };
}

async function issuedInvoiceWithRetention(retentionPct: number) {
  const { svc } = env;
  const { a } = await env.tenants();
  const client = await svc.clients.create(a.id, createClientSchema.parse({ firstName: "Devon", lastName: "Reid" }));
  const project = await svc.projects.create(
    a.id,
    createProjectSchema.parse({ name: "Reid extension", clientId: client.id, retentionPct }),
  );
  const quote = await svc.quotes.create(
    a.id,
    createQuoteSchema.parse({
      clientId: client.id,
      projectId: project.id,
      lineItems: [
        { category: LineCategory.OTHER, description: "Works", quantity: 1, rateUnit: RateUnit.JOB, unitPriceCents: 1_000_000 },
      ],
    }),
  );
  await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.SENT);
  await svc.quotes.updateStatus(a.id, quote.id, QuoteStatus.ACCEPTED);
  const draft = await svc.invoices.convertFromQuote(a.id, quote.id);
  const inv = await svc.invoices.finalize(a.id, draft.id);
  const { shareToken } = await svc.invoices.share(a.id, inv.id);
  return { a, inv, token: shareToken };
}

const pay = (businessId: string, invoiceId: string, amountCents: number) =>
  env.svc.payments.recordManualPayment({
    businessId,
    invoiceId,
    ...recordManualPaymentSchema.parse({ amountCents, method: PaymentMethod.BANK_TRANSFER }),
  });


/** Registered by flows.integration.test.ts, which owns the one shared database. */
export function invoiceBalanceFlow(shared: () => Integration): void {
  beforeAll(() => {
    env = shared();
  });

describe("invoice -> payments -> balance", () => {
  it("partial, overpaid, voided: every surface agrees with core after every step", async () => {
    const { a, inv, token } = await issuedInvoiceWithRetention(10);
    // 1,000,000 + 15% GCT = 1,150,000; retention 10% = 115,000; due now 1,035,000.
    expect([inv.totalCents, inv.retentionCents]).toEqual([1_150_000, 115_000]);
    await assertSurfacesAgree(a.id, inv.id, token, 1_150_000);

    await pay(a.id, inv.id, 400_000);
    expect((await assertSurfacesAgree(a.id, inv.id, token, 750_000)).inv.status).toBe(InvoiceStatus.PARTIAL);

    await pay(a.id, inv.id, 300_000);
    await assertSurfacesAgree(a.id, inv.id, token, 450_000);

    // Overpayment: 1,250,000 against a total of 1,150,000.
    await pay(a.id, inv.id, 550_000);
    const over = await assertSurfacesAgree(a.id, inv.id, token, 0, { overpaid: true });
    expect(over.inv.status).toBe(InvoiceStatus.PAID);
    expect(over.s.outstandingCents).toBe(0);

    // Void the 300,000: 950,000 paid, below the 1,035,000 due now.
    const second = over.inv.payments.find((p) => p.amountCents === 300_000)!;
    await env.svc.payments.voidPayment(a.id, second.id);
    const voided = await assertSurfacesAgree(a.id, inv.id, token, 200_000);
    expect([voided.inv.status, voided.s.outstandingCents]).toEqual([InvoiceStatus.PARTIAL, 85_000]);
    // A voided payment cannot be voided twice.
    expect((await failure(env.svc.payments.voidPayment(a.id, second.id))).status).toBe(404);

    // Release the retention: all 1,150,000 is now due, 200,000 of it outstanding.
    await env.svc.invoices.setRetentionReleased(a.id, inv.id, true);
    const released = await assertSurfacesAgree(a.id, inv.id, token, 200_000);
    expect([released.s.heldCents, released.s.outstandingCents]).toEqual([0, 200_000]);
    // And un-release it (sign-off clicked early).
    await env.svc.invoices.setRetentionReleased(a.id, inv.id, false);
    expect((await assertSurfacesAgree(a.id, inv.id, token, 200_000)).s.outstandingCents).toBe(85_000);
  });

  /**
   * The one window where core's settlement and a hand-written `paidCents >=
   * totalCents` disagree: retention HELD, and paid somewhere in
   * [dueNow, total). The ladder above steps from 700,000 straight to an
   * overpayment of 1,250,000, so it never enters that window — and the only
   * test that did was the `it.fails` for D3, which keeps "failing" either way.
   *
   * So this was added after planting exactly that defect in
   * payments.service.ts `statusForPaid` (replacing `settlementOf(invoice)`
   * with `invoice.paidCents >= invoice.totalCents`) and watching all 17 tests
   * stay green. It fails on that plant, on both sides of the boundary.
   *
   * It asserts nothing about RELEASING retention, which is D3's subject, so it
   * stays independent of that defect.
   */
  it("with retention held, settlement is measured against due-now, not the total", async () => {
    const { a, inv, token } = await issuedInvoiceWithRetention(10);
    // 1,000,000 + 15% GCT = 1,150,000; retention 10% = 115,000; due now 1,035,000.
    expect([inv.totalCents, inv.retentionCents]).toEqual([1_150_000, 115_000]);

    // One cent short of due now: not settled, by either definition.
    await pay(a.id, inv.id, 1_034_999);
    const short = await assertSurfacesAgree(a.id, inv.id, token, 115_001);
    expect([short.inv.status, short.s.outstandingCents]).toEqual([InvoiceStatus.PARTIAL, 1]);

    // Exactly due now: settled, though 115,000 BELOW the total. A `>= total`
    // comparison reads this as PARTIAL and the overdue sweep then chases it.
    await pay(a.id, inv.id, 1);
    const settled = await assertSurfacesAgree(a.id, inv.id, token, 115_000);
    expect([settled.inv.status, settled.s.outstandingCents, settled.s.heldCents]).toEqual([
      InvoiceStatus.PAID,
      0,
      115_000,
    ]);
    // The point of the window, stated: settled while still short of the total.
    expect(settled.inv.paidCents).toBe(1_035_000);
    expect(settled.inv.paidCents).toBeLessThan(settled.inv.totalCents);
  });

  /**
   * KNOWN DEFECT D2 — exports.service.ts `invoicesIssued` writes
   * `csvMoney(i.totalCents - i.paidCents)`: an overpaid invoice exports a NEGATIVE
   * outstanding while Reports (core computeReceivables) and the invoice read say 0.
   * `it.fails` so the suite stays green over a reported defect; when it is fixed this
   * starts failing — flip it to `it` and delete the skip in assertSurfacesAgree.
   */
  it.fails("KNOWN DEFECT D2: an overpaid invoice exports the same outstanding (0) as Reports", async () => {
    const { a, inv } = await issuedInvoiceWithRetention(0);
    await pay(a.id, inv.id, inv.totalCents + 100_000);
    const summary = await env.svc.reports.getSummary(a.id, RANGE.from, RANGE.to);
    expect(summary.receivables.totalOutstandingCents).toBe(0);
    expect((await csvRow(a.id, inv.number))["Outstanding"]).toBe(money(0));
  });

  /**
   * KNOWN DEFECT D3 — invoices.service.ts `setRetentionReleased` writes only
   * `retentionReleasedAt`; it never re-derives `status`. An invoice PAID while
   * retention was held stays PAID after release although core says 115,000 is now
   * outstanding, and the overdue sweep only looks at INVOICED/PARTIAL, so it can
   * never go overdue either.
   */
  it.fails("KNOWN DEFECT D3: releasing retention re-derives the settled state", async () => {
    const { a, inv, token } = await issuedInvoiceWithRetention(10);
    await pay(a.id, inv.id, 1_035_000); // exactly what is due while retention is held
    expect((await assertSurfacesAgree(a.id, inv.id, token, 115_000)).inv.status).toBe(InvoiceStatus.PAID);

    await env.svc.invoices.setRetentionReleased(a.id, inv.id, true);
    const released = await env.svc.invoices.findOne(a.id, inv.id);
    expect(settlementOf(released).outstandingCents).toBe(115_000);
    await assertSurfacesAgree(a.id, inv.id, token, 115_000);
  });

  /**
   * KNOWN DEFECT D4 — payments.service.ts `recordManualPayment` has no status gate;
   * its twin `startCardPayment` refuses a DRAFT. A payment on a draft moves it to
   * PAID/PARTIAL, after which `finalize` refuses (not DRAFT), so the source quote
   * never becomes INVOICED and the totals are never re-derived at issue.
   */
  it.fails("KNOWN DEFECT D4: a manual payment is refused on a DRAFT invoice, like a card payment is", async () => {
    const { svc } = env;
    const { a } = await env.tenants();
    const draft = await svc.invoices.create(a.id, {
      sections: [],
      lineItems: [
        {
          category: LineCategory.OTHER,
          description: "Works",
          quantity: 1,
          rateUnit: RateUnit.JOB,
          unitPriceCents: 100_000,
          priceSource: "MANUAL",
          gctTreatment: "STANDARD",
        },
      ],
      discountPct: 0,
      depositCents: 0,
    } as never);
    expect((await failure(svc.payments.startCardPayment(a.id, draft.id))).status).toBe(400);
    expect((await failure(pay(a.id, draft.id, 100_000))).status).toBe(400);
  });
});
}
