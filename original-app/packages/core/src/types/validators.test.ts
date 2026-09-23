import { describe, expect, it } from "vitest";
import {
  jamaicaPhoneSchema,
  quoteLineItemSchema,
  trnSchema,
} from "./validators.js";
import { LineCategory, PriceSource, RateUnit, GctTreatment } from "./enums.js";

describe("trnSchema", () => {
  it("strips grouping and accepts a 9-digit TRN", () => {
    const r = trnSchema.safeParse("102-458-963");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("102458963");
  });

  it("rejects anything that isn't 9 digits", () => {
    expect(trnSchema.safeParse("12345").success).toBe(false);
    expect(trnSchema.safeParse("102-458-9631").success).toBe(false);
  });
});

describe("jamaicaPhoneSchema", () => {
  it("accepts 876/658 numbers, with or without country code", () => {
    expect(jamaicaPhoneSchema.safeParse("876 555 0142").success).toBe(true);
    expect(jamaicaPhoneSchema.safeParse("1-876-555-0142").success).toBe(true);
    expect(jamaicaPhoneSchema.safeParse("658 402 8811").success).toBe(true);
  });

  it("rejects non-Jamaican or short numbers", () => {
    expect(jamaicaPhoneSchema.safeParse("555 0142").success).toBe(false);
    expect(jamaicaPhoneSchema.safeParse("305 555 0142").success).toBe(false);
  });
});

describe("quoteLineItemSchema", () => {
  const base = {
    category: LineCategory.MATERIAL,
    description: "Carib Cement, 42.5kg bag",
    quantity: 10,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 145_000,
  };

  it("applies defaults for priceSource and gctTreatment", () => {
    const r = quoteLineItemSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.priceSource).toBe(PriceSource.MANUAL);
      expect(r.data.gctTreatment).toBe(GctTreatment.STANDARD);
    }
  });

  it("rejects a non-positive quantity or negative price", () => {
    expect(quoteLineItemSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(quoteLineItemSchema.safeParse({ ...base, unitPriceCents: -1 }).success).toBe(false);
  });

  it("requires an override note when a looked-up price is replaced", () => {
    const bad = quoteLineItemSchema.safeParse({
      ...base,
      priceSource: PriceSource.LOOKUP,
      overrideNote: "",
    });
    expect(bad.success).toBe(false);

    const ok = quoteLineItemSchema.safeParse({
      ...base,
      priceSource: PriceSource.LOOKUP,
      overrideNote: "Matched a cheaper local supplier",
    });
    expect(ok.success).toBe(true);
  });

  it("allows a looked-up price with no override note at all", () => {
    const r = quoteLineItemSchema.safeParse({ ...base, priceSource: PriceSource.LOOKUP });
    expect(r.success).toBe(true);
  });
});
