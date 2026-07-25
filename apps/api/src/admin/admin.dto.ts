import { z } from "zod";

export const setTenantPlanSchema = z.object({
  plan: z.enum(["free", "pro"]),
  renewsAt: z.string().datetime().optional(),
});
export type SetTenantPlanInput = z.infer<typeof setTenantPlanSchema>;

/** Body for DELETE /admin/tenants/:id — must match the business's exact name. */
export const hardDeleteTenantSchema = z.object({
  confirmName: z.string().min(1),
});
export type HardDeleteTenantInput = z.infer<typeof hardDeleteTenantSchema>;

export const createSupplierSchema = z.object({
  name: z.string().min(1),
  website: z.string().url().optional(),
  parish: z.string().min(1).optional(),
  isPartner: z.boolean().optional(),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;
