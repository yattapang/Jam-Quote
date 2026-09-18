import { describe, expect, it } from "vitest";
import { computeJobUnitCostCents } from "@jamquote/core";
import {
  canMerge,
  duplicateComponentKeys,
  mergeDuplicateComponents,
  type ComponentLike,
} from "./job-components";

function comp(over: Partial<ComponentLike> & { key: string }): ComponentLike {
  return {
    kind: "MATERIAL",
    description: "Cement, 42.5kg bag",
    quantityPerUnit: "1",
    ...over,
  };
}

/** A component shaped enough to feed computeJobUnitCostCents, with price
 * expressed the way the form holds it: dollars, as a string. */
function costedComp(
  over: Partial<ComponentLike> & { key: string; unitPriceDollars: string },
): ComponentLike & { unitPriceDollars: string } {
  return {
    kind: "MATERIAL",
    description: "Transport",
    quantityPerUnit: "1",
    unitLabel: "trip",
    ...over,
  };
}

function jobCost(components: (ComponentLike & { unitPriceDollars: string })[]): number {
  return computeJobUnitCostCents({
    components: components.map((c) => ({
      quantityPerUnit: Number(c.quantityPerUnit) || 0,
      unitPriceCents: Math.round((Number(c.unitPriceDollars) || 0) * 100),
    })),
  });
}

describe("duplicateComponentKeys", () => {
  it("flags the second occurrence of the same picked material", () => {
    const rows = [
      comp({ key: "a", materialFavouriteId: "m1" }),
      comp({ key: "b", materialFavouriteId: "m1" }),
    ];
    expect([...duplicateComponentKeys(rows)]).toEqual(["b"]);
  });

  it("never flags the first occurrence", () => {
    // Marking both would leave the contractor unsure which one to remove.
    const rows = [
      comp({ key: "a", materialFavouriteId: "m1" }),
      comp({ key: "b", materialFavouriteId: "m1" }),
      comp({ key: "c", materialFavouriteId: "m1" }),
    ];
    const dupes = duplicateComponentKeys(rows);
    expect(dupes.has("a")).toBe(false);
    expect(dupes.has("b")).toBe(true);
    expect(dupes.has("c")).toBe(true);
  });

  it("matches a picked row by its library id, not its description", () => {
    // Renaming one on the line does not make it a different material.
    const rows = [
      comp({ key: "a", materialFavouriteId: "m1", description: "Cement" }),
      comp({ key: "b", materialFavouriteId: "m1", description: "Cement (renamed)" }),
    ];
    expect(duplicateComponentKeys(rows).has("b")).toBe(true);
  });

  it("matches hand-typed rows on description, ignoring case and padding", () => {
    const rows = [
      comp({ key: "a", kind: "OTHER", description: "Waste disposal" }),
      comp({ key: "b", kind: "OTHER", description: "  waste disposal " }),
    ];
    expect(duplicateComponentKeys(rows).has("b")).toBe(true);
  });

  it("does not treat material and labour as the same thing", () => {
    const rows = [
      comp({ key: "a", kind: "MATERIAL", description: "Mason" }),
      comp({ key: "b", kind: "LABOUR", description: "Mason" }),
    ];
    expect(duplicateComponentKeys(rows).size).toBe(0);
  });

  it("ignores blank rows — an unfinished row is not a duplicate", () => {
    const rows = [comp({ key: "a", description: "" }), comp({ key: "b", description: "" })];
    expect(duplicateComponentKeys(rows).size).toBe(0);
  });
});

