import { z } from "zod";
import { PARISHES } from "@jamquote/core";

export const createJobSchema = z.object({
  clientId: z.string().min(1).optional(),
  name: z.string().min(1),
  addressLine: z.string().optional(),
  parish: z.enum(PARISHES).optional(),
  stage: z.string().min(1).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = createJobSchema.partial();
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
