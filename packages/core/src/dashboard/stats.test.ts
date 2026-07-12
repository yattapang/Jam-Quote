import { describe, expect, it } from "vitest";
import { QuoteStatus } from "../types/enums.js";
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
      NOW,
    );
    expect(stats.quotesThisMonth).toBe(2);
  });

  it("overdueInvoicesCents is always 0 — no invoicing backend yet", () => {
    const stats = computeDashboardStats(
      [quote({ status: QuoteStatus.INVOICED, totalCents: 1_000_000 })],
      NOW,
    );
    expect(stats.overdueInvoicesCents).toBe(0);
  });
});
