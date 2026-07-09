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
});
export type CreateMaterialFavouriteInput = z.infer<typeof createMaterialFavouriteSchema>;
export const updateMaterialFavouriteSchema = createMaterialFavouriteSchema.partial();
export type UpdateMaterialFavouriteInput = z.infer<typeof updateMaterialFavouriteSchema>;

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
