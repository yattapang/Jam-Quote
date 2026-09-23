import { describe, expect, it } from "vitest";
import {
  emptyEquipmentForm,
  equipmentPayloadFromValues,
  equipmentEditPayloadFromValues,
} from "./EquipmentForm";

describe("equipmentPayloadFromValues (create)", () => {
  it("omits a blank unitLabel rather than sending null", () => {
    const payload = equipmentPayloadFromValues({ ...emptyEquipmentForm, name: "Mixer" });
    expect(payload.unitLabel).toBeUndefined();
  });
});

describe("equipmentEditPayloadFromValues (edit)", () => {
  it("sends null for a blank unitLabel so a PATCH clears it", () => {
    const payload = equipmentEditPayloadFromValues({ ...emptyEquipmentForm, name: "Mixer" });
    expect(payload.unitLabel).toBeNull();
  });

  it("clears vendor and vendorPhone with null when switching hired -> owned", () => {
    const payload = equipmentEditPayloadFromValues({
      ...emptyEquipmentForm,
      name: "Mixer",
      owned: true,
      vendor: "Acme Rentals",
      vendorPhone: "876-555-0134",
    });
    expect(payload.vendor).toBeNull();
    expect(payload.vendorPhone).toBeNull();
  });

  it("keeps vendor/vendorPhone when hired and set", () => {
    const payload = equipmentEditPayloadFromValues({
      ...emptyEquipmentForm,
      name: "Mixer",
      owned: false,
      vendor: "Acme Rentals",
      vendorPhone: "876-555-0134",
    });
    expect(payload.vendor).toBe("Acme Rentals");
    expect(payload.vendorPhone).toBe("876-555-0134");
  });
});
