import { CURRENCY_CODES, centsSchema } from "@jamquote/core";
import { z } from "zod";

export const updatePricingSchema = z
  .object({
    freeQuotesPerMonth: z.number().int().positive(),
    proMonthlyPriceCents: centsSchema("proMonthlyPriceCents", { positiveOnly: true }),
    proAnnualPriceCents: centsSchema("proAnnualPriceCents", { positiveOnly: true }),
    // An ISO code the platform actually knows, not eight free characters. Money on
    // the staff console renders through a currency descriptor, so an unrecognised
    // code used to put a JMD symbol beside the letters "USD" on every figure.
    currency: z.enum(CURRENCY_CODES),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdatePricingInput = z.infer<typeof updatePricingSchema>;
