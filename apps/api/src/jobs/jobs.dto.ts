import { z } from "zod";
import { ProjectStage, PARISHES } from "@jamquote/core";

export const createJobSchema = z.object({
  clientId: z.string().min(1).optional(),
  name: z.string().min(1),
  addressLine: z.string().optional(),
  town: z.string().max(80).optional(),
  parish: z.enum(PARISHES).optional(),
  // Both hand-set (#36): the server knows about quotes and invoices, not about
  // whether the block work has started, so neither is ever derived.
  stage: z.nativeEnum(ProjectStage).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
});
export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = createJobSchema.partial();
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
