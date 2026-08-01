/**
 * Jurisdiction rule-pack seam.
 *
 * Every value that differs by country — currency, the consumption-tax label and
 * rate, the taxpayer-ID format, the administrative regions, the available
 * payment rails, and the payroll statutory contributions — is resolved through
 * `getJurisdiction(countryCode)` rather than hardcoded. Today this is a static
 * table with **Jamaica only**; the Phase 0 rule-pack engine (versioned,
 * DB-backed, human-verified against TAJ/Gazette, with a regulatory-monitoring
 * feed) slots in behind this exact interface later without touching quote,
 * invoice, tax, or payroll code.
 *
 * The credibility rule this encodes: nothing below this seam should hardcode a
 * jurisdiction value. Rates carry `verified` + `asOf` + `source` provenance so
 * "verified for Jamaica" is a property of the data, not a marketing claim.
 */
import { GctTreatment, PaymentMethod, PARISHES } from "../types/enums.js";
import { trnSchema } from "../types/validators.js";
import { CURRENCIES, getCurrency, type Currency } from "../tax/money.js";

export interface TaxTreatmentDef {
  /** Matches the GctTreatment / tax-treatment enum value applied to a line. */
  code: string;
  label: string;
}

export interface PaymentProviderDef {
  /** Stored in Payment.providerCode. */
  code: string;
  label: string;
  method: (typeof PaymentMethod)[keyof typeof PaymentMethod];
}

/**
 * A statutory payroll contribution (Phase 6). The shape is present now so
 * payroll consumes the same versioned rule-pack as consumption tax; Jamaica's
 * rates are left unverified until a human sources them from TAJ.
 */
export interface StatutoryContributionDef {
  code: string; // "NIS" | "NHT" | "EDUCATION_TAX" | "HEART"
  label: string;
  appliesTo: "EMPLOYEE" | "EMPLOYER" | "BOTH" | "SELF_EMPLOYED";
  /** null until a rate is sourced and verified. */
  ratePct: number | null;
  /** Split rates when known — filled from a rule-pack override (Phase 6 uses
   * them). null/undefined until an admin sources them. */
  employeePct?: number | null;
  employerPct?: number | null;
  verified: boolean;
  asOf: string | null; // ISO date the rate was verified
  source: string | null;
  note?: string;
}

export interface JurisdictionProfile {
  countryCode: string; // ISO 3166-1 alpha-2
  countryName: string;
  currency: Currency;

  // Consumption tax
  taxLabel: string; // "GCT" (JM) / "VAT" (most of the Caribbean)
  taxLongName: string;
  defaultTaxRatePct: number;
  taxTreatments: TaxTreatmentDef[];

  // Taxpayer identity
  taxpayerId: {
    label: string; // "TRN"
    /** Returns true if `value` is a valid ID for this jurisdiction. */
    validate: (value: string) => boolean;
  };

  // Geography
  regionLabel: string; // "Parish"
  regions: readonly string[];

  // Payment rails available in-country
  paymentProviders: PaymentProviderDef[];

  // Payroll / statutory (shape present now; rates verified later)
  statutory: StatutoryContributionDef[];

  // Provenance for the whole pack
  rulePackVersion: string;
  verifiedAsOf: string | null;
  sources: string[];
}

const JAMAICA: JurisdictionProfile = {
  countryCode: "JM",
  countryName: "Jamaica",
  currency: CURRENCIES.JMD,

  taxLabel: "GCT",
  taxLongName: "General Consumption Tax",
  defaultTaxRatePct: 15, // verified: TAJ standard rate
  taxTreatments: [
    { code: GctTreatment.STANDARD, label: "Standard" },
    { code: GctTreatment.ZERO_RATED, label: "Zero-rated" },
    { code: GctTreatment.EXEMPT, label: "Exempt" },
  ],

  taxpayerId: {
    label: "TRN",
    validate: (value) => trnSchema.safeParse(value).success,
  },

  regionLabel: "Parish",
  regions: PARISHES,

  paymentProviders: [
    { code: "LYNK", label: "Lynk", method: PaymentMethod.MOBILE_MONEY },
    { code: "GK_ONE", label: "GK One", method: PaymentMethod.MOBILE_MONEY },
  ],

  // Statutory payroll deductions exist in the framework; rates NOT yet
  // human-verified — Phase 6 sources them from TAJ before use.
  statutory: [
    { code: "NIS", label: "National Insurance Scheme", appliesTo: "BOTH", ratePct: null, verified: false, asOf: null, source: null },
    { code: "NHT", label: "National Housing Trust", appliesTo: "BOTH", ratePct: null, verified: false, asOf: null, source: null },
    { code: "EDUCATION_TAX", label: "Education Tax", appliesTo: "BOTH", ratePct: null, verified: false, asOf: null, source: null },
    { code: "HEART", label: "HEART Trust/NTA", appliesTo: "EMPLOYER", ratePct: null, verified: false, asOf: null, source: null },
  ],

  rulePackVersion: "jm-2026.07",
  verifiedAsOf: "2026-07-10", // consumption-tax rate/treatments verified as of this date
  sources: [
    "https://www.jamaicatax.gov.jm/general-consumption-tax-gct-",
    "https://taxsummaries.pwc.com/jamaica/corporate/other-taxes",
  ],
};

