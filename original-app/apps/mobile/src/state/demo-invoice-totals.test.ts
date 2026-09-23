import { describe, expect, it } from "vitest";
import { DEMO_LINE_BREAKDOWN, demoTotals } from "./demo-invoice-totals";

/**
 * The invoice-detail preview screen used to hard-code an amount due
 * ($183,540.80) that did not match what its own line breakdown summed to
 * ($183,540.00), and listed GCT above the discount it is actually computed
 * after. Both are now derived from computeTotals, so they cannot drift.
 */
describe("demo invoice totals", () => {
  it("the amount due equals what the line breakdown actually sums to", () => {
    const breakdownSum = DEMO_LINE_BREAKDOWN.reduce((sum, row) => sum + row.cents, 0);
    expect(demoTotals.totalCents).toBe(breakdownSum);
  });

  it("is the correct total for the demo figures ($183,540.00, not $183,540.80)", () => {
    expect(demoTotals.totalCents).toBe(18_354_000);
  });

  it("lists the discount before GCT, matching the order GCT is actually computed in", () => {
    const labels = DEMO_LINE_BREAKDOWN.map((row) => row.label);
    const discountIndex = labels.findIndex((l) => l.startsWith("Discount"));
    const gctIndex = labels.findIndex((l) => l.startsWith("GCT"));
    expect(discountIndex).toBeGreaterThanOrEqual(0);
    expect(gctIndex).toBeGreaterThan(discountIndex);
  });
});
