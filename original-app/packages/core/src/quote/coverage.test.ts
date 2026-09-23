import { describe, expect, it } from "vitest";
import { coverageBreakdown, sellUnitsRequired } from "./coverage.js";

describe("sellUnitsRequired", () => {
  it("rounds up to whole purchase units — you cannot buy 0.4 of a box", () => {
    // 400 sq ft measured, each box covers 12 sq ft -> 33.3 -> 34
    expect(sellUnitsRequired(400, 12, null)).toBe(34);
  });

  /**
   * The subtle one. Rounding up already buys a little extra, so it is tempting
   * to round first and call that the waste allowance. But on a job that
   * happens to divide evenly there IS no rounding slack, and a contractor who
   * set 10% waste would get exactly zero — discovering it on site, one box
   * short, with the tiler waiting.
   */
  it("applies waste BEFORE rounding so the allowance is not swallowed by it", () => {
    // 100 / 12 = 8.33 -> 9 without waste; +10% = 110/12 = 9.17 -> 10.
    expect(sellUnitsRequired(100, 12, null)).toBe(9);
    expect(sellUnitsRequired(100, 12, 10)).toBe(10);
  });

  it("still adds a full unit of waste on a job that divides exactly", () => {
    // 120 / 12 = 10 exactly, so rounding contributes nothing. Waste has to.
    expect(sellUnitsRequired(120, 12, null)).toBe(10);
    expect(sellUnitsRequired(120, 12, 10)).toBe(11);
  });

  it("returns null when no coverage is configured, which is the normal case", () => {
    expect(sellUnitsRequired(400, null, null)).toBeNull();
    expect(sellUnitsRequired(400, undefined, null)).toBeNull();
    expect(sellUnitsRequired(400, 0, null)).toBeNull();
    // Negative coverage is nonsense data; refuse rather than return a
    // negative order quantity that would read as a credit on the quote.
    expect(sellUnitsRequired(400, -12, null)).toBeNull();
  });

  it("returns 0 rather than NaN for a nonsense measured quantity", () => {
    expect(sellUnitsRequired(0, 12, null)).toBe(0);
    expect(sellUnitsRequired(Number.NaN, 12, null)).toBe(0);
    expect(sellUnitsRequired(-5, 12, null)).toBe(0);
  });
});

describe("coverageBreakdown", () => {
  it("shows the working the UI needs to explain the number", () => {
    const r = coverageBreakdown(40, 4, 10);
    // 40 + 10% = 44; 44 / 4 = 11 exactly, so nothing is added by rounding.
    expect(r).toEqual({ sellUnits: 11, withWasteQty: 44, roundedUpBy: 0 });
  });

  it("reports how much is bought purely because boxes are indivisible", () => {
    const r = coverageBreakdown(100, 12, 10);
    expect(r?.sellUnits).toBe(10);
    expect(r?.withWasteQty).toBeCloseTo(110);
    // 110/12 = 9.166..., so 0.833 of a box is bought only to reach a whole one.
    expect(r?.roundedUpBy).toBeCloseTo(10 - 110 / 12);
  });

  it("agrees with sellUnitsRequired, since the UI and the saved line must match", () => {
    for (const [qty, cov, waste] of [
      [400, 12, 0],
      [100, 12, 10],
      [120, 12, 10],
      [7, 2.5, 5],
      [0, 12, 10],
    ] as const) {
      expect(coverageBreakdown(qty, cov, waste)?.sellUnits).toBe(
        sellUnitsRequired(qty, cov, waste),
      );
    }
  });

  it("returns null on exactly the same condition, so callers branch once", () => {
    expect(coverageBreakdown(400, null, null)).toBeNull();
    expect(coverageBreakdown(400, 0, null)).toBeNull();
    expect(sellUnitsRequired(400, null, null)).toBeNull();
  });
});
