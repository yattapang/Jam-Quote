import { describe, expect, it } from "vitest";
import { InvoiceStatus, QuoteStatus } from "../types/enums.js";
import type { ReportInvoice } from "../reports/summary.js";
import { computeDashboardStats, type DashboardStatInput } from "./stats.js";

// Fixed "now" so every test is deterministic regardless of when it runs.
const NOW = new Date("2026-07-12T12:00:00.000Z");

function quote(overrides: Partial<DashboardStatInput> = {}): DashboardStatInput {
  return {
    status: QuoteStatus.DRAFT,
    totalCents: 0,
    createdAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

function invoice(overrides: Partial<ReportInvoice> = {}): ReportInvoice {
  return {
    status: InvoiceStatus.INVOICED,
    totalCents: 0,
    paidCents: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computeDashboardStats", () => {
  it("pipelineValueCents sums only SENT and VIEWED quotes", () => {
    const stats = computeDashboardStats(
      [
        quote({ status: QuoteStatus.SENT, totalCents: 100_000 }),
        quote({ status: QuoteStatus.VIEWED, totalCents: 200_000 }),
        quote({ status: QuoteStatus.DRAFT, totalCents: 999_999 }),
        quote({ status: QuoteStatus.ACCEPTED, totalCents: 999_999 }),
        quote({ status: QuoteStatus.DECLINED, totalCents: 999_999 }),
        quote({ status: QuoteStatus.EXPIRED, totalCents: 999_999 }),
        quote({ status: QuoteStatus.INVOICED, totalCents: 999_999 }),
      ],
      [],
      NOW,
    );
    expect(stats.pipelineValueCents).toBe(300_000);
  });

  it("winRatePct90d is the accepted share of terminal quotes within 90 days", () => {
    const stats = computeDashboardStats(
      [
        quote({ status: QuoteStatus.ACCEPTED, createdAt: "2026-07-01T00:00:00.000Z" }),
        quote({ status: QuoteStatus.ACCEPTED, createdAt: "2026-06-01T00:00:00.000Z" }),
        quote({ status: QuoteStatus.DECLINED, createdAt: "2026-06-15T00:00:00.000Z" }),
        quote({ status: QuoteStatus.EXPIRED, createdAt: "2026-06-20T00:00:00.000Z" }),
        // Not terminal — should be ignored regardless of date.
        quote({ status: QuoteStatus.SENT, createdAt: "2026-07-01T00:00:00.000Z" }),
      ],
      [],
      NOW,
    );
    // 4 terminal quotes in the last 90 days, 2 accepted -> 50%.
    expect(stats.winRatePct90d).toBe(50);
  });

  it("winRatePct90d excludes terminal quotes older than the 90-day cutoff", () => {
    const stats = computeDashboardStats(
      [
        quote({ status: QuoteStatus.ACCEPTED, createdAt: "2026-07-01T00:00:00.000Z" }),
        // Older than 90 days before NOW (2026-07-12) -> excluded.
        quote({ status: QuoteStatus.DECLINED, createdAt: "2026-01-01T00:00:00.000Z" }),
      ],
      [],
      NOW,
    );
    expect(stats.winRatePct90d).toBe(100);
  });

  it("winRatePct90d returns 0 when there is no terminal quote in the window (avoids divide-by-zero)", () => {
    const stats = computeDashboardStats(
      [
        quote({ status: QuoteStatus.DRAFT }),
        quote({ status: QuoteStatus.SENT }),
        quote({ status: QuoteStatus.VIEWED }),
      ],
      [],
      NOW,
    );
    expect(stats.winRatePct90d).toBe(0);
  });

  it("quotesThisMonth counts quotes created on/after the 1st of now's month", () => {
    const stats = computeDashboardStats(
      [
        quote({ createdAt: "2026-07-01T00:00:00.000Z" }), // exactly month start -> included
        quote({ createdAt: "2026-07-12T11:59:00.000Z" }), // same day as now -> included
        quote({ createdAt: "2026-06-30T23:59:59.999Z" }), // last day of prior month -> excluded
        quote({ createdAt: "2026-05-15T00:00:00.000Z" }), // well before -> excluded
      ],
      [],
      NOW,
    );
    expect(stats.quotesThisMonth).toBe(2);
  });

  describe("overdueInvoicesCents", () => {
    it("is 0 when there are no invoices at all", () => {
      const stats = computeDashboardStats(
        [quote({ status: QuoteStatus.INVOICED, totalCents: 1_000_000 })],
        [],
        NOW,
      );
      expect(stats.overdueInvoicesCents).toBe(0);
    });

    it("sums the unpaid remainder of invoices past their due date", () => {
      const stats = computeDashboardStats(
        [],
        [
          // Past due but part-paid: only the REMAINDER is overdue, not the
          // full face value of the invoice.
          invoice({ totalCents: 500_000, paidCents: 200_000, dueDate: "2026-06-30T00:00:00.000Z" }),
          invoice({ totalCents: 150_000, dueDate: "2026-07-01T00:00:00.000Z" }),
        ],
        NOW,
      );
      expect(stats.overdueInvoicesCents).toBe(450_000);
    });

    it("ignores invoices not yet due, fully paid, still draft, or with no due date", () => {
      const stats = computeDashboardStats(
        [],
        [
          invoice({ totalCents: 900_000, dueDate: "2026-08-30T00:00:00.000Z" }), // not due yet
          invoice({ totalCents: 900_000, paidCents: 900_000, dueDate: "2026-01-01T00:00:00.000Z" }), // settled
          invoice({
            status: InvoiceStatus.DRAFT,
            totalCents: 900_000,
            dueDate: "2026-01-01T00:00:00.000Z",
          }), // not a claim on anyone yet
          invoice({ totalCents: 900_000, dueDate: null }), // nothing to be late against
        ],
        NOW,
      );
      expect(stats.overdueInvoicesCents).toBe(0);
    });

    // The regression this change exists to prevent. The card previously
    // returned a hardcoded 0 behind a "no invoicing backend yet" TODO, so it
    // told every contractor they were owed nothing regardless of the
    // database. Note that a test passing only empty invoices would still pass
    // against that hardcoded 0 — so this one insists a NON-zero figure
    // actually reaches the card.
    it("reports real money rather than a placeholder zero", () => {
      const stats = computeDashboardStats(
        [],
        [invoice({ totalCents: 1_000_000, dueDate: "2026-05-01T00:00:00.000Z" })],
        NOW,
      );
      expect(stats.overdueInvoicesCents).toBe(1_000_000);
    });
  });
});
