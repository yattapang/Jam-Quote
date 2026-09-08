import { z } from "zod";
import { RateUnit } from "../types/enums.js";

/**
 * The rate-book shapes as they arrive in the browser. See `wire/README.md`.
 *
 * These are the contractor's own library — what a day of a mason costs, what a
 * mixer rents for. They price a quote line, so the field that matters most is
 * `rateCents`.
 *
 * ## `rateCents` is an Int, and that is the whole point
 *
 * It is a real number on the wire, not a serialized Decimal, because **money in
 * this system is always integer cents**. That invariant has been broken once at
 * a display layer and cost a 100x error on screen (`PLANNING.md` §6). A test
 * asserts the wire type is `number`, so the day someone "helpfully" widens the
 * column to `Decimal` the contract fails rather than every price quietly
 * becoming a string that `Number()` still happens to parse.
 *
 * `unitLabel` is nullable, and null is meaningful: it means fall back to the
 * `rateUnit`'s own label. Resolving it is `lineUnitLabel`'s job and no screen
 * should do it inline — there is a source guard for that.
 */

const rateFields = {
  id: z.string(),

  /** Integer cents. Never a Decimal, never a string. */
  rateCents: z.number().int(),

  rateUnit: z.nativeEnum(RateUnit),

  /** The contractor's own word for the unit, or null to use the rateUnit's
   * standard label. Resolve through `lineUnitLabel`, never inline. */
  unitLabel: z.string().nullable(),
};

/** A trade and what it costs per unit of time. */
export const labourRateWire = z.object({
  ...rateFields,
  trade: z.string(),
  /** helper / journeyman / master, or null when the contractor does not
   * distinguish. */
  skillTier: z.string().nullable(),
});

export type LabourRateWire = z.infer<typeof labourRateWire>;

/** A tool or machine, owned or hired. */
export const equipmentItemWire = z.object({
  ...rateFields,
  name: z.string(),
  /**
   * Owned outright rather than hired. Drives whether the rate is a real cash
   * cost on a job or an internal charge, so it is not cosmetic.
   */
  owned: z.boolean(),
  vendor: z.string().nullable(),
  vendorPhone: z.string().nullable(),
});

export type EquipmentItemWire = z.infer<typeof equipmentItemWire>;
