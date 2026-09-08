import { z } from "zod";
import { ProjectStage } from "../types/enums.js";

/**
 * A project (client work) as it arrives in the browser. See `wire/README.md`.
 *
 * Not a JOB — that is the reusable priced template. See `PLANNING.md` §1; the
 * Postgres table is still named `Job` behind an `@@map`, which is exactly why
 * the vocabulary is worth restating here.
 *
 * ## `retentionPct` was triply hedged
 *
 * The hand-written interface said `retentionPct?: number | string | null` —
 * optional, and either of two types, or null. Three uncertainties stacked on one
 * nullable `Decimal` column, and every reader had to handle all of them.
 *
 * What actually arrives is `string | null`: the column is present on every read
 * (so not optional) and a serialized `Decimal` is always a string (so not a
 * number). Null means no retention was agreed, which is a real and distinct
 * state from `"0"` — a contractor who typed zero and one who typed nothing are
 * saying different things, and the form deliberately keeps them apart.
 */
export const projectWire = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  name: z.string(),

  addressLine: z.string().nullable(),
  town: z.string().nullable(),
  parish: z.string().nullable(),

  stage: z.nativeEnum(ProjectStage),

  /** Whole percent, 0-100. An Int column, so a real number on the wire. */
  progressPct: z.number(),

  /**
   * Default retention for invoices raised on this project, as a serialized
   * Decimal. Each invoice then keeps its OWN copy, so changing this cannot
   * restate a document a client already holds.
   */
  retentionPct: z.string().nullable(),
});

export type ProjectWire = z.infer<typeof projectWire>;
