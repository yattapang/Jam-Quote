import { describe, expect, it } from "vitest";
import {
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
