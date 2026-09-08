import { z } from "zod";
import { ProjectStage } from "@jamquote/core";
import { clientFieldRules } from "../clients/clients.dto.js";

/** Pull everything changed since this server cursor (ISO). Omit for a full sync. */
export const pullSchema = z.object({
  since: z.string().datetime().optional(),
});
export type PullInput = z.infer<typeof pullSchema>;

// A device sends changes with a client-generated UUID id, an op, and its local
// mutation time (updatedAt) used as the last-write-wins tiebreak. `data` is
// required for upserts, absent for deletes.
/**
 * The same VALUE rules as `POST /clients`, with sync's own presence rule.
 *
 * These were restated here as bare `z.string()`, so the sync door accepted an
 * invalid email and a non-existent parish into the very columns the REST door
 * guards. Reusing `clientFieldRules` makes that divergence impossible instead of
 * something someone has to notice.
 *
 * `.nullish()` rather than `.optional()` is deliberate and different: on this
 * path a null means the DEVICE CLEARED the field, which is a change to
 * replicate, while absent means untouched.
 */
const clientDataSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().max(80).optional(),
  phone: clientFieldRules.phone.nullish(),
  whatsapp: clientFieldRules.whatsapp.nullish(),
  email: clientFieldRules.email.nullish(),
  addressLine: clientFieldRules.addressLine.nullish(),
  town: clientFieldRules.town.nullish(),
  parish: clientFieldRules.parish.nullish(),
  notes: clientFieldRules.notes.nullish(),
});

const projectDataSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().uuid().nullish(),
  addressLine: z.string().nullish(),
  town: z.string().nullish(),
  parish: z.string().nullish(),
  // Same enum the REST DTO takes (#36). A device that still sends the old free
  // text now gets a 400 instead of writing a value the column can no longer
  // hold — and the stage it sends survives the round-trip rather than being
  // quietly rewritten to the default.
  stage: z.nativeEnum(ProjectStage).optional(),
  progressPct: z.number().int().min(0).max(100).optional(),
});

const changeSchema = <T extends z.ZodTypeAny>(data: T) =>
  z
    .object({
      id: z.string().uuid(),
      op: z.enum(["upsert", "delete"]),
      updatedAt: z.string().datetime(),
      data: data.optional(),
    })
    .refine((c) => c.op === "delete" || c.data !== undefined, {
      message: "data is required for an upsert",
    });

export const pushSchema = z.object({
  clients: z.array(changeSchema(clientDataSchema)).default([]),
  projects: z.array(changeSchema(projectDataSchema)).default([]),
});
export type PushInput = z.infer<typeof pushSchema>;
export type ClientChange = PushInput["clients"][number];
export type ProjectChange = PushInput["projects"][number];
