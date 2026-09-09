import { z } from "zod";

/**
 * A saved material as it arrives in the browser. See `wire/README.md`.
 *
 * The richest of the flat shapes, and the one carrying the most history: it has
 * lived through the Phase 2a migration from free-text `unit`/`category` to
 * referenced `unitId`/`categoryDefId`, and both generations still exist in the
 * column set.
 *
 * ## The three kinds of "maybe missing" here, which the old interface collapsed
 *
 * The declaration this replaces marked **every** field optional-and-nullable.
 * Three genuinely different facts were flattened into one:
 *
 * 1. **Always present, sometimes null** — `unit`, `category`, `description`,
 *    `measureUnit`, `coveragePerSellUnit`. Nullable columns, sent on every read.
 * 2. **Always present, never null** — `nameCustom` and `priceCents`. Non-nullable
 *    with defaults. Declaring `nameCustom?: boolean | null` invited
 *    `=== undefined` and `=== null` checks that can never be true, and then a
 *    reader has to write all three branches to be safe.
 * 3. **Genuinely optional** — `unitRef`, an INCLUDED relation. The service
 *    includes it on every read (`include: { unitRef: true }`), which is what
 *    fixed materials losing their unit on create; but it is a join, not a
 *    column, so a future read that forgets the include would simply omit it.
 *    That one stays `.optional()`, and the difference is now visible.
 */

/** The resolved unit, joined on read so a screen can render the label without a
 * second lookup. */
export const materialUnitRefWire = z.object({
  id: z.string(),
  key: z.string(),
  label: z.string(),
});

export const materialFavouriteWire = z.object({
  id: z.string(),
  name: z.string(),

  /**
   * The contractor pinned the name rather than letting the server compose it
   * from the category's attributes. Non-nullable with a default, so a real
   * boolean — not a tri-state.
   */
  nameCustom: z.boolean(),

  /** LEGACY free text, superseded by `unitId`. Still read for pre-2a rows. */
  unit: z.string().nullable(),
  unitId: z.string().nullable(),
  /** A JOIN, not a column - see the note above on why this one is optional. */
  unitRef: materialUnitRefWire.nullable().optional(),

  /** Integer cents. Money is never a Decimal in this system. */
  priceCents: z.number().int(),

  supplierId: z.string().nullable(),

  /** LEGACY free text, superseded by `categoryDefId`. */
  category: z.string().nullable(),
  categoryDefId: z.string().nullable(),

  /**
   * Attribute values keyed by `MaterialAttributeDef.key`. Keyed by the KEY as of
   * Phase 2a — it was the display label before, so a row written by an older
   * client can carry either.
   */
  specs: z.record(z.string()).nullable(),

  description: z.string().nullable(),
  measureUnit: z.string().nullable(),

  /**
   * How much one sell-unit covers, in `measureUnit` — a bag per square metre.
   * Serialized Decimals, so strings.
   */
  coveragePerSellUnit: z.string().nullable(),
  wastePct: z.string().nullable(),
});

export type MaterialFavouriteWire = z.infer<typeof materialFavouriteWire>;
