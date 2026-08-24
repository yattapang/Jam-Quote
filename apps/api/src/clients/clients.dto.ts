import { z } from "zod";
import { PARISHES, trnSchema } from "@jamquote/core";

// Shared optional fields for both create and update.
const clientContactFields = {
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional(),
  addressLine: z.string().optional(),
  town: z.string().max(80).optional(),
  parish: z.enum(PARISHES).optional(),
  // Same validator as the contractor's own TRN, so the two cannot disagree
  // about what a valid one is. Normalises to 9 bare digits, and an empty
  // string is allowed through as null — clearing the field must be possible,
  // and most customers are households with no TRN to give.
  trn: z.union([trnSchema, z.literal("")]).optional(),
  notes: z.string().optional(),
};

export const createClientSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().optional(),
    // Legacy shape — apps/mobile's "add client" still sends a single `name`.
    // Accepted alongside firstName/lastName so it keeps working unmodified.
    name: z.string().min(1).optional(),
    ...clientContactFields,
  })
  .refine((v) => !!v.firstName || !!v.name, {
    message: "firstName (or legacy name) is required",
    path: ["firstName"],
  });
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().optional(),
  name: z.string().min(1).optional(),
  ...clientContactFields,
});
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

/**
 * Resolves either explicit {firstName, lastName} or legacy {name} to
 * {firstName, lastName}. Prefers firstName/lastName when present; otherwise
 * splits `name` on the first space (first token -> firstName, remainder ->
 * lastName, empty string when there's no space). Returns an empty object
 * when neither is present (a partial update that doesn't touch the name).
 */
export function resolveClientName(input: {
  firstName?: string;
  lastName?: string;
  name?: string;
}): { firstName?: string; lastName?: string } {
  if (input.firstName !== undefined) {
    return { firstName: input.firstName, lastName: input.lastName ?? "" };
  }
  if (input.name !== undefined) {
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    return { firstName: firstName ?? "", lastName: rest.join(" ") };
  }
  return {};
}