const PROFILES: Record<string, JurisdictionProfile> = {
  JM: JAMAICA,
};

/** Resolve the rule-pack for a country (ISO alpha-2). Throws if unsupported. */
export function getJurisdiction(countryCode: string): JurisdictionProfile {
  const profile = PROFILES[countryCode.toUpperCase()];
  if (!profile) {
    throw new Error(`No jurisdiction rule-pack for country '${countryCode}'`);
  }
  return profile;
}

/** ISO alpha-2 codes JamQuote currently has a rule-pack for. */
export function supportedJurisdictions(): string[] {
  return Object.keys(PROFILES);
}

/** Currency descriptor for a jurisdiction (convenience). */
export function jurisdictionCurrency(countryCode: string): Currency {
  return getCurrency(getJurisdiction(countryCode).currency.code);
}

// ---------------------------------------------------------------------------
// Editable rule-pack overrides (the "lighter" DB-backed step)
// ---------------------------------------------------------------------------
//
// The static profiles above are the verified in-code baseline. A super-admin
// (MANAGE_RULEPACK) can persist an override — the handful of values that change
// often enough to want editing without a code deploy: the consumption-tax rate
// and label, the pack's provenance (verified date + sources), and the statutory
// payroll rates that ship unverified. Everything else (taxpayer-id format,
// regions, payment rails) stays code-owned. Overrides are stored per country in
// the API and merged over the baseline via `applyRulePackOverride`, which is a
// pure function so api, web and mobile all resolve the SAME effective pack.

/** Admin-entered employee/employer split for one statutory contribution. */
export interface StatutoryRateOverride {
  employeePct?: number | null;
  employerPct?: number | null;
}

/** The editable slice of a rule-pack. Any omitted field falls back to the
 * static baseline; the shape is deliberately a strict subset of what a full
 * versioned engine would own. */
export interface RulePackOverride {
  taxLabel?: string;
  defaultTaxRatePct?: number;
  /** ISO date the pack was last human-verified; null clears it. */
  verifiedAsOf?: string | null;
  sources?: string[];
  /** Keyed by statutory code (NIS / NHT / EDUCATION_TAX / HEART). */
  statutoryRates?: Record<string, StatutoryRateOverride>;
  rulePackVersion?: string;
}

/** The fields `applyRulePackOverride` will honour — the source of truth for
 * both API validation and the admin edit form. */
export const EDITABLE_RULEPACK_FIELDS = [
  "taxLabel",
  "defaultTaxRatePct",
  "verifiedAsOf",
  "sources",
  "statutoryRates",
  "rulePackVersion",
] as const;

/**
 * Merge a stored override over the static baseline, returning a fully-resolved
 * `JurisdictionProfile`. Pure and total: a null/empty override returns the
 * baseline unchanged. Only the editable slice is touched — currency, taxpayer
 * id, regions and payment rails always come from code.
 */
export function applyRulePackOverride(
  base: JurisdictionProfile,
  override?: RulePackOverride | null,
): JurisdictionProfile {
  if (!override) return base;
  return {
    ...base,
    taxLabel: override.taxLabel ?? base.taxLabel,
    defaultTaxRatePct: override.defaultTaxRatePct ?? base.defaultTaxRatePct,
    verifiedAsOf:
      override.verifiedAsOf !== undefined ? override.verifiedAsOf : base.verifiedAsOf,
    sources: override.sources ?? base.sources,
    rulePackVersion: override.rulePackVersion ?? base.rulePackVersion,
    statutory: base.statutory.map((s) => {
      const o = override.statutoryRates?.[s.code];
      if (!o) return s;
      const employeePct = o.employeePct ?? null;
      const employerPct = o.employerPct ?? null;
      const anySet = employeePct !== null || employerPct !== null;
      return {
        ...s,
        employeePct,
        employerPct,
        // An admin-entered rate is vouched-for; reflect that in provenance so
        // the console doesn't keep showing it as unverified.
        verified: anySet ? true : s.verified,
        asOf: anySet ? (override.verifiedAsOf ?? s.asOf) : s.asOf,
      };
    }),
  };
}

/** Resolve the effective (baseline + override) pack for a country in one call. */
export function getEffectiveJurisdiction(
  countryCode: string,
  override?: RulePackOverride | null,
): JurisdictionProfile {
  return applyRulePackOverride(getJurisdiction(countryCode), override);
}
