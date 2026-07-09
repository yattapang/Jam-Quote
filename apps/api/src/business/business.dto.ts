import { z } from "zod";
import { PARISHES, trnSchema } from "@jamquote/core";

export const createBusinessSchema = z.object({
  name: z.string().min(1),
  trn: trnSchema.optional(),
  logoUrl: z.string().url().optional(),
  addressLine: z.string().optional(),
  parish: z.enum(PARISHES).optional(),
  tradeType: z.string().optional(),
  defaultGctRate: z.number().min(0).max(100).optional(),
  quotePrefix: z.string().min(1).optional(),
  invoicePrefix: z.string().min(1).optional(),
  jmdPerUsd: z.number().positive().optional(),
});
export type CreateBusinessInput = z.infer<typeof createBusinessSchema>;

export const updateBusinessSchema = createBusinessSchema.partial();
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
