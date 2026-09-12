import { z } from "zod";
import { isHttpUrl } from "@jamquote/core";

/**
 * A web address we are willing to put in an `href`.
 *
 * `z.string().url()` accepts `javascript:`, `mailto:` and `ftp:`, and both of the
 * screens that render `sourceUrl` render it as a link — one of them the contractor
 * dashboard, which is tenant-facing. `isHttpUrl` lives in core so the DTO, the client
 * validator and the render guard spend one definition; it was previously a private
 * function in one web module, applied to one form and neither of the other two places.
 */
const httpUrl = z.string().refine(isHttpUrl, {
  message: "Must be a full web address starting http:// or https://",
});

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
    sourceUrl: z.union([httpUrl, z.literal("")]).nullable().optional(),
    /** Keyed by statutory code (NIS / NHT / EDUCATION_TAX / HEART). */
    statutoryRates: z.record(z.string(), statutoryRateSchema).optional(),
    /**
     * Contributions the in-code baseline does not know about. This is what
     * makes the pack maintainable without a release: a new levy can be
     * recorded from the console instead of waiting on a deploy.
     *
     * `code` is uppercased and stripped of spaces so it can be matched against
     * a baseline code — "new levy" and "NEW_LEVY" must not become two rows.
     */
    statutoryCustom: z
      .array(
        z.object({
          code: z
            .string()
            .min(1)
            .max(40)
            .transform((c) => c.trim().toUpperCase().replace(/\s+/g, "_")),
          label: z.string().min(1).max(80),
          appliesTo: z.enum(["EMPLOYEE", "EMPLOYER", "BOTH", "SELF_EMPLOYED"]),
          employeePct: ratePct.nullable().optional(),
          employerPct: ratePct.nullable().optional(),
          note: z.string().max(300).optional(),
        }),
      )
      .optional(),
    /** Baseline codes to stop showing — a withdrawn contribution. */
    statutoryRetired: z.array(z.string().min(1)).optional(),
    /** Pages to check when verifying. Replaces the list wholesale. */
    sources: z.array(httpUrl).max(20).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateRulePackInput = z.infer<typeof updateRulePackSchema>;
