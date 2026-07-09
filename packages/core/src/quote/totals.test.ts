import { describe, expect, it } from "vitest";
import { GctTreatment } from "../types/enums.js";
import { computeTotals } from "./totals.js";
import { formatJmd } from "../tax/money.js";

describe("computeTotals", () => {
  it("sums lines, applies 15% GCT to standard lines only", () => {
    const t = computeTotals({
      gctRatePct: 15,
      lines: [
        // 10 bags cement @ $1,200.00 = $12,000.00 standard
        { quantity: 10, unitPriceCents: 120_000, gctTreatment: GctTreatment.STANDARD },
        // 2 days labour @ $8,000.00 = $16,000.00 (labour, but treat as standard here)
        { quantity: 2, unitPriceCents: 800_000, gctTreatment: GctTreatment.STANDARD },
        // exempt line, no GCT
        { quantity: 1, unitPriceCents: 500_000, gctTreatment: GctTreatment.EXEMPT },
      ],
    });
    expect(t.subtotalCents).toBe(1_200_000 + 1_600_000 + 500_000); // 3,300,000
    // taxable base = 2,800,000; GCT = 420,000
    expect(t.taxableBaseCents).toBe(2_800_000);
    expect(t.gctCents).toBe(420_000);
    expect(t.totalCents).toBe(3_720_000);
    expect(formatJmd(t.totalCents)).toBe("$37,200.00");
  });

  it("applies per-line markup before totalling", () => {
    const t = computeTotals({
      gctRatePct: 15,
      lines: [
        { quantity: 1, unitPriceCents: 100_000, markupPct: 20, gctTreatment: GctTreatment.STANDARD },
      ],
    });
    expect(t.subtotalCents).toBe(120_000);
    expect(t.gctCents).toBe(18_000);
    expect(t.totalCents).toBe(138_000);
  });

  it("discount reduces the taxable base proportionally", () => {
    const t = computeTotals({
      gctRatePct: 15,
      discountPct: 10,
      lines: [
        { quantity: 1, unitPriceCents: 1_000_000, gctTreatment: GctTreatment.STANDARD },
      ],
    });
    expect(t.discountCents).toBe(100_000);
    expect(t.taxableBaseCents).toBe(900_000);
    expect(t.gctCents).toBe(135_000);
    expect(t.totalCents).toBe(1_035_000);
  });

  it("deposit produces a balance due", () => {
    const t = computeTotals({
      gctRatePct: 0,
      depositCents: 50_000,
      lines: [{ quantity: 1, unitPriceCents: 200_000, gctTreatment: GctTreatment.EXEMPT }],
    });
    expect(t.totalCents).toBe(200_000);
    expect(t.balanceDueCents).toBe(150_000);
  });
});
