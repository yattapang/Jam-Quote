import { describe, expect, it } from "vitest";
import {
  buildHiddenSet,
  isHidden,
  orderForDisplay,
  withHiddenToggled,
  type HiddenCatalogEntry,
} from "./catalog-visibility";

describe("buildHiddenSet / isHidden — looking up a hide by kind and id", () => {
  const entries: HiddenCatalogEntry[] = [
    { kind: "MATERIAL_CATEGORY", rowId: "cat_1" },
    { kind: "TRADE", rowId: "trade_1" },
  ];

  it("reports a hidden row as hidden", () => {
    const set = buildHiddenSet(entries);
    expect(isHidden(set, "MATERIAL_CATEGORY", "cat_1")).toBe(true);
    expect(isHidden(set, "TRADE", "trade_1")).toBe(true);
  });

  it("reports an untouched row as visible", () => {
    const set = buildHiddenSet(entries);
    expect(isHidden(set, "MATERIAL_CATEGORY", "cat_2")).toBe(false);
  });

  it("does not confuse the same id across different kinds", () => {
    // A material category and a material unit could share an id coincidence
    // — the kind must be part of the key, not just the row id.
    const set = buildHiddenSet([{ kind: "MATERIAL_CATEGORY", rowId: "shared_id" }]);
    expect(isHidden(set, "MATERIAL_CATEGORY", "shared_id")).toBe(true);
    expect(isHidden(set, "MATERIAL_UNIT", "shared_id")).toBe(false);
  });

  it("builds an empty set from an empty list", () => {
    expect(buildHiddenSet([]).size).toBe(0);
  });
});

describe("withHiddenToggled — updating local state after a hide/unhide succeeds", () => {
  it("adds an entry when hiding", () => {
    const set = buildHiddenSet([]);
    const next = withHiddenToggled(set, "MATERIAL_UNIT", "unit_1", true);
    expect(isHidden(next, "MATERIAL_UNIT", "unit_1")).toBe(true);
  });

  it("removes an entry when unhiding", () => {
    const set = buildHiddenSet([{ kind: "MATERIAL_UNIT", rowId: "unit_1" }]);
    const next = withHiddenToggled(set, "MATERIAL_UNIT", "unit_1", false);
    expect(isHidden(next, "MATERIAL_UNIT", "unit_1")).toBe(false);
  });

  it("never mutates the set it was given", () => {
    const set = buildHiddenSet([]);
    withHiddenToggled(set, "TRADE", "trade_1", true);
    expect(set.size).toBe(0);
  });

  it("is a no-op re-hiding an already-hidden entry, mirroring the API's idempotent hide", () => {
    const set = buildHiddenSet([{ kind: "TRADE", rowId: "trade_1" }]);
    const next = withHiddenToggled(set, "TRADE", "trade_1", true);
    expect(next.size).toBe(1);
  });
});

describe("orderForDisplay — visible rows first, hidden rows grouped at the bottom", () => {
  const rows = [
    { id: "c1", label: "Cement" },
    { id: "c2", label: "Lumber" },
    { id: "c3", label: "Rebar" },
    { id: "c4", label: "Zinc" },
  ];

  it("keeps every row when nothing is hidden", () => {
    const set = buildHiddenSet([]);
    expect(orderForDisplay(rows, set, "MATERIAL_CATEGORY").map((r) => r.id)).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
    ]);
  });

  it("moves hidden rows after visible ones without re-sorting either bucket", () => {
    const set = buildHiddenSet([
      { kind: "MATERIAL_CATEGORY", rowId: "c1" },
      { kind: "MATERIAL_CATEGORY", rowId: "c3" },
    ]);
    // c1 and c3 are hidden; c2 and c4 stay visible. Each bucket keeps the
    // relative order it arrived in (c2 before c4, c1 before c3).
    expect(orderForDisplay(rows, set, "MATERIAL_CATEGORY").map((r) => r.id)).toEqual([
      "c2",
      "c4",
      "c1",
      "c3",
    ]);
  });

  it("puts everything in the hidden bucket when all rows are hidden", () => {
    const set = buildHiddenSet(rows.map((r) => ({ kind: "MATERIAL_CATEGORY" as const, rowId: r.id })));
    expect(orderForDisplay(rows, set, "MATERIAL_CATEGORY").map((r) => r.id)).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
    ]);
  });

  it("only looks at hides for the given kind, ignoring same-id hides on another kind", () => {
    const set = buildHiddenSet([{ kind: "TRADE", rowId: "c1" }]);
    expect(orderForDisplay(rows, set, "MATERIAL_CATEGORY").map((r) => r.id)).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
    ]);
  });

  it("never mutates the input array", () => {
    const set = buildHiddenSet([{ kind: "MATERIAL_CATEGORY", rowId: "c1" }]);
    const ordered = orderForDisplay(rows, set, "MATERIAL_CATEGORY");
    expect(rows.map((r) => r.id)).toEqual(["c1", "c2", "c3", "c4"]);
    expect(ordered).not.toBe(rows);
  });
});
