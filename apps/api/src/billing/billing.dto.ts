import { z } from "zod";

export const updatePricingSchema = z
  .object({
    freeQuotesPerMonth: z.number().int().positive(),
    proMonthlyPriceCents: z.number().int().positive(),
    proAnnualPriceCents: z.number().int().positive(),
    currency: z.string().min(1),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdatePricingInput = z.infer<typeof updatePricingSchema>;
