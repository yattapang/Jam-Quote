import { describe, expect, it } from "vitest";
import { specFieldsFor, specsForCategoryChange } from "./material-categories";

describe("specsForCategoryChange — fix for silently-dropped spec values on category switch", () => {
  it("preserves a spec value whose field label is shared between the old and new category", () => {
    // "Type" is a field on both Cement and Aggregate / Sand.
    const { specs, dropped } = specsForCategoryChange({ Type: "Portland", "Bag size": "94lb" }, "Cement", "Aggregate / Sand");
    expect(specs).toEqual({ Type: "Portland" });
    expect(dropped).toEqual(["Bag size"]);
  });

  it("reports every dropped field so the caller can warn instead of silently discarding", () => {
    const { specs, dropped } = specsForCategoryChange(
      { Dimension: "2x4", Length: "16ft", Grade: "Select" },
      "Lumber",
      "Tiles", // Tiles asks for Size/Finish — none of Lumber's fields carry over
    );
    expect(specs).toEqual({});
    expect(dropped.sort()).toEqual(["Dimension", "Grade", "Length"]);
  });

  it("carries over only the field Steel / Rebar and Plumbing actually share (Diameter, not Length/Material)", () => {
    const { specs, dropped } = specsForCategoryChange({ Diameter: "1/2in", Length: "20ft" }, "Steel / Rebar", "Plumbing");
    expect(specs).toEqual({ Diameter: "1/2in" });
    expect(dropped).toEqual(["Length"]);
  });

  it("is a lossless no-op when the category doesn't actually change", () => {
    const { specs, dropped } = specsForCategoryChange({ Diameter: "1/2in", Length: "20ft" }, "Steel / Rebar", "Steel / Rebar");
    expect(specs).toEqual({ Diameter: "1/2in", Length: "20ft" });
    expect(dropped).toEqual([]);
  });

  it("drops blank/whitespace-only values without reporting them as lost data", () => {
    const { specs, dropped } = specsForCategoryChange({ Diameter: "  ", Length: "20ft" }, "Steel / Rebar", "Tiles");
    expect(specs).toEqual({});
    // Diameter was already blank — nothing meaningful was actually discarded.
    expect(dropped).toEqual(["Length"]);
  });

  it("clearing the category (switch to none) drops every filled spec and reports them", () => {
    const { specs, dropped } = specsForCategoryChange({ Diameter: "1/2in" }, "Steel / Rebar", undefined);
    expect(specs).toEqual({});
    expect(dropped).toEqual(["Diameter"]);
  });

  it("round-trips cleanly through specFieldsFor for an unrecognized/custom category", () => {
    expect(specFieldsFor("Some Custom Category")).toEqual([]);
    const { specs, dropped } = specsForCategoryChange({ Diameter: "1/2in" }, "Steel / Rebar", "Some Custom Category");
    expect(specs).toEqual({});
    expect(dropped).toEqual(["Diameter"]);
  });
});
