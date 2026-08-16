import { z } from "zod";
import { PARISHES, RateUnit } from "@jamquote/core";

export const createLabourRateSchema = z.object({
  trade: z.string().min(1),
  skillTier: z.string().optional(),
  rateCents: z.number().int().nonnegative(),
  rateUnit: z.nativeEnum(RateUnit).default(RateUnit.DAY),
  // Free-text override for what prints on the document ("sq ft", "window").
  // RateUnit is a closed platform-wide enum of cadences; this is where a
  // contractor's own vocabulary goes. Absent/blank = print the rateUnit.
  unitLabel: z.string().min(1).optional(),
});
export type CreateLabourRateInput = z.infer<typeof createLabourRateSchema>;
export const updateLabourRateSchema = createLabourRateSchema.partial();
export type UpdateLabourRateInput = z.infer<typeof updateLabourRateSchema>;

export const createMaterialFavouriteSchema = z.object({
  // Optional as of 2a: when the material has a category, the name is COMPOSED
  // from its includeInName attributes (MaterialSchemaService.normalizeForWrite)
  // rather than typed. Supply a name together with nameCustom to pin one.
  name: z.string().min(1).optional(),
  nameCustom: z.boolean().optional(),
  // Controlled vocabulary for how the material is sold. Validated against the
  // rows this business may see — a curated unit or one of its own.
  unitId: z.string().uuid().optional(),
  priceCents: z.number().int().nonnegative(),
  supplierId: z.string().uuid().optional(),
  categoryDefId: z.string().uuid().optional(),
  // Keyed by MaterialAttributeDef.key. Unknown keys are rejected; ENUM values
  // outside the vocabulary are accepted and recorded as tenant options.
  specs: z.record(z.string(), z.string()).optional(),
  // Free-text, searchable (see MaterialFavouritesService.findAll). No
  // .min(1) — an empty string is a valid value used to clear a previously
  // set description, distinct from `undefined` (leave unchanged on PATCH).
  description: z.string().max(500).optional(),
  // One-hop purchase conversion; only meaningful together. See #26 units
  // decision — this is deliberately not a general conversion graph.
  measureUnit: z.string().max(40).optional(),
  coveragePerSellUnit: z.number().positive().optional(),
  wastePct: z.number().min(0).max(100).optional(),
  // LEGACY free-text fields, still accepted so pre-2a clients (the mobile app,
  // any cached web bundle) keep working against this endpoint. Superseded by
  // categoryDefId / unitId, which win when both are supplied.
  category: z.string().optional(),
  unit: z.string().optional(),
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
  // Exact match on the legacy free-text category string. Kept for pre-2a
  // clients; new callers filter with categoryDefId.
  category: z.string().trim().min(1).optional(),
  categoryDefId: z.string().uuid().optional(),
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

/**
 * A tenant extending the material vocabulary with its own category or unit
 * (#26). Only a label is accepted — the machine `key` is slugified from it
 * server-side (slugifyKey), because a client-chosen key would end up in
 * stored specs and could collide with a curated one.
 *
 * The 60-char cap is a display constraint: these labels render in the picker
 * chips and the composed material name.
 */
export const createMaterialCategorySchema = z.object({
  label: z.string().trim().min(1).max(60),
});
export type CreateMaterialCategoryInput = z.infer<typeof createMaterialCategorySchema>;

export const createMaterialUnitSchema = z.object({
  label: z.string().trim().min(1).max(60),
});
export type CreateMaterialUnitInput = z.infer<typeof createMaterialUnitSchema>;

export const createEquipmentItemSchema = z.object({
  name: z.string().min(1),
  owned: z.boolean().default(false),
  vendor: z.string().optional(),
  vendorPhone: z.string().optional(),
  rateCents: z.number().int().nonnegative(),
  rateUnit: z.nativeEnum(RateUnit).default(RateUnit.DAY),
  // Free-text override for what prints on the document ("sq ft", "window").
  // RateUnit is a closed platform-wide enum of cadences; this is where a
  // contractor's own vocabulary goes. Absent/blank = print the rateUnit.
  unitLabel: z.string().min(1).optional(),
});
export type CreateEquipmentItemInput = z.infer<typeof createEquipmentItemSchema>;
export const updateEquipmentItemSchema = createEquipmentItemSchema.partial();
export type UpdateEquipmentItemInput = z.infer<typeof updateEquipmentItemSchema>;

/**
 * A contractor adding one of their own merchants. `isPartner` is deliberately
 * NOT accepted: it is a platform designation ("a JamQuote partner merchant"),
 * and since suppliers became tenant-owned there is no admin path that grants
 * it — so allowing it here would let a tenant self-certify. The column stays
 * on the model for the legacy platform rows that predate tenant ownership.
 */
export const createSupplierSchema = z.object({
  name: z.string().min(1),
  website: z.string().url().optional(),
  parish: z.enum(PARISHES).optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

/**
 * Recording an observed supplier price (#26 Phase 2b). Always an INSERT — a
 * new observation never overwrites an old one, because the repeated rows are
 * the price history (see MaterialPriceEntry in schema.prisma).
 */
export const createMaterialPriceEntrySchema = z.object({
  supplierId: z.string().uuid(),
  materialFavouriteId: z.string().uuid(),
  priceCents: z.number().int().nonnegative(),
  // Free-text qualifier on the observation ("delivered", "cash discount").
  note: z.string().max(200).optional(),
  // Defaults to now; accepted so a contractor can back-date a price they were
  // quoted earlier in the week.
  fetchedAt: z.coerce.date().optional(),
});
export type CreateMaterialPriceEntryInput = z.infer<typeof createMaterialPriceEntrySchema>;

export const materialPriceEntryQuerySchema = z.object({
  materialFavouriteId: z.string().uuid(),
});
export type MaterialPriceEntryQuery = z.infer<typeof materialPriceEntryQuerySchema>;
