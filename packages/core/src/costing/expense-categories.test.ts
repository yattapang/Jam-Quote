import { describe, expect, it } from "vitest";
import { PURCHASE_CATEGORY_SUGGESTIONS, groupByCategory } from "./expense-categories.js";

const p = (amountCents: number, category?: string | null) => ({ amountCents, category });

describe("groupByCategory", () => {
  it("sums each category", () => {
    const out = groupByCategory([p(1000, "Materials"), p(500, "Materials"), p(300, "Tools")]);
    expect(out).toEqual([
      { category: "Materials", totalCents: 1500, count: 2 },
      { category: "Tools", totalCents: 300, count: 1 },
    ]);
  });

  it("treats casing and padding as the same category", () => {
    // The drift the suggestions reduce but cannot prevent — someone will
    // always type it themselves.
    const out = groupByCategory([p(100, "Cement"), p(100, " cement "), p(100, "CEMENT")]);
    expect(out).toHaveLength(1);
    expect(out[0]?.totalCents).toBe(300);
  });

  it("keeps the FIRST spelling as the label", () => {
    // So the list reads in the contractor's own words rather than a
    // normalised one they never typed.
    expect(groupByCategory([p(100, "Cement"), p(100, "CEMENT")])[0]?.category).toBe("Cement");
  });

  it("collapses blank and missing into one Uncategorised bucket", () => {
    const out = groupByCategory([p(100), p(100, ""), p(100, "   "), p(100, null)]);
    expect(out).toEqual([{ category: "Uncategorised", totalCents: 400, count: 4 }]);
  });

  it("sorts largest first — where the money went, not alphabetical", () => {
    const out = groupByCategory([p(100, "Tools"), p(900, "Materials"), p(500, "Labour")]);
    expect(out.map((g) => g.category)).toEqual(["Materials", "Labour", "Tools"]);
  });

  it("is empty for no purchases", () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it("offers categories a Jamaican contractor would actually use", () => {
    expect(PURCHASE_CATEGORY_SUGGESTIONS).toContain("Subcontractor");
    expect(PURCHASE_CATEGORY_SUGGESTIONS).toContain("Transport & fuel");
  });
});
