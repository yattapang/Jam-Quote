import { describe, expect, it } from "vitest";
import {
  emptyMaterialForm,
  materialEditPayloadFromValues,
  materialPayloadFromValues,
  type MaterialFormValues,
} from "./MaterialForm";

/**
 * materialPayloadFromValues (shared by create and edit until this fix) OMITS
 * a blank optional field, which is correct for create (nothing to clear) but
 * wrong for a PATCH: omission means "unchanged" on this endpoint, so an edit
 * could never clear supplierId/description/measureUnit/coveragePerSellUnit/
 * wastePct back out. materialEditPayloadFromValues is the edit-only fix,
 * mirroring labourRateEditPayloadFromValues / clientEditPayloadFromValues.
 */
describe("materialEditPayloadFromValues", () => {
  const filled: MaterialFormValues = {
    ...emptyMaterialForm,
    name: "Cement",
    nameCustom: true,
    priceDollars: "10",
    supplierId: "sup-1",
    description: "Portland",
    measureUnit: "m²",
    coveragePerSellUnit: "4",
    wastePct: "10",
  };

  it("sends explicit null for each blank optional field, not an omission", () => {
    const blank: MaterialFormValues = {
      ...filled,
      supplierId: "",
      description: "",
      measureUnit: "",
      coveragePerSellUnit: "",
      wastePct: "",
    };
    const payload = materialEditPayloadFromValues(blank, undefined);
    expect(payload.supplierId).toBeNull();
    expect(payload.description).toBeNull();
    expect(payload.measureUnit).toBeNull();
    expect(payload.coveragePerSellUnit).toBeNull();
    expect(payload.wastePct).toBeNull();
  });

  it("still sends the real values when the fields are filled in", () => {
    const payload = materialEditPayloadFromValues(filled, undefined);
    expect(payload.supplierId).toBe("sup-1");
    expect(payload.description).toBe("Portland");
    expect(payload.measureUnit).toBe("m²");
    expect(payload.coveragePerSellUnit).toBe(4);
    expect(payload.wastePct).toBe(10);
  });

  it("the CREATE payload builder, by contrast, omits blank fields entirely (correct for create, and the bug for edit before this fix)", () => {
    const blank: MaterialFormValues = {
      ...filled,
      supplierId: "",
      description: "",
      measureUnit: "",
      coveragePerSellUnit: "",
      wastePct: "",
    };
    const payload = materialPayloadFromValues(blank, undefined);
    expect(payload.supplierId).toBeUndefined();
    expect(payload.description).toBeUndefined();
    expect(payload.measureUnit).toBeUndefined();
    expect(payload.coveragePerSellUnit).toBeUndefined();
    expect(payload.wastePct).toBeUndefined();
    expect("supplierId" in payload).toBe(false);
  });
});
