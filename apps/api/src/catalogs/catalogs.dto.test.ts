import { describe, expect, it } from "vitest";
import { updateLabourRateSchema, updateEquipmentItemSchema } from "./catalogs.dto.js";

describe("updateLabourRateSchema", () => {
  it("accepts null for unitLabel and skillTier, to clear them on a PATCH", () => {
    const parsed = updateLabourRateSchema.parse({ unitLabel: null, skillTier: null });
    expect(parsed.unitLabel).toBeNull();
    expect(parsed.skillTier).toBeNull();
  });

  it("still rejects an empty string for unitLabel", () => {
    expect(() => updateLabourRateSchema.parse({ unitLabel: "" })).toThrow();
  });

  it("still allows omitting the fields (unchanged)", () => {
    const parsed = updateLabourRateSchema.parse({ trade: "Tiler" });
    expect(parsed.unitLabel).toBeUndefined();
    expect(parsed.skillTier).toBeUndefined();
  });
});

describe("updateEquipmentItemSchema", () => {
  it("accepts null for unitLabel, vendor and vendorPhone, to clear them on a PATCH", () => {
    const parsed = updateEquipmentItemSchema.parse({
      unitLabel: null,
      vendor: null,
      vendorPhone: null,
    });
    expect(parsed.unitLabel).toBeNull();
    expect(parsed.vendor).toBeNull();
    expect(parsed.vendorPhone).toBeNull();
  });

  it("still rejects an empty string for unitLabel", () => {
    expect(() => updateEquipmentItemSchema.parse({ unitLabel: "" })).toThrow();
  });
});
