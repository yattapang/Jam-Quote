import { describe, expect, it } from "vitest";
import {
  emptyLabourRateForm,
  labourRatePayloadFromValues,
  labourRateEditPayloadFromValues,
} from "./LabourRateForm";

describe("labourRatePayloadFromValues (create)", () => {
  it("omits a blank unitLabel/skillTier rather than sending null", () => {
    const payload = labourRatePayloadFromValues({ ...emptyLabourRateForm, trade: "Tiler" });
    expect(payload.unitLabel).toBeUndefined();
    expect(payload.skillTier).toBeUndefined();
    expect("unitLabel" in payload && payload.unitLabel !== undefined).toBe(false);
  });
});

describe("labourRateEditPayloadFromValues (edit)", () => {
  it("sends null for a blank unitLabel/skillTier so a PATCH clears them", () => {
    const payload = labourRateEditPayloadFromValues({ ...emptyLabourRateForm, trade: "Tiler" });
    expect(payload.unitLabel).toBeNull();
    expect(payload.skillTier).toBeNull();
  });

  it("sends the trimmed value when one is set", () => {
    const payload = labourRateEditPayloadFromValues({
      ...emptyLabourRateForm,
      trade: "Tiler",
      unitLabel: " sq ft ",
      skillTier: " master ",
    });
    expect(payload.unitLabel).toBe("sq ft");
    expect(payload.skillTier).toBe("master");
  });
});