describe("mergeDuplicateComponents", () => {
  it("folds duplicates into the first and sums the quantities", () => {
    const merged = mergeDuplicateComponents([
      comp({ key: "a", materialFavouriteId: "m1", quantityPerUnit: "1" }),
      comp({ key: "b", materialFavouriteId: "m1", quantityPerUnit: "1" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.key).toBe("a");
    expect(merged[0]?.quantityPerUnit).toBe("2");
  });

  it("keeps the surviving rows in their original order", () => {
    const merged = mergeDuplicateComponents([
      comp({ key: "a", description: "Sand" }),
      comp({ key: "b", description: "Cement" }),
      comp({ key: "c", description: "Sand" }),
    ]);
    expect(merged.map((m) => m.description)).toEqual(["Sand", "Cement"]);
  });

  it("treats a blank or unparseable quantity as zero rather than NaN", () => {
    const merged = mergeDuplicateComponents([
      comp({ key: "a", materialFavouriteId: "m1", quantityPerUnit: "2" }),
      comp({ key: "b", materialFavouriteId: "m1", quantityPerUnit: "" }),
    ]);
    expect(merged[0]?.quantityPerUnit).toBe("2");
  });

  it("leaves an unfinished blank row alone at the end", () => {
    // The builder keeps a spare row; merging must not eat it.
    const merged = mergeDuplicateComponents([
      comp({ key: "a", materialFavouriteId: "m1" }),
      comp({ key: "blank", description: "" }),
    ]);
    expect(merged.map((m) => m.key)).toEqual(["a", "blank"]);
  });

  it("is a no-op when there is nothing repeated", () => {
    const rows = [comp({ key: "a", description: "Sand" }), comp({ key: "b", description: "Cement" })];
    expect(mergeDuplicateComponents(rows)).toHaveLength(2);
  });

  it("P0: never changes computeJobUnitCostCents, even when unit prices differ", () => {
    // "Transport" 1 x $5,000 and "transport " 1 x $3,000: same loose identity
    // (trimmed/case-folded description) but different prices. Merging must
    // never invent a price — 800000 cents must stay 800000, not become
    // 1000000 (2 x the first row's price).
    const rows = [
      costedComp({ key: "a", description: "Transport", quantityPerUnit: "1", unitPriceDollars: "5000" }),
      costedComp({ key: "b", description: "transport ", quantityPerUnit: "1", unitPriceDollars: "3000" }),
    ];

    const before = jobCost(rows);
    expect(before).toBe(800_000);

    const merged = mergeDuplicateComponents(rows);
    const after = jobCost(merged);

    expect(after).toBe(before);
    // Rows with mismatched price are not merged at all — the pair survives
    // as two rows for the contractor to resolve by hand.
    expect(merged).toHaveLength(2);
  });

  it("refuses to merge rows whose units differ, e.g. 1 bag + 25 kg", () => {
    const rows = [
      costedComp({ key: "a", description: "Cement", quantityPerUnit: "1", unitPriceDollars: "10", unitLabel: "bag" }),
      costedComp({ key: "b", description: "Cement", quantityPerUnit: "25", unitPriceDollars: "10", unitLabel: "kg" }),
    ];

    const merged = mergeDuplicateComponents(rows);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.quantityPerUnit)).toEqual(["1", "25"]);
  });

  it("rounds a summed quantity to the quantity step so it can be saved", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in floating point, which both the
    // browser (step=0.001) and the DTO refuse. It must round to 3 decimals.
    const merged = mergeDuplicateComponents([
      comp({ key: "a", materialFavouriteId: "m1", quantityPerUnit: "0.1" }),
      comp({ key: "b", materialFavouriteId: "m1", quantityPerUnit: "0.2" }),
    ]);
    expect(merged[0]?.quantityPerUnit).toBe("0.3");
  });

  it("MEDIUM: refuses to merge same-price rows when rounding would still change the cost (three Sand rows at $0.10 x 0.333)", () => {
    // Each row: lineExtension(0.333, 10) rounds to 3c; three of them cost 9c
    // unmerged. Merged: quantity sums to 0.999, lineExtension(0.999, 10)
    // rounds to 10c. Same price AND unit is not enough — merging must still
    // be refused because it changes the total by a cent.
    const rows = [
      costedComp({ key: "a", description: "Sand", quantityPerUnit: "0.333", unitPriceDollars: "0.10" }),
      costedComp({ key: "b", description: "Sand", quantityPerUnit: "0.333", unitPriceDollars: "0.10" }),
      costedComp({ key: "c", description: "Sand", quantityPerUnit: "0.333", unitPriceDollars: "0.10" }),
    ];

    const before = jobCost(rows);
    expect(before).toBe(9);

    const merged = mergeDuplicateComponents(rows);
    expect(merged).toHaveLength(3);
    expect(jobCost(merged)).toBe(before);
  });

  it("MEDIUM: refuses to merge same-price rows when rounding would still change the cost (two rows at $0.01 x 0.5)", () => {
    // Each row: lineExtension(0.5, 1) rounds half-up to 1c; two of them cost
    // 2c unmerged. Merged: quantity sums to 1, lineExtension(1, 1) = 1c.
    const rows = [
      costedComp({ key: "a", description: "Nail", quantityPerUnit: "0.5", unitPriceDollars: "0.01" }),
      costedComp({ key: "b", description: "Nail", quantityPerUnit: "0.5", unitPriceDollars: "0.01" }),
    ];

    const before = jobCost(rows);
    expect(before).toBe(2);

    const merged = mergeDuplicateComponents(rows);
    expect(merged).toHaveLength(2);
    expect(jobCost(merged)).toBe(before);
  });

  it("still merges same-price, same-unit rows when rounding agrees exactly", () => {
    const rows = [
      costedComp({ key: "a", description: "Sand", quantityPerUnit: "1", unitPriceDollars: "10" }),
      costedComp({ key: "b", description: "Sand", quantityPerUnit: "1", unitPriceDollars: "10" }),
    ];
    const merged = mergeDuplicateComponents(rows);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.quantityPerUnit).toBe("2");
  });
});

