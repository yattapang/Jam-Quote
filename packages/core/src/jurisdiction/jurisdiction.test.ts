import { describe, expect, it } from "vitest";
import {
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

describe("supportedJurisdictions / jurisdictionCurrency", () => {
  it("lists Jamaica today", () => {
    expect(supportedJurisdictions()).toContain("JM");
  });

  it("resolves the currency for a jurisdiction", () => {
    expect(jurisdictionCurrency("JM").code).toBe("JMD");
  });
});
