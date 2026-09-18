import { z } from "zod";
import {
  BOUNDS,
  INT32_MAX_CENTS,
  JobComponentKind,
  boundedNumber,
  centsSchema,
  computeJobUnitCostCents,
} from "@jamquote/core";

/** A job's recipe is edited by hand, one row per material/labour/other
 * component; 200 is already far beyond any recipe a contractor has typed,
 * and without a cap 10,000 rows passed validation and were then inserted
 * one by one inside a single transaction (jobs.service.ts). */
export const MAX_COMPONENTS = 200;
export const componentsMaxMessage = `A job can have at most ${MAX_COMPONENTS} components`;

/**
 * A component's quantity and unit price each pass their own per-field cap,
 * but the two multiply together and then sum across every component before
 * markup — a quantity of 999,999,999 and a unit price at its own cap of
 * 2,147,483,647 cents both pass validation individually while the job's cost
 * overflows the database's Int32 `unitPriceCents` column the job's cost is
 * later copied into (a quote line). Using computeJobUnitCostCents itself
 * (rather than re-deriving the same arithmetic here) means this check and
 * the real calculation can never disagree — and it also cannot throw the
 * RangeError computeJobUnitCostCents raises past Number.MAX_SAFE_INTEGER,
 * because that only happens well beyond where this Int32 check already
 * refuses the payload.
 */
function costFitsInt32(components: JobComponentInput[], markupPct: number | undefined): boolean {
  try {
    const cost = computeJobUnitCostCents({
      components: components.map((c) => ({
        quantityPerUnit: c.quantityPerUnit,
        unitPriceCents: c.unitPriceCents,
      })),
      markupPct,
    });
    return cost <= INT32_MAX_CENTS;
  } catch {
    // Number.MAX_SAFE_INTEGER overflow: certainly too large.
    return false;
  }
}
const jobCostTooLargeMessage = "This job's cost is too large";

// materialFavouriteId/labourRateId are optional recompute back-references,
// not required — a component may be freeform (no library link).
export const assemblyComponentInputSchema = z.object({
  kind: z.nativeEnum(JobComponentKind),
  materialFavouriteId: z.string().max(64).min(1).optional(),
  labourRateId: z.string().max(64).min(1).optional(),
  equipmentItemId: z.string().max(64).min(1).optional(),
  description: z.string().trim().min(1).max(500),
  quantityPerUnit: boundedNumber({ ...BOUNDS.quantity, positiveOnly: true }),
  /** What the quantity counts — "trip", "day". Free text; absent prints bare. */
  unitLabel: z.string().trim().min(1).max(40).optional(),
  unitPriceCents: centsSchema("unitPriceCents", { label: "Unit price" }),
  sort: z.number().int().nonnegative().optional(),
});
export type JobComponentInput = z.infer<typeof assemblyComponentInputSchema>;

/** Create shape: `components` groups the job's material/labour/other recipe lines. */
export const createJobSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    unit: z.string().trim().min(1).max(40),
    markupPct: boundedNumber(BOUNDS.markupPct).optional(),
    components: z.array(assemblyComponentInputSchema).max(MAX_COMPONENTS, componentsMaxMessage).default([]),
  })
  .refine((v) => costFitsInt32(v.components, v.markupPct), {
    message: jobCostTooLargeMessage,
    path: ["components"],
  });
export type CreateJobInput = z.infer<typeof createJobSchema>;

/**
 * Update replaces name/unit/markup and — only when `components` is
 * included in the payload — fully replaces the component set (delete old,
 * insert new). Omitting `components` leaves the existing recipe untouched.
 *
 * No static `.max(MAX_COMPONENTS)` here (unlike create): a job saved before
 * the 200 cap existed can already have more rows than that, and the DTO has
 * no way to know the stored count. jobs.service.ts#update enforces the cap
 * only when an edit would GROW an existing job past 200, so a grandfathered
 * job can still be renamed or otherwise saved without shedding rows.
 */
export const updateJobSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    unit: z.string().trim().min(1).max(40).optional(),
    markupPct: boundedNumber(BOUNDS.markupPct).optional(),
    components: z.array(assemblyComponentInputSchema).optional(),
  })
  .refine((v) => v.components === undefined || costFitsInt32(v.components, v.markupPct), {
    message: jobCostTooLargeMessage,
    path: ["components"],
  });
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
