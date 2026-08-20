import { z } from "zod";

/**
 * Recording what a contractor spent.
 *
 * `amountCents` is what the receipt says — GCT included — because that is the
 * number on the paper in their hand. `gctCents` is the tax portion of it, kept
 * separately so input tax can be reported without re-deriving it from a rate
 * that may not have applied.
 */
export const createPurchaseSchema = z
  .object({
    /** Null or omitted = an overhead with no job behind it (fuel, phone,
     * insurance). Required would make contractors invent a job. */
    projectId: z.string().min(1).nullable().optional(),
    supplierId: z.string().min(1).nullable().optional(),
    description: z.string().min(1).max(200),
    amountCents: z.number().int().positive(),
    gctCents: z.number().int().nonnegative().optional(),
    category: z.string().max(60).nullable().optional(),
    purchasedAt: z.string().datetime(),
    reference: z.string().max(120).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((v) => (v.gctCents ?? 0) <= v.amountCents, {
    message: "GCT cannot exceed the amount paid",
    path: ["gctCents"],
  });
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

/** Every field optional. An absent key leaves the stored value alone; an
 * explicit null detaches a relation — the same convention as the invoice
 * client picker. */
export const updatePurchaseSchema = z.object({
  projectId: z.string().min(1).nullable().optional(),
  supplierId: z.string().min(1).nullable().optional(),
  description: z.string().min(1).max(200).optional(),
  amountCents: z.number().int().positive().optional(),
  gctCents: z.number().int().nonnegative().optional(),
  category: z.string().max(60).nullable().optional(),
  purchasedAt: z.string().datetime().optional(),
  reference: z.string().max(120).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});
export type UpdatePurchaseInput = z.infer<typeof updatePurchaseSchema>;

export const purchaseQuerySchema = z.object({
  /** Pass an explicit empty string for "overheads only" — purchases with no
   * job. Coerced to null so the service can tell it from "no filter". */
  projectId: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});
export type PurchaseQuery = z.infer<typeof purchaseQuerySchema>;

/**
 * Time worked on a job.
 *
 * `rateCents` is supplied rather than looked up from `labourRateId`, and that
 * is deliberate: the entry SNAPSHOTS what the work cost at the time. Reading
 * it live from the rate book would mean raising your day rate silently
 * rewrote what last month's jobs cost.
 */
export const createLabourEntrySchema = z.object({
  /** Null or omitted = admin/office time with no job behind it. */
  projectId: z.string().min(1).nullable().optional(),
  /** The rate book entry this came from, when it came from one. */
  labourRateId: z.string().min(1).nullable().optional(),
  description: z.string().min(1).max(200),
  /** Hours or days — half-days and part-hours are normal, so not an integer. */
  quantity: z.number().positive().max(100_000),
  rateCents: z.number().int().nonnegative(),
  unitLabel: z.string().min(1).max(30).optional(),
  workedOn: z.string().datetime(),
  note: z.string().max(500).nullable().optional(),
});
export type CreateLabourEntryInput = z.infer<typeof createLabourEntrySchema>;

export const labourEntryQuerySchema = z.object({
  projectId: z
    .string()
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "" ? null : v)),
  limit: z.coerce.number().int().positive().max(500).optional(),
});
export type LabourEntryQuery = z.infer<typeof labourEntryQuerySchema>;
