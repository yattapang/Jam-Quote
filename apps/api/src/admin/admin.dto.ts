import { z } from "zod";

export const setTenantPlanSchema = z.object({
  plan: z.enum(["free", "pro"]),
  renewsAt: z.string().datetime().optional(),
});
export type SetTenantPlanInput = z.infer<typeof setTenantPlanSchema>;
