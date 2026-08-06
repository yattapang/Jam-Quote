import { describe, expect, it } from "vitest";
import { materialFavouriteLabel, materialLineDescription, materialVariantName } from "./material-display";

const lumber = {
  id: "mf-lumber-2x4-16-select",
  name: "Lumber",
  unit: "pc",
  priceCents: 85_000,
  priceDollars: 850,
  category: "Lumber",
  specs: { Dimension: "2x4", Length: "16ft", Grade: "Select" },
};

describe("materialVariantName", () => {
  it("joins spec values onto the name, in insertion (category field) order", () => {
    expect(materialVariantName(lumber)).toBe("Lumber 2x4 x 16ft x Select");
  });

  it("falls back to the bare name when there are no specs", () => {
    expect(materialVariantName({ name: "Cement (grey, 94lb)" })).toBe("Cement (grey, 94lb)");
    expect(materialVariantName({ name: "Cement", specs: {} })).toBe("Cement");
  });

  it("drops blank spec values rather than rendering an empty segment", () => {
    expect(materialVariantName({ name: "Rebar", specs: { Diameter: "1/2in", Length: "" } })).toBe("Rebar 1/2in");
  });

  it("distinguishes two same-named variants by their specs", () => {
    const cedar = { name: "2x4", specs: { Dimension: "2x4", Length: "8ft" } };
    const mahogany = { name: "2x4", specs: { Dimension: "2x4", Length: "16ft" } };
    expect(materialVariantName(cedar)).not.toBe(materialVariantName(mahogany));
  });
});

describe("materialFavouriteLabel", () => {
  it("renders variant name, unit, and price — the picker/dropdown option format", () => {
    expect(materialFavouriteLabel(lumber)).toBe("Lumber 2x4 x 16ft x Select (pc) — $850.00");
  });

  it("matches the pre-existing plain shape when there's no category/specs/unit", () => {
    expect(materialFavouriteLabel({ name: "Cement (grey, 94lb)", priceDollars: 1150 })).toBe(
      "Cement (grey, 94lb) — $1,150.00",
    );
  });
});

describe("materialLineDescription — the fix for the invisible-specs bug", () => {
  it("composes name + spec values, unlike the old `description: fav.name` behaviour", () => {
    // Before the fix, picking this favourite produced a quote line reading
    // just "Lumber" — the Dimension/Length/Grade specs never reached the
    // line the customer sees. After the fix, they do:
    const before = lumber.name;
    const after = materialLineDescription(lumber);
    expect(before).toBe("Lumber");
    expect(after).toBe("Lumber 2x4 x 16ft x Select");
    expect(after).toContain("2x4");
    expect(after).toContain("16ft");
    expect(after).toContain("Select");
  });

  it("appends the material's own free-text description when set", () => {
    expect(materialLineDescription({ ...lumber, description: "Kiln-dried, from ABC Hardware" })).toBe(
      "Lumber 2x4 x 16ft x Select — Kiln-dried, from ABC Hardware",
    );
  });

  it("never includes price or unit — those live in unitPriceCents/rateUnit, not the description text", () => {
    const desc = materialLineDescription(lumber);
    expect(desc).not.toContain("850");
    expect(desc).not.toContain("pc");
    expect(desc).not.toContain("$");
  });

  it("ignores a blank/whitespace-only description", () => {
    expect(materialLineDescription({ ...lumber, description: "   " })).toBe("Lumber 2x4 x 16ft x Select");
  });
});
