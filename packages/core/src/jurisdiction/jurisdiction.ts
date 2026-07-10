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
