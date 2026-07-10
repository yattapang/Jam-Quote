import { describe, expect, it } from "vitest";
import {
  GctTreatment,
  LineCategory,
  PriceSource,
  QuoteStatus,
  RateUnit,
} from "@jamquote/core";
import {
  categorySubtotalCents,
  getQuoteTotals,
  groupLinesByCategory,
} from "./quote-totals";
import type { Quote } from "./types";

const quote: Quote = {
  id: "q1",
  num: "QT-0001",
  clientId: "c1",
  jobLabel: "Retaining wall",
  status: QuoteStatus.DRAFT,
  gctRatePct: 15,
  discountPct: 0,
  depositCents: 0,
  createdLabel: "",
  validUntilLabel: "",
  lines: [
    {
      id: "l1",
      category: LineCategory.MATERIAL,
      description: "Carib Cement, 42.5kg bag",
      quantity: 10,
      rateUnit: RateUnit.UNIT,
      unitPriceCents: 120_000,
      priceSource: PriceSource.MANUAL,
      gctTreatment: GctTreatment.STANDARD,
    },
    {
      id: "l2",
      category: LineCategory.LABOUR,
      description: "Mason · 2 days",
      quantity: 2,
      rateUnit: RateUnit.DAY,
      unitPriceCents: 800_000,
      priceSource: PriceSource.MANUAL,
      gctTreatment: GctTreatment.STANDARD,
    },
  ],
};

describe("getQuoteTotals", () => {
  it("delegates to @jamquote/core computeTotals", () => {
    const t = getQuoteTotals(quote);
    expect(t.subtotalCents).toBe(2_800_000); // 1,200,000 + 1,600,000
    expect(t.gctCents).toBe(420_000); // 15% of standard base
    expect(t.totalCents).toBe(3_220_000);
  });
});

describe("categorySubtotalCents", () => {
  it("sums the after-markup amount for one category", () => {
    const t = getQuoteTotals(quote);
    expect(categorySubtotalCents(quote, t, LineCategory.MATERIAL)).toBe(1_200_000);
    expect(categorySubtotalCents(quote, t, LineCategory.LABOUR)).toBe(1_600_000);
    expect(categorySubtotalCents(quote, t, LineCategory.EQUIPMENT)).toBe(0);
  });
});

describe("groupLinesByCategory", () => {
  it("groups present categories in canonical order, skipping empty ones", () => {
    const groups = groupLinesByCategory(quote);
    expect(groups.map((g) => g.category)).toEqual([
      LineCategory.MATERIAL,
      LineCategory.LABOUR,
    ]);
    expect(groups[0]?.lines).toHaveLength(1);
  });
});