describe("canMerge", () => {
  it("MEDIUM: false when price and unit match but merging would still change the cost by a cent", () => {
    const rows = [
      costedComp({ key: "a", description: "Sand", quantityPerUnit: "0.333", unitPriceDollars: "0.10" }),
      costedComp({ key: "b", description: "Sand", quantityPerUnit: "0.333", unitPriceDollars: "0.10" }),
      costedComp({ key: "c", description: "Sand", quantityPerUnit: "0.333", unitPriceDollars: "0.10" }),
    ];
    expect(canMerge(rows, "b")).toBe(false);
    expect(canMerge(rows, "c")).toBe(false);
  });

  it("true when price and unit match and merging would not change the cost", () => {
    const rows = [
      costedComp({ key: "a", description: "Sand", quantityPerUnit: "1", unitPriceDollars: "10" }),
      costedComp({ key: "b", description: "Sand", quantityPerUnit: "1", unitPriceDollars: "10" }),
    ];
    expect(canMerge(rows, "b")).toBe(true);
  });

  it("MEDIUM/item 3: false when the duplicate rows have different prices ($5 and $3 Sand)", () => {
    const rows = [
      costedComp({ key: "a", description: "Sand", quantityPerUnit: "1", unitPriceDollars: "5" }),
      costedComp({ key: "b", description: "Sand", quantityPerUnit: "1", unitPriceDollars: "3" }),
    ];
    expect(canMerge(rows, "b")).toBe(false);
  });

  it("false for a row that has no duplicate", () => {
    const rows = [costedComp({ key: "a", description: "Sand", quantityPerUnit: "1", unitPriceDollars: "5" })];
    expect(canMerge(rows, "a")).toBe(false);
  });
});

describe("equipment components", () => {
  it("spots the same hire item added twice", () => {
    // Equipment joined the recipe later than material and labour; the
    // duplicate check has to know about its link or it silently stops working
    // for the newest kind.
    const rows = [
      comp({ key: "a", kind: "EQUIPMENT", equipmentItemId: "eq1", description: "Mixer" }),
      comp({ key: "b", kind: "EQUIPMENT", equipmentItemId: "eq1", description: "Mixer" }),
    ];
    expect(duplicateComponentKeys(rows).has("b")).toBe(true);
  });

  it("merges repeated equipment and sums the quantity", () => {
    const merged = mergeDuplicateComponents([
      comp({ key: "a", kind: "EQUIPMENT", equipmentItemId: "eq1", quantityPerUnit: "2" }),
      comp({ key: "b", kind: "EQUIPMENT", equipmentItemId: "eq1", quantityPerUnit: "1" }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.quantityPerUnit).toBe("3");
  });

  it("does not confuse equipment with a material of the same name", () => {
    const rows = [
      comp({ key: "a", kind: "MATERIAL", description: "Scaffold" }),
      comp({ key: "b", kind: "EQUIPMENT", description: "Scaffold" }),
    ];
    expect(duplicateComponentKeys(rows).size).toBe(0);
  });
});
