import { z } from "zod";
import { ADMIN_CAPABILITIES } from "@jamquote/core";

// zod's z.enum needs a non-empty string tuple; ADMIN_CAPABILITIES is the
// single source of truth for valid capability values (from core).
const capabilityEnum = z.enum(ADMIN_CAPABILITIES as [string, ...string[]]);

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

/** Body for POST /admin/admins — promote an EXISTING user (by email) to an
 * internal admin with the given capabilities. isSuperAdmin may only be set by
 * a super-admin (enforced in AdminService). */
export const promoteAdminSchema = z.object({
  email: z.string().email(),
  capabilities: z.array(capabilityEnum).default([]),
  isSuperAdmin: z.boolean().optional(),
});
export type PromoteAdminInput = z.infer<typeof promoteAdminSchema>;

/** Body for PATCH /admin/admins/:id — update an admin's capabilities and/or
 * super-admin status. At least one field required. */
export const updateAdminSchema = z
  .object({
    capabilities: z.array(capabilityEnum).optional(),
    isSuperAdmin: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateAdminInput = z.infer<typeof updateAdminSchema>;
