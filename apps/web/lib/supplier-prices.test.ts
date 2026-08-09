import { describe, expect, it } from "vitest";
import { cheapestPriceCents, priceDollarsToCents } from "./supplier-prices";

describe("cheapestPriceCents — which supplier row the panel flags", () => {
  it("returns null for an empty comparison, so nothing gets marked", () => {
    expect(cheapestPriceCents([])).toBeNull();
  });

  it("picks the lowest price from the API's cheapest-first order", () => {
    expect(
      cheapestPriceCents([{ priceCents: 115_000 }, { priceCents: 122_500 }, { priceCents: 130_000 }]),
    ).toBe(115_000);
  });

  it("does not trust the incoming order — an unsorted list still finds the minimum", () => {
    expect(
      cheapestPriceCents([{ priceCents: 130_000 }, { priceCents: 115_000 }, { priceCents: 122_500 }]),
    ).toBe(115_000);
  });

  it("returns a value two suppliers can both match, so a tie flags both rows", () => {
    const tied = [{ priceCents: 115_000 }, { priceCents: 115_000 }, { priceCents: 130_000 }];
    const cheapest = cheapestPriceCents(tied);
    expect(tied.filter((p) => p.priceCents === cheapest)).toHaveLength(2);
  });

  it("handles a single row", () => {
    expect(cheapestPriceCents([{ priceCents: 245_000 }])).toBe(245_000);
  });

  it("treats a free/zero price as a real minimum rather than falsy", () => {
    expect(cheapestPriceCents([{ priceCents: 115_000 }, { priceCents: 0 }])).toBe(0);
  });
});

describe("priceDollarsToCents — the record-a-price input boundary", () => {
  it("converts whole dollars", () => {
    expect(priceDollarsToCents("1150")).toBe(115_000);
  });

  it("converts cents without leaving a floating-point remainder", () => {
    expect(priceDollarsToCents("1150.55")).toBe(115_055);
    // 0.07 * 100 is 7.000000000000001 in binary floating point — the rounding
    // is what stops a fractional cent reaching the API's integer field.
    expect(priceDollarsToCents("0.07")).toBe(7);
    expect(priceDollarsToCents("8.115")).toBe(812);
  });

  it("rounds sub-cent input rather than storing a fractional cent", () => {
    expect(priceDollarsToCents("10.004")).toBe(1000);
    expect(priceDollarsToCents("10.006")).toBe(1001);
  });

  it("yields 0 for blank or non-numeric input, which the panel rejects", () => {
    expect(priceDollarsToCents("")).toBe(0);
    expect(priceDollarsToCents("   ")).toBe(0);
    expect(priceDollarsToCents("abc")).toBe(0);
  });

  it("matches the idiom used by the material form, so the same typing gives the same cents", () => {
    const asMaterialFormDoesIt = (d: string) => Math.round((Number(d) || 0) * 100);
    for (const input of ["", "0", "12", "12.5", "12.34", "9999.99"]) {
      expect(priceDollarsToCents(input)).toBe(asMaterialFormDoesIt(input));
    }
  });
});
