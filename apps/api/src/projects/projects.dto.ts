import { z } from "zod";
import { ProjectStage, PARISHES } from "@jamquote/core";

/**
 * What a valid value for each project field IS, with no statement about
 * presence.
 *
 * Extracted for the same reason as `clientFieldRules`: there are TWO doors into
 * this table and they had drifted. `POST /projects` required `parish` to be one
 * of the fourteen and capped `town` at 80; `POST /sync` accepted any string for
 * both. A parish keys the jurisdiction rule-pack, so an invented one silently
 * matches nothing.
 *
 * What made it hard to spot: the sync schema carries a comment reading "Same
 * enum the REST DTO takes" — correct, and about `stage`, sitting two lines below
 * a `parish` that was still free text. A right idea next to the wrong field.
 */
export const projectFieldRules = {
  name: z.string().min(1).max(120),
  addressLine: z.string().max(200),
  town: z.string().max(80),
  parish: z.enum(PARISHES),
} as const;

export const createProjectSchema = z.object({
  clientId: z.string().min(1).optional(),
  // Required on create; updateProjectSchema derives from this via .partial().
  name: projectFieldRules.name,
  addressLine: projectFieldRules.addressLine.optional(),
  town: projectFieldRules.town.optional(),
  parish: projectFieldRules.parish.optional(),
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
