import { describe, expect, it } from "vitest";
import { InvoiceStatus, PROJECT_STAGES, ProjectStage, QuoteStatus } from "../types/enums.js";
import {
  computeReportsSummary,
  type ReportInvoice,
  type ReportJob,
  type ReportPayment,
  type ReportQuote,
  type ReportsRange,
} from "./summary.js";

// Fixed "now" so overdue/receivables tests are deterministic regardless of
// when the suite runs.
const NOW = new Date("2026-08-13T12:00:00.000Z");

// August 2026, Jamaica-local calendar month, expressed as UTC instants.
// Jamaica is UTC-5, so the range boundaries below are 05:00 UTC.
const AUGUST: ReportsRange = {
  fromIso: "2026-08-01T05:00:00.000Z", // 2026-08-01 00:00 Jamaica
  toIso: "2026-09-01T05:00:00.000Z", // 2026-09-01 00:00 Jamaica (exclusive)
};

function quote(overrides: Partial<ReportQuote> = {}): ReportQuote {
  return {
    status: QuoteStatus.DRAFT,
    totalCents: 0,
    createdAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

function invoice(overrides: Partial<ReportInvoice> = {}): ReportInvoice {
  return {
    status: InvoiceStatus.INVOICED,
    totalCents: 0,
    paidCents: 0,
    createdAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

function payment(overrides: Partial<ReportPayment> = {}): ReportPayment {
  return {
    amountCents: 0,
    paidAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

function job(overrides: Partial<ReportJob> = {}): ReportJob {
  return {
    stage: ProjectStage.QUOTED,
    createdAt: "2026-08-10T12:00:00.000Z",
    ...overrides,
  };
}

const EMPTY_INPUT = { quotes: [], invoices: [], payments: [], jobs: [] };

function must<T>(value: T | undefined, msg = "expected value"): T {
  if (value === undefined) throw new Error(`${msg}: missing`);
  return value;
}

describe("computeReportsSummary", () => {
  describe("empty input", () => {
    it("returns zeroes rather than throwing", () => {
      const s = computeReportsSummary(EMPTY_INPUT, AUGUST, NOW);
      expect(s.quotes).toEqual({
        sentCount: 0,
        sentValueCents: 0,
        acceptedCount: 0,
        acceptedValueCents: 0,
        winRatePct: 0,
      });
      expect(s.revenue).toEqual({ invoicedCents: 0, collectedCents: 0 });
      expect(s.receivables.totalOutstandingCents).toBe(0);
      expect(s.receivables.totalOverdueCents).toBe(0);
      expect(s.receivables.outstandingByClient).toEqual([]);
      expect(s.jobs.jobsCreated).toBe(0);
      expect(s.jobs.topClientsByJobs).toEqual([]);
    });

    it("still zero-fills every month bucket and every job stage", () => {
      const s = computeReportsSummary(EMPTY_INPUT, AUGUST, NOW);
      expect(s.salesByMonth).toHaveLength(1);
      expect(s.salesByMonth[0]).toEqual({
        monthIso: "2026-08",
        invoicedCents: 0,
        collectedCents: 0,
      });
      for (const stage of PROJECT_STAGES) {
        expect(s.jobs.jobsByStage[stage]).toBe(0);
      }
    });
  });

  describe("quote funnel / win rate", () => {
    it("INVOICED counts as won, alongside ACCEPTED", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          quotes: [
            quote({ status: QuoteStatus.SENT, totalCents: 100_000 }),
            quote({ status: QuoteStatus.ACCEPTED, totalCents: 200_000 }),
            quote({ status: QuoteStatus.INVOICED, totalCents: 300_000 }),
          ],
        },
        AUGUST,
        NOW,
      );
      // 3 sent, 2 won (ACCEPTED + INVOICED) -> 67%.
      expect(s.quotes.sentCount).toBe(3);
      expect(s.quotes.acceptedCount).toBe(2);
      expect(s.quotes.acceptedValueCents).toBe(500_000);
      expect(s.quotes.winRatePct).toBe(67);
    });

    it("a quote that stays DRAFT never counts as sent", () => {
      const s = computeReportsSummary(
        { ...EMPTY_INPUT, quotes: [quote({ status: QuoteStatus.DRAFT, totalCents: 999_999 })] },
        AUGUST,
        NOW,
      );
      expect(s.quotes.sentCount).toBe(0);
      expect(s.quotes.sentValueCents).toBe(0);
    });

    it("winRatePct is 0, not NaN, when nothing was sent", () => {
      const s = computeReportsSummary(
        { ...EMPTY_INPUT, quotes: [quote({ status: QuoteStatus.DRAFT })] },
        AUGUST,
        NOW,
      );
      expect(s.quotes.winRatePct).toBe(0);
      expect(Number.isNaN(s.quotes.winRatePct)).toBe(false);
    });

    it("DECLINED and EXPIRED count as sent but not accepted", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          quotes: [
            quote({ status: QuoteStatus.DECLINED, totalCents: 100_000 }),
            quote({ status: QuoteStatus.EXPIRED, totalCents: 100_000 }),
          ],
        },
        AUGUST,
        NOW,
      );
      expect(s.quotes.sentCount).toBe(2);
      expect(s.quotes.acceptedCount).toBe(0);
      expect(s.quotes.winRatePct).toBe(0);
    });

    it("ignores quotes created outside the range", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          quotes: [
            quote({ status: QuoteStatus.ACCEPTED, createdAt: "2026-07-31T12:00:00.000Z" }),
          ],
        },
        AUGUST,
        NOW,
      );
      expect(s.quotes.sentCount).toBe(0);
    });
  });

  describe("revenue: invoiced vs collected", () => {
    it("a DRAFT invoice is excluded from invoiced revenue", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [
            invoice({ status: InvoiceStatus.DRAFT, totalCents: 500_000 }),
            invoice({ status: InvoiceStatus.INVOICED, totalCents: 300_000 }),
          ],
        },
        AUGUST,
        NOW,
      );
      expect(s.revenue.invoicedCents).toBe(300_000);
    });

    it("collected comes from payments, not from Invoice.paidCents", () => {
      // Invoice created in March, fully paid, but paidCents has no date of
      // its own — only the payment row (paidAt in August) should show up as
      // August cash collected.
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [
            invoice({
              status: InvoiceStatus.PAID,
              totalCents: 400_000,
              paidCents: 400_000,
              createdAt: "2026-03-01T12:00:00.000Z",
            }),
          ],
          payments: [payment({ amountCents: 400_000, paidAt: "2026-08-05T12:00:00.000Z" })],
        },
        AUGUST,
        NOW,
      );
      // Not invoiced in August (created in March) ...
      expect(s.revenue.invoicedCents).toBe(0);
      // ... but the cash lands in August because that's when it was paid.
      expect(s.revenue.collectedCents).toBe(400_000);
      const aug = must(s.salesByMonth.find((m) => m.monthIso === "2026-08"));
      expect(aug.collectedCents).toBe(400_000);
      expect(aug.invoicedCents).toBe(0);
    });

    it("a payment outside the range is not collected revenue for this period", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          payments: [payment({ amountCents: 100_000, paidAt: "2026-07-31T12:00:00.000Z" })],
        },
        AUGUST,
        NOW,
      );
      expect(s.revenue.collectedCents).toBe(0);
    });
  });

  describe("receivables (outstandingByClient)", () => {
    it("ignores the reporting range — an old invoice still shows as owed", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [
            invoice({
              status: InvoiceStatus.INVOICED,
              totalCents: 500_000,
              paidCents: 0,
              createdAt: "2025-01-01T00:00:00.000Z", // long before AUGUST
              clientId: "c1",
              clientName: "Acme Co",
            }),
          ],
        },
        AUGUST,
        NOW,
      );
      expect(s.receivables.totalOutstandingCents).toBe(500_000);
      expect(s.receivables.outstandingByClient).toHaveLength(1);
    });

    it("splits overdue vs current, and a null dueDate is never overdue", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [
            invoice({
              totalCents: 100_000,
              paidCents: 0,
              dueDate: "2026-07-01T00:00:00.000Z", // before NOW -> overdue
              clientId: "c1",
              clientName: "Overdue Client",
            }),
            invoice({
              totalCents: 200_000,
              paidCents: 0,
              dueDate: "2026-12-01T00:00:00.000Z", // after NOW -> current
              clientId: "c2",
              clientName: "Current Client",
            }),
            invoice({
              totalCents: 300_000,
              paidCents: 0,
              dueDate: null, // never overdue
              clientId: "c3",
              clientName: "No Due Date Client",
            }),
          ],
        },
        AUGUST,
        NOW,
      );
      expect(s.receivables.totalOutstandingCents).toBe(600_000);
      expect(s.receivables.totalOverdueCents).toBe(100_000);

      const overdueEntry = must(
        s.receivables.outstandingByClient.find((c) => c.clientId === "c1"),
      );
      expect(overdueEntry.overdueCents).toBe(100_000);

      const currentEntry = must(
        s.receivables.outstandingByClient.find((c) => c.clientId === "c2"),
      );
      expect(currentEntry.overdueCents).toBe(0);

      const noDueDateEntry = must(
        s.receivables.outstandingByClient.find((c) => c.clientId === "c3"),
      );
      expect(noDueDateEntry.overdueCents).toBe(0);
    });

    it("only the unpaid remainder counts, and a fully paid invoice drops out", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [
            invoice({ totalCents: 100_000, paidCents: 40_000, clientId: "c1", clientName: "A" }),
            invoice({ totalCents: 100_000, paidCents: 100_000, clientId: "c1", clientName: "A" }),
          ],
        },
        AUGUST,
        NOW,
      );
      expect(s.receivables.totalOutstandingCents).toBe(60_000);
      expect(s.receivables.outstandingByClient).toHaveLength(1);
      expect(must(s.receivables.outstandingByClient[0]).invoiceCount).toBe(1);
    });

    it("groups client-less invoices under the 'No client' bucket", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [
            invoice({ totalCents: 50_000, paidCents: 0, clientId: null }),
            invoice({ totalCents: 25_000, paidCents: 0, clientId: undefined }),
          ],
        },
        AUGUST,
        NOW,
      );
      expect(s.receivables.outstandingByClient).toHaveLength(1);
      const bucket = must(s.receivables.outstandingByClient[0]);
      expect(bucket.clientId).toBeNull();
      expect(bucket.clientName).toBe("No client");
      expect(bucket.outstandingCents).toBe(75_000);
      expect(bucket.invoiceCount).toBe(2);
    });

    it("sorts clients by outstandingCents descending", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [
            invoice({ totalCents: 100_000, paidCents: 0, clientId: "small", clientName: "Small" }),
            invoice({ totalCents: 900_000, paidCents: 0, clientId: "big", clientName: "Big" }),
          ],
        },
        AUGUST,
        NOW,
      );
      expect(s.receivables.outstandingByClient.map((c) => c.clientId)).toEqual(["big", "small"]);
    });

    it("a DRAFT invoice is never outstanding", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [invoice({ status: InvoiceStatus.DRAFT, totalCents: 500_000, paidCents: 0 })],
        },
        AUGUST,
        NOW,
      );
      expect(s.receivables.totalOutstandingCents).toBe(0);
    });
  });

  describe("salesByMonth", () => {
    it("zero-fills months with no activity across a multi-month range", () => {
      const range: ReportsRange = {
        fromIso: "2026-06-01T05:00:00.000Z", // June 1 Jamaica
        toIso: "2026-09-01T05:00:00.000Z", // Sept 1 Jamaica (exclusive)
      };
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [
            invoice({
              status: InvoiceStatus.INVOICED,
              totalCents: 100_000,
              createdAt: "2026-06-15T12:00:00.000Z",
            }),
          ],
        },
        range,
        NOW,
      );
      expect(s.salesByMonth.map((m) => m.monthIso)).toEqual(["2026-06", "2026-07", "2026-08"]);
      expect(must(s.salesByMonth.find((m) => m.monthIso === "2026-06")).invoicedCents).toBe(
        100_000,
      );
      expect(must(s.salesByMonth.find((m) => m.monthIso === "2026-07")).invoicedCents).toBe(0);
      expect(must(s.salesByMonth.find((m) => m.monthIso === "2026-08")).invoicedCents).toBe(0);
    });

    it("buckets by Jamaica local time: late on the last day of a month stays in that month", () => {
      // 2026-08-31 23:30 Jamaica local = 2026-09-01 04:30 UTC — still before
      // September starts in Jamaica, so this must land in August, not
      // September, even though the UTC calendar date has already rolled
      // over to September.
      const lateAugustUtc = "2026-09-01T04:30:00.000Z";
      const range: ReportsRange = {
        fromIso: "2026-08-01T05:00:00.000Z",
        toIso: "2026-09-01T05:00:00.000Z",
      };
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [
            invoice({
              status: InvoiceStatus.INVOICED,
              totalCents: 77_000,
              createdAt: lateAugustUtc,
            }),
          ],
        },
        range,
        NOW,
      );
      expect(s.salesByMonth).toHaveLength(1);
      const aug = must(s.salesByMonth.find((m) => m.monthIso === "2026-08"));
      expect(aug.invoicedCents).toBe(77_000);
    });

    it("collectedCents in a bucket comes from payments, invoicedCents from invoices", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          invoices: [
            invoice({
              status: InvoiceStatus.INVOICED,
              totalCents: 100_000,
              createdAt: "2026-08-05T12:00:00.000Z",
            }),
          ],
          payments: [payment({ amountCents: 60_000, paidAt: "2026-08-06T12:00:00.000Z" })],
        },
        AUGUST,
        NOW,
      );
      const aug = must(s.salesByMonth.find((m) => m.monthIso === "2026-08"));
      expect(aug.invoicedCents).toBe(100_000);
      expect(aug.collectedCents).toBe(60_000);
    });
  });

  describe("jobs", () => {
    it("counts jobs created in range and zero-fills every ProjectStage", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          jobs: [
            job({ stage: ProjectStage.WON, createdAt: "2026-08-05T12:00:00.000Z" }),
            job({ stage: ProjectStage.WON, createdAt: "2026-08-06T12:00:00.000Z" }),
            job({ stage: ProjectStage.COMPLETE, createdAt: "2026-08-07T12:00:00.000Z" }),
            // Outside range -> excluded.
            job({ stage: ProjectStage.QUOTED, createdAt: "2026-07-01T12:00:00.000Z" }),
          ],
        },
        AUGUST,
        NOW,
      );
      expect(s.jobs.jobsCreated).toBe(3);
      expect(s.jobs.jobsByStage[ProjectStage.WON]).toBe(2);
      expect(s.jobs.jobsByStage[ProjectStage.COMPLETE]).toBe(1);
      expect(s.jobs.jobsByStage[ProjectStage.QUOTED]).toBe(0);
      expect(s.jobs.jobsByStage[ProjectStage.CANCELLED]).toBe(0);
      // Every stage present, even ones with zero jobs.
      for (const stage of PROJECT_STAGES) {
        expect(s.jobs.jobsByStage[stage]).toBeTypeOf("number");
      }
    });

    it("topClientsByJobs sorts by count desc, ties broken by name", () => {
      const s = computeReportsSummary(
        {
          ...EMPTY_INPUT,
          jobs: [
            job({ clientId: "z", clientName: "Zeta", createdAt: "2026-08-01T12:00:00.000Z" }),
            job({ clientId: "a", clientName: "Alpha", createdAt: "2026-08-02T12:00:00.000Z" }),
            job({ clientId: "b", clientName: "Beta", createdAt: "2026-08-03T12:00:00.000Z" }),
            job({ clientId: "b", clientName: "Beta", createdAt: "2026-08-04T12:00:00.000Z" }),
          ],
        },
        AUGUST,
        NOW,
      );
      // Beta has 2 jobs (wins outright); Alpha and Zeta tie at 1 and are
      // broken alphabetically.
      expect(s.jobs.topClientsByJobs.map((c) => c.clientId)).toEqual(["b", "a", "z"]);
      expect(must(s.jobs.topClientsByJobs[0]).jobCount).toBe(2);
    });

    it("includes a null-client bucket only when such jobs exist", () => {
      const withNullClient = computeReportsSummary(
        { ...EMPTY_INPUT, jobs: [job({ clientId: null, createdAt: "2026-08-01T12:00:00.000Z" })] },
        AUGUST,
        NOW,
      );
      expect(withNullClient.jobs.topClientsByJobs).toHaveLength(1);
      expect(must(withNullClient.jobs.topClientsByJobs[0]).clientId).toBeNull();
      expect(must(withNullClient.jobs.topClientsByJobs[0]).clientName).toBe("No client");

      const withoutAnyJobs = computeReportsSummary(EMPTY_INPUT, AUGUST, NOW);
      expect(withoutAnyJobs.jobs.topClientsByJobs).toEqual([]);
    });

    it("caps topClientsByJobs at 10 clients", () => {
      const jobs: ReportJob[] = [];
      for (let i = 0; i < 15; i++) {
        jobs.push(
          job({
            clientId: `client-${i}`,
            clientName: `Client ${i}`,
            createdAt: "2026-08-01T12:00:00.000Z",
          }),
        );
      }
      const s = computeReportsSummary({ ...EMPTY_INPUT, jobs }, AUGUST, NOW);
      expect(s.jobs.topClientsByJobs).toHaveLength(10);
    });
  });

  // The headline revenue figures and the monthly buckets come from separate
  // passes, and those passes disagree about what a "month" is: the headline
  // filters absolute timestamps against the range, while the buckets key off
  // the Jamaica-local calendar month. The two views must still reconcile, or
  // the chart will visibly fail to add up to the totals printed right above
  // it — the kind of discrepancy that makes a contractor stop trusting the
  // whole page. The case that exercises it is a range whose boundaries are
  // NOT Jamaica-midnight, so an instant can sit inside the range while
  // belonging to a neighbouring calendar month.
  describe("salesByMonth reconciles with the headline revenue totals", () => {
    it("sums to the same figures across an awkward, non-midnight range", () => {
      const range: ReportsRange = {
        // UTC midnight, i.e. 7pm Jamaica the previous evening, so the first
        // and last buckets are partial months.
        fromIso: "2026-06-01T00:00:00.000Z",
        toIso: "2026-09-01T00:00:00.000Z",
      };
      const invoices = [
        invoice({ totalCents: 250_000, createdAt: "2026-06-01T02:00:00.000Z" }), // 31 May 9pm JA
        invoice({ totalCents: 400_000, createdAt: "2026-06-15T12:00:00.000Z" }),
        invoice({ totalCents: 125_000, createdAt: "2026-07-31T23:30:00.000Z" }), // 31 Jul 6:30pm JA
        invoice({ totalCents: 900_000, createdAt: "2026-08-31T23:00:00.000Z" }), // 31 Aug 6pm JA
        // Excluded on status, so it must be absent from both views alike.
        invoice({ status: InvoiceStatus.DRAFT, totalCents: 777_000, createdAt: "2026-07-02T12:00:00.000Z" }),
      ];
      const payments = [
        payment({ amountCents: 100_000, paidAt: "2026-06-02T12:00:00.000Z" }),
        payment({ amountCents: 50_000, paidAt: "2026-07-31T23:45:00.000Z" }),
        payment({ amountCents: 325_000, paidAt: "2026-08-20T12:00:00.000Z" }),
      ];

      const s = computeReportsSummary({ ...EMPTY_INPUT, invoices, payments }, range, NOW);

      const bucketedInvoiced = s.salesByMonth.reduce((sum, m) => sum + m.invoicedCents, 0);
      const bucketedCollected = s.salesByMonth.reduce((sum, m) => sum + m.collectedCents, 0);

      expect(bucketedInvoiced).toBe(s.revenue.invoicedCents);
      expect(bucketedCollected).toBe(s.revenue.collectedCents);
      // Pinned outright as well, so a change that breaks BOTH sides in the
      // same direction still fails rather than staying self-consistently wrong.
      expect(s.revenue.invoicedCents).toBe(1_675_000);
      expect(s.revenue.collectedCents).toBe(475_000);
    });
  });
});
