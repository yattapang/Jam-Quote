/** Zod schemas shared by api (request validation) and clients (form validation). */
import { z } from "zod";
import { GctTreatment, LineCategory, PriceSource, RateUnit } from "./enums.js";

/** Jamaican TRN: 9 digits, optionally shown grouped as 123-456-789. */
export const trnSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length === 9, "TRN must be 9 digits");

/** Jamaican mobile: 876 or 658 area code, 7 subscriber digits. */
export const jamaicaPhoneSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .refine(
    (s) => /^(1)?(876|658)\d{7}$/.test(s),
    "Enter a valid Jamaican phone number",
  );

export const quoteLineItemSchema = z.object({
  category: z.nativeEnum(LineCategory),
  description: z.string().min(1),
  quantity: z.number().positive(),
  rateUnit: z.nativeEnum(RateUnit),
  /**
   * Display unit SNAPSHOT for how this line's material is sold ("bag",
   * "sheet", "length"). rateUnit is the labour-time vocabulary
   * (HOUR/DAY/WEEK/MONTH/JOB/UNIT) and cannot express these, so a material
   * sold by the bag printed as "UNIT" on the customer's quote (#26).
   *
   * A plain string, not a MaterialUnit FK, for the same reason jobName
   * and supplierId are snapshots here: a quote already sent to a customer must
   * not change because the contractor later renamed or deleted the unit.
   * Falls back to rateUnit's label when unset.
   */
  unitLabel: z.string().max(40).optional(),
  unitPriceCents: z.number().int().nonnegative(),
  priceSource: z.nativeEnum(PriceSource).default(PriceSource.MANUAL),
  supplierId: z.string().uuid().optional(),
  gctTreatment: z.nativeEnum(GctTreatment).default(GctTreatment.STANDARD),
  markupPct: z.number().min(0).max(1000).optional(),
  // Required when a LOOKUP/SCAN price is manually replaced.
  overrideNote: z.string().optional(),
}).refine(
  (l) =>
    l.priceSource === PriceSource.MANUAL ||
    l.overrideNote === undefined ||
    l.overrideNote.length > 0,
  { message: "Override note required when changing a looked-up price", path: ["overrideNote"] },
);

export type QuoteLineItemInput = z.infer<typeof quoteLineItemSchema>;
