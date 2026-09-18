import { z } from "zod";
import { BOUNDS, JobComponentKind, boundedNumber, centsSchema } from "@jamquote/core";

/** A job's recipe is edited by hand, one row per material/labour/other
 * component; 200 is already far beyond any recipe a contractor has typed,
 * and without a cap 10,000 rows passed validation and were then inserted
 * one by one inside a single transaction (jobs.service.ts). */
const MAX_COMPONENTS = 200;
const componentsMaxMessage = `A job can have at most ${MAX_COMPONENTS} components`;

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
  unitPriceCents: centsSchema("unitPriceCents"),
  sort: z.number().int().nonnegative().optional(),
});
export type JobComponentInput = z.infer<typeof assemblyComponentInputSchema>;

/** Create shape: `components` groups the job's material/labour/other recipe lines. */
export const createJobSchema = z.object({
  name: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(40),
  markupPct: boundedNumber(BOUNDS.markupPct).optional(),
  components: z.array(assemblyComponentInputSchema).max(MAX_COMPONENTS, componentsMaxMessage).default([]),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

/**
 * Update replaces name/unit/markup and — only when `components` is
 * included in the payload — fully replaces the component set (delete old,
 * insert new). Omitting `components` leaves the existing recipe untouched.
 */
export const updateJobSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  markupPct: boundedNumber(BOUNDS.markupPct).optional(),
  components: z.array(assemblyComponentInputSchema).max(MAX_COMPONENTS, componentsMaxMessage).optional(),
});
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
