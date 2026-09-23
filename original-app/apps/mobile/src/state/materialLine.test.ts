import { describe, expect, it } from "vitest";
import { canSaveMaterialLine } from "./materialLine";

/**
 * `canSave` on the Add material screen used to check only the override-note
 * requirement, so a zero-quantity or zero-price line (not overridden) could
 * be added to the quote silently.
 */
describe("canSaveMaterialLine", () => {
  it("refuses a zero quantity", () => {
    expect(canSaveMaterialLine(0, 1000, false, "")).toBe(false);
  });

  it("refuses a zero effective unit price", () => {
    expect(canSaveMaterialLine(40, 0, false, "")).toBe(false);
  });

  it("allows a normal, non-overridden line", () => {
    expect(canSaveMaterialLine(40, 1000, false, "")).toBe(true);
  });

  it("still requires an override note when overridden", () => {
    expect(canSaveMaterialLine(40, 1000, true, "")).toBe(false);
    expect(canSaveMaterialLine(40, 1000, true, "supplier ran out")).toBe(true);
  });
});
