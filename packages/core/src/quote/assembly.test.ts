import { describe, expect, it } from "vitest";
import { computeAssemblyUnitCostCents } from "./assembly.js";

describe("computeAssemblyUnitCostCents", () => {
  it("sums component qty*unitPrice with no markup", () => {
    const cents = computeAssemblyUnitCostCents({
      components: [
        // 0.1 bags cement/sq ft @ $1,200.00 = $120.00
        { quantityPerUnit: 0.1, unitPriceCents: 120_000 },
        // 0.05 days labour/sq ft @ $8,000.00 = $400.00
        { quantityPerUnit: 0.05, unitPriceCents: 800_000 },
      ],
    });
    expect(cents).toBe(12_000 + 40_000); // 52,000
  });

  it("applies markup on top of the summed component cost", () => {
    const cents = computeAssemblyUnitCostCents({
      components: [{ quantityPerUnit: 1, unitPriceCents: 100_000 }],
      markupPct: 20,
    });
    expect(cents).toBe(120_000);
  });

  it("rounds each component half-up before summing, then rounds the markup", () => {
    const cents = computeAssemblyUnitCostCents({
      components: [
        // 0.125 * 100 = 12.5 -> rounds to 13 cents
        { quantityPerUnit: 0.125, unitPriceCents: 100 },
      ],
      markupPct: 10,
    });
    // base = 13; markup = round(13 * 0.10) = round(1.3) = 1; total = 14
    expect(cents).toBe(14);
  });

  it("treats a missing/zero markup as no markup", () => {
    const cents = computeAssemblyUnitCostCents({
      components: [{ quantityPerUnit: 2, unitPriceCents: 50_000 }],
      markupPct: 0,
    });
    expect(cents).toBe(100_000);
  });

  it("returns 0 for an assembly with no components", () => {
    expect(computeAssemblyUnitCostCents({ components: [] })).toBe(0);
  });
});
