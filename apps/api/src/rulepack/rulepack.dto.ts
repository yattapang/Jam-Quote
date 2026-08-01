import { z } from "zod";

const ratePct = z.number().min(0).max(100);

/** One statutory contribution's editable split rates. Either side may be null
 * to mean "not sourced yet". */
const statutoryRateSchema = z
  .object({
    employeePct: ratePct.nullable().optional(),
    employerPct: ratePct.nullable().optional(),
  })
  .strict();

/**
 * Body for PATCH /admin/rulepack — the editable slice of a jurisdiction pack.
 * Every field is optional (a partial edit); at least one must be present.
 * Anything omitted keeps the current stored value, and anything never set
 * falls back to the static @jamquote/core baseline.
 */
export const updateRulePackSchema = z
  .object({
    taxLabel: z.string().min(1).max(16).optional(),
    defaultTaxRatePct: ratePct.optional(),
    /** ISO date (YYYY-MM-DD); null clears the verified date. */
    verifiedAsOf: z.string().date().nullable().optional(),
    /** Primary provenance link; null or "" clears it. */
    sourceUrl: z.union([z.string().url(), z.literal("")]).nullable().optional(),
    /** Keyed by statutory code (NIS / NHT / EDUCATION_TAX / HEART). */
    statutoryRates: z.record(z.string(), statutoryRateSchema).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateRulePackInput = z.infer<typeof updateRulePackSchema>;
