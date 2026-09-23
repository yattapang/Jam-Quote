import { describe, expect, it } from "vitest";
import {
  ADD_NEW_OPTION_VALUE,
  compareCatalogRows,
  compareSuppliersByName,
  isAddNewOption,
  mergeCatalogRow,
  persistableOptionValue,
} from "./catalog-options";

describe("isAddNewOption — telling an instruction apart from an id", () => {
  it("recognises the sentinel", () => {
    expect(isAddNewOption(ADD_NEW_OPTION_VALUE)).toBe(true);
  });

  it("treats a real id, the empty 'nothing chosen' value, and null as ids", () => {
    expect(isAddNewOption("cat_2j9xk10a")).toBe(false);
    expect(isAddNewOption("")).toBe(false);
    expect(isAddNewOption(null)).toBe(false);
    expect(isAddNewOption(undefined)).toBe(false);
  });

  it("does not match near-misses, so a label that merely mentions it is safe", () => {
    expect(isAddNewOption("__add")).toBe(false);
    expect(isAddNewOption("__add__ new")).toBe(false);
    expect(isAddNewOption("__ADD__")).toBe(false);
  });
});

describe("persistableOptionValue — the last stop before an id reaches the API", () => {
  it("collapses the sentinel to the same '' the pickers send for 'none'", () => {
    expect(persistableOptionValue(ADD_NEW_OPTION_VALUE)).toBe("");
  });

  it("passes a real id through untouched", () => {
    expect(persistableOptionValue("unit_7f3")).toBe("unit_7f3");
  });

  it("normalises the empty cases", () => {
    expect(persistableOptionValue("")).toBe("");
    expect(persistableOptionValue(null)).toBe("");
    expect(persistableOptionValue(undefined)).toBe("");
  });

  it("is falsy for exactly the values that must not be sent as an id", () => {
    // The payload builder spreads `...(persistableOptionValue(x) ? { id: x } : {})`,
    // so truthiness here is what decides whether the field is sent at all.
    expect(Boolean(persistableOptionValue(ADD_NEW_OPTION_VALUE))).toBe(false);
    expect(Boolean(persistableOptionValue("cat_real"))).toBe(true);
  });
});

describe("mergeCatalogRow — splicing an idempotent create into the list", () => {
  const lumber = { id: "cat_1", sort: 10, label: "Lumber" };
  const cement = { id: "cat_2", sort: 20, label: "Cement" };

  it("adds a genuinely new row", () => {
    const rebar = { id: "cat_3", sort: 30, label: "Rebar" };
    expect(mergeCatalogRow([lumber, cement], rebar, compareCatalogRows)).toEqual([
      lumber,
      cement,
      rebar,
    ]);
  });

  it("drops a row whose id is already present — the idempotent create's answer", () => {
    // The API returned the EXISTING Lumber because the label matched; adding it
    // again would give the picker two identical options.
    expect(mergeCatalogRow([lumber, cement], { ...lumber }, compareCatalogRows)).toEqual([
      lumber,
      cement,
    ]);
  });

  it("keeps the stored row rather than the returned copy on an id collision", () => {
    // A curated row carries data the caller never sees; the list's copy wins.
    const thinner = { id: "cat_1", sort: 99, label: "lumber" };
    const merged = mergeCatalogRow([lumber, cement], thinner, compareCatalogRows);
    expect(merged[0]).toEqual(lumber);
  });

  it("never mutates the list it was given", () => {
    const rows = [lumber];
    const merged = mergeCatalogRow(rows, cement, compareCatalogRows);
    expect(rows).toHaveLength(1);
    expect(merged).toHaveLength(2);
    expect(merged).not.toBe(rows);
  });

  it("copies the list even when nothing is added, so callers can compare identity", () => {
    const rows = [lumber];
    expect(mergeCatalogRow(rows, { ...lumber }, compareCatalogRows)).not.toBe(rows);
  });

  it("seeds an empty list", () => {
    expect(mergeCatalogRow([], lumber, compareCatalogRows)).toEqual([lumber]);
  });

  it("applies repeatedly without duplicating — the form folds every added row in on each render", () => {
    const rebar = { id: "cat_3", sort: 30, label: "Rebar" };
    const once = mergeCatalogRow([lumber], rebar, compareCatalogRows);
    const twice = mergeCatalogRow(once, rebar, compareCatalogRows);
    expect(twice).toEqual(once);
  });
});

describe("compareCatalogRows — where a newly added row lands", () => {
  it("orders by the curated sort rank first", () => {
    expect(compareCatalogRows({ sort: 10, label: "Zinc" }, { sort: 20, label: "Aggregate" })).toBeLessThan(0);
  });

  it("falls back to label so rows sharing a rank stay alphabetical", () => {
    expect(compareCatalogRows({ sort: 99, label: "Aggregate" }, { sort: 99, label: "Zinc" })).toBeLessThan(0);
  });

  it("sorts a mixed list the way the picker renders it", () => {
    const rows = [
      { sort: 99, label: "Rebar" },
      { sort: 10, label: "Lumber" },
      { sort: 99, label: "Aggregate" },
    ];
    expect([...rows].sort(compareCatalogRows).map((r) => r.label)).toEqual([
      "Lumber",
      "Aggregate",
      "Rebar",
    ]);
  });
});

describe("compareSuppliersByName — the directory's alphabetical order", () => {
  it("sorts a merged supplier list the way the API returns it", () => {
    const rows = [{ name: "Tank-Weld" }, { name: "ARC Systems" }, { name: "H&L True Value" }];
    expect([...rows].sort(compareSuppliersByName).map((s) => s.name)).toEqual([
      "ARC Systems",
      "H&L True Value",
      "Tank-Weld",
    ]);
  });
});
