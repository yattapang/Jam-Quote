import { z } from "zod";
import { JobComponentKind } from "@jamquote/core";

// materialFavouriteId/labourRateId are optional recompute back-references,
// not required — a component may be freeform (no library link).
export const assemblyComponentInputSchema = z.object({
  kind: z.nativeEnum(JobComponentKind),
  materialFavouriteId: z.string().min(1).optional(),
  labourRateId: z.string().min(1).optional(),
  equipmentItemId: z.string().min(1).optional(),
  description: z.string().min(1),
  quantityPerUnit: z.number().positive(),
  /** What the quantity counts — "trip", "day". Free text; absent prints bare. */
  unitLabel: z.string().min(1).optional(),
  unitPriceCents: z.number().int().nonnegative(),
  sort: z.number().int().nonnegative().optional(),
});
export type JobComponentInput = z.infer<typeof assemblyComponentInputSchema>;

/** Create shape: `components` groups the job's material/labour/other recipe lines. */
export const createJobSchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  markupPct: z.number().min(0).optional(),
  components: z.array(assemblyComponentInputSchema).default([]),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

/**
 * Update replaces name/unit/markup and — only when `components` is
 * included in the payload — fully replaces the component set (delete old,
 * insert new). Omitting `components` leaves the existing recipe untouched.
 */
export const updateJobSchema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  markupPct: z.number().min(0).optional(),
  components: z.array(assemblyComponentInputSchema).optional(),
});
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
