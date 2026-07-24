import { z } from "zod";

/** Pull everything changed since this server cursor (ISO). Omit for a full sync. */
export const pullSchema = z.object({
  since: z.string().datetime().optional(),
});
export type PullInput = z.infer<typeof pullSchema>;

// A device sends changes with a client-generated UUID id, an op, and its local
// mutation time (updatedAt) used as the last-write-wins tiebreak. `data` is
// required for upserts, absent for deletes.
const clientDataSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  phone: z.string().nullish(),
  whatsapp: z.string().nullish(),
  email: z.string().nullish(),
  addressLine: z.string().nullish(),
  parish: z.string().nullish(),
  notes: z.string().nullish(),
});

const jobDataSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().uuid().nullish(),
  addressLine: z.string().nullish(),
  parish: z.string().nullish(),
  stage: z.string().optional(),
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
  jobs: z.array(changeSchema(jobDataSchema)).default([]),
});
export type PushInput = z.infer<typeof pushSchema>;
export type ClientChange = PushInput["clients"][number];
export type JobChange = PushInput["jobs"][number];
