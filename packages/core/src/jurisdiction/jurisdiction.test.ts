import { describe, expect, it } from "vitest";
import {
  applyRulePackOverride,
  getEffectiveJurisdiction,
  getJurisdiction,
  jurisdictionCurrency,
  supportedJurisdictions,
} from "./jurisdiction.js";
import { PARISHES, PaymentMethod } from "../types/enums.js";

describe("getJurisdiction", () => {
  it("returns the Jamaica rule-pack with verified GCT", () => {
    const jm = getJurisdiction("JM");
    expect(jm.taxLabel).toBe("GCT");
    expect(jm.defaultTaxRatePct).toBe(15);
    expect(jm.currency.code).toBe("JMD");
    expect(jm.regionLabel).toBe("Parish");
    expect(jm.regions).toEqual(PARISHES);
    expect(jm.verifiedAsOf).not.toBeNull();
  });

  it("is case-insensitive on the country code", () => {
    expect(getJurisdiction("jm").countryCode).toBe("JM");
  });

  it("throws for a country with no rule-pack yet", () => {
    expect(() => getJurisdiction("TT")).toThrow(/no jurisdiction rule-pack/i);
  });

  it("validates the taxpayer id per jurisdiction (TRN)", () => {
    const jm = getJurisdiction("JM");
    expect(jm.taxpayerId.label).toBe("TRN");
    expect(jm.taxpayerId.validate("123-456-789")).toBe(true);
    expect(jm.taxpayerId.validate("12345")).toBe(false);
  });

  it("exposes mobile-money providers as rule-pack data, not hardcoded enums", () => {
    const codes = getJurisdiction("JM").paymentProviders.map((p) => p.code);
    expect(codes).toContain("LYNK");
    expect(codes).toContain("GK_ONE");
    for (const p of getJurisdiction("JM").paymentProviders) {
      expect(p.method).toBe(PaymentMethod.MOBILE_MONEY);
    }
  });

  it("carries a statutory payroll shape (rates unverified until sourced)", () => {
    const codes = getJurisdiction("JM").statutory.map((s) => s.code);
    expect(codes).toEqual(["NIS", "NHT", "EDUCATION_TAX", "HEART"]);
    // Deliberately not yet verified — Phase 6 sources these from TAJ.
    for (const s of getJurisdiction("JM").statutory) {
      expect(s.verified).toBe(false);
    }
  });
});

describe("applyRulePackOverride", () => {
  const base = getJurisdiction("JM");

  it("returns the baseline unchanged for a null/empty override", () => {
    expect(applyRulePackOverride(base, null)).toBe(base);
    expect(applyRulePackOverride(base, {}).defaultTaxRatePct).toBe(15);
  });

  it("overrides the consumption-tax rate and label", () => {
    const eff = applyRulePackOverride(base, { defaultTaxRatePct: 12.5, taxLabel: "VAT" });
    expect(eff.defaultTaxRatePct).toBe(12.5);
    expect(eff.taxLabel).toBe("VAT");
    // untouched code-owned values still come from the baseline
    expect(eff.currency.code).toBe("JMD");
    expect(eff.regions).toEqual(base.regions);
  });

  it("honours an explicit null to clear the verified date", () => {
    expect(applyRulePackOverride(base, { verifiedAsOf: null }).verifiedAsOf).toBeNull();
    // omitting the field keeps the baseline value
    expect(applyRulePackOverride(base, {}).verifiedAsOf).toBe(base.verifiedAsOf);
  });

  it("fills statutory split rates and marks them verified", () => {
    const eff = applyRulePackOverride(base, {
      verifiedAsOf: "2026-07-31",
      statutoryRates: { NIS: { employeePct: 3, employerPct: 3 } },
    });
    const nis = eff.statutory.find((s) => s.code === "NIS")!;
    expect(nis.employeePct).toBe(3);
    expect(nis.employerPct).toBe(3);
    expect(nis.verified).toBe(true);
    expect(nis.asOf).toBe("2026-07-31");
    // untouched statutory items stay unverified
    expect(eff.statutory.find((s) => s.code === "NHT")!.verified).toBe(false);
  });

  it("does not mutate the shared baseline object", () => {
    applyRulePackOverride(base, { defaultTaxRatePct: 99, statutoryRates: { NIS: { employeePct: 9 } } });
    expect(base.defaultTaxRatePct).toBe(15);
    expect(base.statutory.find((s) => s.code === "NIS")!.employeePct ?? null).toBeNull();
  });

  it("getEffectiveJurisdiction resolves baseline + override in one call", () => {
    expect(getEffectiveJurisdiction("JM", { defaultTaxRatePct: 10 }).defaultTaxRatePct).toBe(10);
  });
});

describe("supportedJurisdictions / jurisdictionCurrency", () => {
  it("lists Jamaica today", () => {
    expect(supportedJurisdictions()).toContain("JM");
  });

  it("resolves the currency for a jurisdiction", () => {
    expect(jurisdictionCurrency("JM").code).toBe("JMD");
  });
});
