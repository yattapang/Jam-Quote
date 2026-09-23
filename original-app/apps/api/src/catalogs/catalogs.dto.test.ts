import { describe, expect, it } from "vitest";
import {
  updateLabourRateSchema,
  updateEquipmentItemSchema,
  updateMaterialFavouriteSchema,
} from "./catalogs.dto.js";

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

describe("updateMaterialFavouriteSchema", () => {
  it("accepts null for supplierId/description/measureUnit/coveragePerSellUnit/wastePct, to clear them on a PATCH", () => {
    const parsed = updateMaterialFavouriteSchema.parse({
      supplierId: null,
      description: null,
      measureUnit: null,
      coveragePerSellUnit: null,
      wastePct: null,
    });
    expect(parsed.supplierId).toBeNull();
    expect(parsed.description).toBeNull();
    expect(parsed.measureUnit).toBeNull();
    expect(parsed.coveragePerSellUnit).toBeNull();
    expect(parsed.wastePct).toBeNull();
  });

  it("still allows omitting the fields (unchanged)", () => {
    const parsed = updateMaterialFavouriteSchema.parse({ priceCents: 500 });
    expect(parsed.supplierId).toBeUndefined();
    expect(parsed.description).toBeUndefined();
    expect(parsed.measureUnit).toBeUndefined();
    expect(parsed.coveragePerSellUnit).toBeUndefined();
    expect(parsed.wastePct).toBeUndefined();
  });

  it("still rejects an out-of-range coveragePerSellUnit/wastePct", () => {
    expect(() => updateMaterialFavouriteSchema.parse({ coveragePerSellUnit: -1 })).toThrow();
    expect(() => updateMaterialFavouriteSchema.parse({ wastePct: 999 })).toThrow();
  });
});
