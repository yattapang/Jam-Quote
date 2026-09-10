import { z } from "zod";
import { PARISHES, trnSchema } from "@jamquote/core";

/**
 * What a valid value for each client field IS, with no statement about whether
 * it has to be present.
 *
 * Split out because there are TWO doors into the `Client` table and they had
 * drifted apart. `POST /clients` required `email` to be a real email and
 * `parish` to be one of the fourteen; `POST /sync` accepted any string for both.
 * A mobile device could therefore plant `"not-an-email"` and a parish that does
 * not exist into the same columns the REST path guards — and then "Send by
 * email" tries to send to it, the accountant export carries it, and a
 * jurisdiction lookup keyed on parish finds nothing.
 *
 * Presence differs between the two paths for good reason: REST uses
 * `.optional()` (absent means "leave alone"), sync uses `.nullish()` (null means
 * "the device cleared this"). So the VALUE rules live here once and each path
 * applies its own presence rule on top. Divergence is now structurally
 * impossible rather than something a test has to catch.
 */
export const clientFieldRules = {
  phone: z.string().max(40),
  whatsapp: z.string().max(40),
  email: z.string().email(),
  addressLine: z.string().max(200),
  town: z.string().max(80),
  parish: z.enum(PARISHES),
  /**
   * Same validator as the contractor's own TRN, so the two cannot disagree
   * about what a valid one is. Normalises to 9 bare digits, and an empty string
   * passes through as a clear — most clients are households with no TRN.
   */
  trn: z.union([trnSchema, z.literal("")]),
  notes: z.string().max(2000),
} as const;

// Shared optional fields for both create and update.
const clientContactFields = {
  phone: clientFieldRules.phone.optional(),
  whatsapp: clientFieldRules.whatsapp.optional(),
  email: clientFieldRules.email.optional(),
  addressLine: clientFieldRules.addressLine.optional(),
  town: clientFieldRules.town.optional(),
  parish: clientFieldRules.parish.optional(),
  trn: clientFieldRules.trn.optional(),
  notes: clientFieldRules.notes.optional(),
};

export const createClientSchema = z
  .object({
    firstName: z.string().max(80).min(1).optional(),
    lastName: z.string().max(80).optional(),
    // Legacy shape — apps/mobile's "add client" still sends a single `name`.
    // Accepted alongside firstName/lastName so it keeps working unmodified.
    name: z.string().max(200).min(1).optional(),
    ...clientContactFields,
  })
  .refine((v) => !!v.firstName || !!v.name, {
    // Written for the person filling in the form, not for the developer reading
    // the schema. `firstName` and the legacy `name` are both accepted; a
    // contractor does not know either field exists.
    message: "A first name is required",
    path: ["firstName"],
  });
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = z.object({
  firstName: z.string().max(80).min(1).optional(),
  lastName: z.string().max(80).optional(),
  name: z.string().max(200).min(1).optional(),
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
