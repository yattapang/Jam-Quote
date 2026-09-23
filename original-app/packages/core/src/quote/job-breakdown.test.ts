import { describe, expect, it } from "vitest";
import {
  componentQuantityLabel,
  groupJobComponents,
  type JobComponentSnapshot,
} from "./job-breakdown.js";

function c(over: Partial<JobComponentSnapshot> = {}): JobComponentSnapshot {
  return {
    kind: "MATERIAL",
    description: "Cement, 42.5kg bag",
    quantityPerUnit: 1,
    unitPriceCents: 125_000,
    ...over,
  };
}

describe("groupJobComponents", () => {
  it("merges identical components and sums their quantity", () => {
    // The reported case: a job holding two bags of cement rendered as two
    // separate one-bag rows on the invoice.
    const grouped = groupJobComponents([c(), c()]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.quantityPerUnit).toBe(2);
  });

  it("keeps a different description apart", () => {
    // "Cement — foundation" and "Cement — render" are different things even at
    // the same price; merging them would invent a line nobody wrote.
    const grouped = groupJobComponents([
      c({ description: "Cement — foundation" }),
      c({ description: "Cement — render" }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it("keeps the same material at different prices apart", () => {
    // Two captures at different moments. Merging would have to pick one price
    // and silently misstate the other.
    const grouped = groupJobComponents([c(), c({ unitPriceCents: 130_000 })]);
    expect(grouped).toHaveLength(2);
  });

  it("keeps material and labour apart even if described identically", () => {
    const grouped = groupJobComponents([c({ kind: "MATERIAL" }), c({ kind: "LABOUR" })]);
    expect(grouped).toHaveLength(2);
  });

  it("preserves first-appearance order", () => {
    const grouped = groupJobComponents([
      c({ description: "Sand" }),
      c({ description: "Cement" }),
      c({ description: "Sand" }),
    ]);
    expect(grouped.map((g) => g.description)).toEqual(["Sand", "Cement"]);
  });

  /**
   * The invariant that makes this safe to apply at render time: grouping is
   * presentation. If the summed quantities ever differed from the ungrouped
   * total, a breakdown would stop describing the line it sits under.
   */
  it("never loses or invents quantity", () => {
    const input = [c(), c({ description: "Sand", quantityPerUnit: 2.5 }), c(), c({ quantityPerUnit: 0.5 })];
    const totalBefore = input.reduce((n, x) => n + x.quantityPerUnit, 0);
    const totalAfter = groupJobComponents(input).reduce((n, x) => n + x.quantityPerUnit, 0);
    expect(totalAfter).toBeCloseTo(totalBefore);
  });

  it("handles an empty recipe without inventing a row", () => {
    expect(groupJobComponents([])).toEqual([]);
  });
});

describe("unit labels", () => {
  it("reads the quantity with its unit when there is one", () => {
    expect(componentQuantityLabel(c({ quantityPerUnit: 3, unitLabel: "trip" }))).toBe("3 trip");
  });

  it("reads bare when there is none, exactly as before this field existed", () => {
    expect(componentQuantityLabel(c({ quantityPerUnit: 3 }))).toBe("3");
    expect(componentQuantityLabel(c({ quantityPerUnit: 3, unitLabel: "  " }))).toBe("3");
    expect(componentQuantityLabel(c({ quantityPerUnit: 3, unitLabel: null }))).toBe("3");
  });

  /**
   * Unit is part of identity for grouping. "2 trips" and "2 days" of the same
   * thing at the same price are different lines; summing them would print a
   * single quantity counting two different units at once.
   */
  it("does not merge the same item measured in different units", () => {
    const grouped = groupJobComponents([
      c({ description: "Haulage", unitLabel: "trip" }),
      c({ description: "Haulage", unitLabel: "day" }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it("still merges when the unit matches too", () => {
    const grouped = groupJobComponents([
      c({ description: "Haulage", unitLabel: "trip" }),
      c({ description: "Haulage", unitLabel: "trip" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]?.quantityPerUnit).toBe(2);
  });

  it("treats absent and blank units as the same thing when merging", () => {
    // Otherwise a row saved before this field existed would refuse to merge
    // with an identical one saved after it.
    const grouped = groupJobComponents([c({ unitLabel: undefined }), c({ unitLabel: "" })]);
    expect(grouped).toHaveLength(1);
  });
});
