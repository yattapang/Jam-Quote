import { z } from "zod";
import { AssemblyComponentKind } from "@jamquote/core";

// materialFavouriteId/labourRateId are optional recompute back-references,
// not required — a component may be freeform (no library link).
export const assemblyComponentInputSchema = z.object({
  kind: z.nativeEnum(AssemblyComponentKind),
  materialFavouriteId: z.string().min(1).optional(),
  labourRateId: z.string().min(1).optional(),
  description: z.string().min(1),
  quantityPerUnit: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  sort: z.number().int().nonnegative().optional(),
});
export type AssemblyComponentInput = z.infer<typeof assemblyComponentInputSchema>;

/** Create shape: `components` groups the assembly's material/labour/other recipe lines. */
export const createAssemblySchema = z.object({
  name: z.string().min(1),
  unit: z.string().min(1),
  markupPct: z.number().min(0).optional(),
  components: z.array(assemblyComponentInputSchema).default([]),
});
export type CreateAssemblyInput = z.infer<typeof createAssemblySchema>;

/**
 * Update replaces name/unit/markup and — only when `components` is
 * included in the payload — fully replaces the component set (delete old,
 * insert new). Omitting `components` leaves the existing recipe untouched.
 */
export const updateAssemblySchema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  markupPct: z.number().min(0).optional(),
  components: z.array(assemblyComponentInputSchema).optional(),
});
export type UpdateAssemblyInput = z.infer<typeof updateAssemblySchema>;
