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

describe("applyRulePackOverride — maintaining the pack without a release", () => {
  /**
   * The set of statutory contributions used to be code-owned: an admin could
   * edit rates for the four known codes, but a new levy could not be recorded
   * without a deploy. A tax authority introducing a charge should not be
   * blocked on a release.
   */
  const base = getJurisdiction("JM");

  it("adds a contribution the baseline has never heard of", () => {
    const merged = applyRulePackOverride(base, {
      statutoryCustom: [
        {
          code: "NEW_LEVY",
          label: "New Infrastructure Levy",
          appliesTo: "EMPLOYER",
          employeePct: null,
          employerPct: 1.5,
        },
      ],
      verifiedAsOf: "2026-08-18",
    });
    const added = merged.statutory.find((s) => s.code === "NEW_LEVY");
    expect(added?.employerPct).toBe(1.5);
    // Entered by an admin against a source, so it counts as verified and
    // carries the pack's verification date rather than a baseline one it was
    // never part of.
    expect(added?.verified).toBe(true);
    expect(added?.asOf).toBe("2026-08-18");
  });

  it("keeps every baseline contribution alongside a new one", () => {
    const merged = applyRulePackOverride(base, {
      statutoryCustom: [
        { code: "X", label: "X", appliesTo: "BOTH" },
      ],
    });
    expect(merged.statutory.length).toBe(base.statutory.length + 1);
  });

  it("replaces a baseline entry in place when the code matches, rather than duplicating", () => {
    const first = base.statutory[0]!;
    const merged = applyRulePackOverride(base, {
      statutoryCustom: [{ ...first, label: "Renamed contribution" }],
    });
    const matching = merged.statutory.filter((s) => s.code === first.code);
    expect(matching).toHaveLength(1);
    expect(matching[0]?.label).toBe("Renamed contribution");
    // Position is preserved — a rename should not reorder the table.
    expect(merged.statutory[0]?.code).toBe(first.code);
  });

  it("retires a withdrawn contribution without deleting it from the baseline", () => {
    const victim = base.statutory[0]!.code;
    const merged = applyRulePackOverride(base, { statutoryRetired: [victim] });
    expect(merged.statutory.some((s) => s.code === victim)).toBe(false);
    // Reversible: the baseline still knows about it.
    expect(base.statutory.some((s) => s.code === victim)).toBe(true);
  });

  it("a custom entry owns its rates, even for a baseline code", () => {
    /**
     * The defect this is the real fix for, after two failed attempts in the console.
     *
     * `mergeStatutory` consumes a custom entry IN PLACE when its code matches a
     * baseline one — that is the documented "replacement" case. But
     * `withAdminProvenance` resolved `statutoryRates[code] ?? input`, so a rate
     * entered in the statutory grid beat the entry that defines the contribution.
     *
     * On screen: the grid showed 3, the custom row showed 7, the effective rate was
     * 3, and editing either box saved successfully and changed nothing. I tried to
     * fix that by rearranging which inputs render and what the payload omits; a
     * review demonstrated both attempts still broken. It is not a screen problem —
     * two stores held one fact and the model had to say which wins.
     */
    const merged = applyRulePackOverride(base, {
      statutoryCustom: [
        {
          code: base.statutory[0]!.code,
          label: "NIS (revised)",
          appliesTo: "BOTH",
          employeePct: 7,
          employerPct: 7,
        },
      ],
      statutoryRates: { [base.statutory[0]!.code]: { employeePct: 3, employerPct: 3 } },
    });

    const entry = merged.statutory.find((s) => s.code === base.statutory[0]!.code);
    expect(entry?.employeePct, "the full definition wins, not the rate override").toBe(7);
    expect(entry?.employerPct).toBe(7);
    expect(entry?.label).toBe("NIS (revised)");
    // And it is still ONE row — the replacement is consumed in place.
    expect(merged.statutory.filter((s) => s.code === base.statutory[0]!.code)).toHaveLength(1);
  });

  it("a custom entry with no rates reads as unsourced, not as the old rate", () => {
    // The same precedence, in the direction that matters for honesty: blanking a
    // custom entry's rates must not silently fall back to a stale `statutoryRates`
    // value, or the screen shows a figure nobody entered.
    const merged = applyRulePackOverride(base, {
      statutoryCustom: [
        {
          code: base.statutory[0]!.code,
          label: "NIS (revised)",
          appliesTo: "BOTH",
          employeePct: null,
          employerPct: null,
        },
      ],
      statutoryRates: { [base.statutory[0]!.code]: { employeePct: 3, employerPct: 3 } },
    });
    const entry = merged.statutory.find((s) => s.code === base.statutory[0]!.code);
    expect(entry?.employeePct).toBeNull();
    expect(entry?.verified, "nothing was sourced, so nothing is vouched for").toBe(false);
  });

  it("a statutoryRates entry still applies to a baseline code nobody replaced", () => {
    // The case the change must NOT break: the grid is still the editor for the four
    // baseline contributions.
    const merged = applyRulePackOverride(base, {
      statutoryRates: { [base.statutory[0]!.code]: { employeePct: 3, employerPct: 2.5 } },
    });
    const entry = merged.statutory.find((s) => s.code === base.statutory[0]!.code);
    expect(entry?.employeePct).toBe(3);
    expect(entry?.employerPct).toBe(2.5);
    expect(entry?.verified).toBe(true);
  });

  it("retires a contribution an admin ADDED, not just a baseline one", () => {
    // The defect: `retired` was applied to baseline entries only, and whatever was
    // left in the custom map was appended unconditionally. So retiring a levy the
    // admin had added themselves wrote the code into `statutoryRetired`, reported
    // success, and left the levy in the payroll table for ever — the kind of entry a
    // staffer is most likely to withdraw was the one kind that could not be.
    const merged = applyRulePackOverride(base, {
      statutoryCustom: [
        {
          code: "PARISH_LEVY",
          label: "Parish levy",
          appliesTo: "BOTH",
          employeePct: 1,
          employerPct: 1,
        },
      ],
      statutoryRetired: ["PARISH_LEVY"],
    });
    expect(merged.statutory.some((s) => s.code === "PARISH_LEVY")).toBe(false);
  });

  it("a retirement reverses when the code leaves the retired list", () => {
    // What "reversible" actually means: the same override with the code removed
    // brings the contribution back, with its real label rather than a stub. The
    // existing test asserted that the BASELINE object was untouched, which is true
    // of any pure function and says nothing about whether a staffer can undo this.
    const victim = base.statutory[0]!;
    const retired = applyRulePackOverride(base, { statutoryRetired: [victim.code] });
    expect(retired.statutory.some((s) => s.code === victim.code)).toBe(false);

    const restored = applyRulePackOverride(base, { statutoryRetired: [] });
    const back = restored.statutory.find((s) => s.code === victim.code);
    expect(back).toBeDefined();
    expect(back?.label).toBe(victim.label);
    // And the order is the baseline order, so un-retiring does not move the row.
    expect(restored.statutory.map((s) => s.code)).toEqual(base.statutory.map((s) => s.code));
  });

  it("retiring a code that was never there changes nothing", () => {
    // A stale code left in the list by an earlier release must not shorten the table
    // or throw — the console seeds its editor from this list.
    const merged = applyRulePackOverride(base, { statutoryRetired: ["NO_SUCH_LEVY"] });
    expect(merged.statutory.map((s) => s.code)).toEqual(base.statutory.map((s) => s.code));
  });

  it("retiring wins over a rate edit for the same code", () => {
    const victim = base.statutory[0]!.code;
    const merged = applyRulePackOverride(base, {
      statutoryRetired: [victim],
      statutoryRates: { [victim]: { employeePct: 5 } },
    });
    expect(merged.statutory.some((s) => s.code === victim)).toBe(false);
  });

  it("replaces the sources list, so the URLs to check are maintainable", () => {
    const merged = applyRulePackOverride(base, {
      sources: ["https://example.gov.jm/rates", "https://example.gov.jm/gazette"],
    });
    expect(merged.sources).toEqual([
      "https://example.gov.jm/rates",
      "https://example.gov.jm/gazette",
    ]);
  });

  it("leaves the baseline untouched when nothing is overridden", () => {
    expect(applyRulePackOverride(base, {}).statutory).toEqual(base.statutory);
  });
});
