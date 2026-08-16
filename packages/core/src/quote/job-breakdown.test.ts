import { describe, expect, it } from "vitest";
import { groupJobComponents, type JobComponentSnapshot } from "./job-breakdown.js";

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
