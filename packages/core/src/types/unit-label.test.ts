import { describe, expect, it } from "vitest";
import { normalizeUnitLabel } from "./unit-label.js";

describe("normalizeUnitLabel", () => {
  it("turns what a contractor can type into what they meant", () => {
    expect(normalizeUnitLabel("m2")).toBe("m²");
    expect(normalizeUnitLabel("m3")).toBe("m³");
    expect(normalizeUnitLabel("ft2")).toBe("ft²");
    expect(normalizeUnitLabel("mm2")).toBe("mm²");
  });

  it("accepts a space, since a phone keyboard invites one", () => {
    expect(normalizeUnitLabel("m 2")).toBe("m²");
  });

  it("handles the spelled-out forms people use BECAUSE they cannot type it", () => {
    expect(normalizeUnitLabel("sq m")).toBe("m²");
    expect(normalizeUnitLabel("sqm")).toBe("m²");
    expect(normalizeUnitLabel("cu m")).toBe("m³");
    expect(normalizeUnitLabel("cu. yd")).toBe("yd³");
  });

  it("keeps the contractor's capitals", () => {
    // Someone who writes M means M — this is the same unit the owner created
    // by hand as "M" during the audit.
    expect(normalizeUnitLabel("M2")).toBe("M²");
  });

  it("leaves a real superscript alone", () => {
    expect(normalizeUnitLabel("m²")).toBe("m²");
  });

  it("does NOT rewrite text that merely ends in a digit", () => {
    // The reason the rule is narrow. Silently turning a unit into something
    // the contractor did not mean is worse than making them type awkwardly.
    expect(normalizeUnitLabel("Type 2")).toBe("Type 2");
    expect(normalizeUnitLabel("No2")).toBe("No2");
    expect(normalizeUnitLabel("Grade 3")).toBe("Grade 3");
    expect(normalizeUnitLabel("42.5kg bag")).toBe("42.5kg bag");
  });

  it("leaves ordinary units completely alone", () => {
    expect(normalizeUnitLabel("bag")).toBe("bag");
    expect(normalizeUnitLabel("per pallet")).toBe("per pallet");
    expect(normalizeUnitLabel("  Sheet  ")).toBe("Sheet");
  });

  it("is empty for an empty label rather than throwing", () => {
    expect(normalizeUnitLabel("   ")).toBe("");
  });
});
