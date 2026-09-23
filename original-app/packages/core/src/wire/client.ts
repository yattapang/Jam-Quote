import { z } from "zod";

/**
 * A client as it arrives in the browser. See `wire/README.md`.
 *
 * The API returns the whole Prisma row plus a computed `name`. This is the
 * subset the web actually relies on — a floor, not a mirror.
 *
 * ## Nullable vs optional, and why the distinction matters here
 *
 * The hand-written interface this replaces declared every contact field as
 * `phone?: string | null` — both optional AND nullable. That was wrong in a way
 * no test would notice: the API sends every column on every read, so `phone` is
 * always PRESENT and sometimes `null`. Declaring it optional invited
 * `client.phone === undefined` checks that can never be true, alongside the
 * `=== null` checks that can, and both had to be written to be safe.
 *
 * So: present-and-nullable is `.nullable()`. Genuinely-may-be-absent is
 * `.optional()`. `name` is the only member of the second group, because the API
 * computes it and `mapClient` deliberately re-derives its own rather than
 * trusting it.
 */
export const clientWire = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),

  /**
   * Computed by the API as `firstName + " " + lastName`; still read by
   * `apps/mobile`. Optional because the web must not depend on it — `mapClient`
   * derives its own, so a change to the API's spacing or ordering cannot alter
   * what a contractor sees.
   */
  name: z.string().optional(),

  phone: z.string().nullable(),
  email: z.string().nullable(),
  addressLine: z.string().nullable(),
  town: z.string().nullable(),
  parish: z.string().nullable(),

  /** The CLIENT's own tax number, distinct from the contractor's own. */
  trn: z.string().nullable(),
});

export type ClientWire = z.infer<typeof clientWire>;
