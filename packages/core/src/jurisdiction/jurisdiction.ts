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
/**
 * What an admin actually types when adding a contribution. Deliberately NOT
 * StatutoryContributionDef: `verified`, `asOf`, `ratePct` and `source` are
 * provenance the merge derives, not fields to fill in — asking for them would
 * invite an entry that claims to be verified because someone ticked a box.
 */
export interface StatutoryContributionInput {
  code: string;
  label: string;
  appliesTo: StatutoryContributionDef["appliesTo"];
  employeePct?: number | null;
  employerPct?: number | null;
  note?: string;
}

export interface RulePackOverride {
  taxLabel?: string;
  defaultTaxRatePct?: number;
  /** ISO date the pack was last human-verified; null clears it. */
  verifiedAsOf?: string | null;
  sources?: string[];
  /** Keyed by statutory code (NIS / NHT / EDUCATION_TAX / HEART). */
  statutoryRates?: Record<string, StatutoryRateOverride>;
  /**
   * Contributions the baseline does not know about, added by an admin.
   *
   * Without this the SET of statutory items was code-owned: rates for the four
   * known codes could be edited, but a new levy could not be recorded without
   * a release. A tax authority introducing a charge should not be blocked on a
   * deploy — that is precisely the maintenance the console exists to do.
   *
   * A custom entry whose code matches a baseline one REPLACES it, so a
   * renamed contribution is a rename rather than a duplicate row.
   */
  statutoryCustom?: StatutoryContributionInput[];
  /**
   * Baseline codes to stop showing — a contribution that has been withdrawn.
   * Removal is expressed as a retirement rather than by deleting from the
   * baseline, so the code stays documented and the decision is reversible.
   */
  statutoryRetired?: string[];
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
  "statutoryCustom",
  "statutoryRetired",
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
    statutory: mergeStatutory(base, override),
  };
}

/**
 * Baseline contributions (minus any retired, with admin rates applied), then
 * the admin's own additions.
 *
 * A custom entry sharing a baseline code replaces it in place rather than
 * appending, so renaming a contribution does not produce two rows claiming the
 * same levy.
 */
function mergeStatutory(
  base: JurisdictionProfile,
  override: RulePackOverride,
): StatutoryContributionDef[] {
  const retired = new Set(override.statutoryRetired ?? []);
  const custom = new Map((override.statutoryCustom ?? []).map((c) => [c.code, c]));

  const fromBaseline = base.statutory
    .filter((s) => !retired.has(s.code))
    .map((s) => {
      const replacement = custom.get(s.code);
      if (replacement) {
        custom.delete(s.code); // consumed in place, not appended below
        return withAdminProvenance(replacement, override);
      }
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
    });

  // Whatever is left in `custom` is genuinely new to this jurisdiction.
  return [...fromBaseline, ...[...custom.values()].map((c) => withAdminProvenance(c, override))];
}

/** An admin-entered contribution is vouched-for by the person who entered it,
 * and carries the pack's verification date rather than a baseline one it was
 * never part of. */
function withAdminProvenance(
  input: StatutoryContributionInput,
  override: RulePackOverride,
): StatutoryContributionDef {
  const rate = override.statutoryRates?.[input.code];
  const employeePct = rate?.employeePct ?? input.employeePct ?? null;
  const employerPct = rate?.employerPct ?? input.employerPct ?? null;
  return {
    code: input.code,
    label: input.label,
    appliesTo: input.appliesTo,
    // A single combined ratePct is a baseline concept; an admin-entered
    // contribution is expressed as its employee/employer split.
    ratePct: null,
    employeePct,
    employerPct,
    // Vouched-for by whoever entered it, and dated by the pack's own
    // verification rather than a baseline date it was never part of.
    verified: employeePct !== null || employerPct !== null,
    asOf: override.verifiedAsOf ?? null,
    source: override.sources?.[0] ?? null,
    ...(input.note !== undefined ? { note: input.note } : {}),
  };
}

/** Resolve the effective (baseline + override) pack for a country in one call. */
export function getEffectiveJurisdiction(
  countryCode: string,
  override?: RulePackOverride | null,
): JurisdictionProfile {
  return applyRulePackOverride(getJurisdiction(countryCode), override);
}
