import { z } from "zod";

/**
 * What a job COST, as it arrives in the browser. See `wire/README.md`.
 *
 * These two feed `computeJobProfit`, so they sit on the money seam — the place
 * this project has been bitten twice. Both carry cents, and the contract's main
 * job here is to keep them integers: a widened column would arrive as a string
 * that `Number()` still parses, so nothing would fail loudly while rounding
 * quietly drifted.
 *
 * The declarations these replace were already good — nullable where the column
 * is nullable, `quantity` correctly a string. They are converted anyway, because
 * a good hand-written duplicate is still a duplicate, and the next person to add
 * a field has two places to remember.
 */

/**
 * Money spent against a job — materials, hire, fuel.
 *
 * `projectId` is nullable and that is MEANINGFUL: null is an overhead with no
 * job behind it, which is a real category of spend rather than a missing link.
 * The list endpoint filters on the presence of the key for exactly that reason.
 */
export const purchaseWire = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  supplierId: z.string().nullable(),
  description: z.string(),

  /** Integer cents, always. */
  amountCents: z.number().int(),

  /**
   * The GCT portion OF `amountCents`, not on top of it. Zero when the supplier
   * is not registered or the purchase is exempt — which is why it is asked for
   * as an amount rather than derived from a rate: plenty of suppliers here are
   * not registered, and assuming 15% would invent input tax that cannot be
   * reclaimed.
   */
  gctCents: z.number().int(),

  /** Free text with suggestions, not an enum — a contractor must be able to use
   * their own word. `groupByCategory` folds case and spacing when reporting. */
  category: z.string().nullable(),

  purchasedAt: z.string(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
});

export type PurchaseWire = z.infer<typeof purchaseWire>;

/**
 * Time worked against a job.
 *
 * `rateCents` is a SNAPSHOT taken when the entry was logged, never re-read from
 * the rate book. Raising your day rate must not silently reprice work already
 * done, and the same rule governs quote lines.
 */
export const labourEntryWire = z.object({
  id: z.string(),
  /** Null is admin time — a real cost with no job behind it. */
  projectId: z.string().nullable(),
  /** Which rate it came from, when it came from one. */
  labourRateId: z.string().nullable(),
  description: z.string(),

  /** A serialized Decimal — days or hours, so fractional. A string. */
  quantity: z.string(),

  /** Integer cents, snapshotted. See the note above. */
  rateCents: z.number().int(),

  /**
   * Non-nullable with a database default of "day", so a real string rather than
   * a nullable one. The old declaration had this right and it is worth keeping
   * right: an empty unit would print "2" with nothing after it.
   */
  unitLabel: z.string(),

  workedOn: z.string(),
  note: z.string().nullable(),
});

export type LabourEntryWire = z.infer<typeof labourEntryWire>;
