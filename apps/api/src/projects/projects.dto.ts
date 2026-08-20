import { z } from "zod";
import { ProjectStage, PARISHES } from "@jamquote/core";

export const createProjectSchema = z.object({
  clientId: z.string().min(1).optional(),
  name: z.string().min(1),
  addressLine: z.string().optional(),
  town: z.string().max(80).optional(),
  parish: z.enum(PARISHES).optional(),
  // Both hand-set (#36): the server knows about quotes and invoices, not about
  // whether the block work has started, so neither is ever derived.
  stage: z.nativeEnum(ProjectStage).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
  /**
   * Default retention for invoices raised on this job — a percentage the
   * client withholds until sign-off, normal in Jamaican construction.
   *
   * The DEFAULT only. Each invoice keeps its own, so changing this mid-job
   * cannot restate a document the client is already holding. Null clears it.
   */
  retentionPct: z.number().min(0).max(100).nullable().optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
