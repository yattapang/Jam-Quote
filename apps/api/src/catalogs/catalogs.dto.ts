import { z } from "zod";
import { PARISHES, RateUnit } from "@jamquote/core";

export const createLabourRateSchema = z.object({
  trade: z.string().min(1),
  skillTier: z.string().optional(),
  rateCents: z.number().int().nonnegative(),
  rateUnit: z.nativeEnum(RateUnit).default(RateUnit.DAY),
});
export type CreateLabourRateInput = z.infer<typeof createLabourRateSchema>;
export const updateLabourRateSchema = createLabourRateSchema.partial();
export type UpdateLabourRateInput = z.infer<typeof updateLabourRateSchema>;

export const createMaterialFavouriteSchema = z.object({
  name: z.string().min(1),
  unit: z.string().optional(),
  priceCents: z.number().int().nonnegative(),
  supplierId: z.string().uuid().optional(),
  // Structured catalog fields (both optional/nullable — see MaterialFavourite
  // in schema.prisma). category names the spec-field set from
  // apps/web/lib/material-categories.ts (e.g. "Steel / Rebar"); specs is a
  // free-form key->value map of that category's spec values.
  category: z.string().optional(),
  specs: z.record(z.string(), z.string()).optional(),
  // Free-text, searchable (see MaterialFavouritesService.findAll). No
  // .min(1) — an empty string is a valid value used to clear a previously
  // set description, distinct from `undefined` (leave unchanged on PATCH).
  description: z.string().max(500).optional(),
});
export type CreateMaterialFavouriteInput = z.infer<typeof createMaterialFavouriteSchema>;
export const updateMaterialFavouriteSchema = createMaterialFavouriteSchema.partial();
export type UpdateMaterialFavouriteInput = z.infer<typeof updateMaterialFavouriteSchema>;

/** Max rows GET /catalogs/material-favourites?limit= can return in one call. */
export const MATERIAL_FAVOURITE_QUERY_MAX_LIMIT = 200;

export const materialFavouriteQuerySchema = z.object({
  // Case-insensitive search across name, description, and the values inside
  // the `specs` JSON (see MaterialFavouritesService.findAll for how the
  // specs match is done). Blank/whitespace-only is treated as "no filter".
  q: z.string().trim().min(1).optional(),
  // Exact match on the existing free-text category string.
  category: z.string().trim().min(1).optional(),
  // Coerced from the query string; capped (not rejected) at
  // MATERIAL_FAVOURITE_QUERY_MAX_LIMIT so a caller asking for too much just
  // gets the cap instead of a 400.
  limit: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .transform((v) => (v === undefined ? undefined : Math.min(v, MATERIAL_FAVOURITE_QUERY_MAX_LIMIT))),
});
export type MaterialFavouriteQuery = z.infer<typeof materialFavouriteQuerySchema>;

export const createEquipmentItemSchema = z.object({
  name: z.string().min(1),
  owned: z.boolean().default(false),
  vendor: z.string().optional(),
  vendorPhone: z.string().optional(),
  rateCents: z.number().int().nonnegative(),
  rateUnit: z.nativeEnum(RateUnit).default(RateUnit.DAY),
});
export type CreateEquipmentItemInput = z.infer<typeof createEquipmentItemSchema>;
export const updateEquipmentItemSchema = createEquipmentItemSchema.partial();
export type UpdateEquipmentItemInput = z.infer<typeof updateEquipmentItemSchema>;

export const createSupplierSchema = z.object({
  name: z.string().min(1),
  website: z.string().url().optional(),
  parish: z.enum(PARISHES).optional(),
  isPartner: z.boolean().default(false),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
