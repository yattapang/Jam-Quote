import { z } from "zod";

/**
 * The contractor's own business, as it arrives in the browser. See
 * `wire/README.md`.
 *
 * ## The Decimal, and why it is a plain string here
 *
 * The hand-written interface this replaces declared
 * `defaultGctRate: number | string`. That union was defensive noise, and it
 * forced every reader to handle a case that cannot happen: a Prisma `Decimal`
 * serializes through `JSON.stringify` as a **string**, always.
 *
 * It is now asserted rather than assumed — `business-wire.test.ts` builds a real
 * `Prisma.Decimal` and checks what comes out the other side. Two things that
 * check established:
 *
 * - the type is `string`, never `number`
 * - **trailing zeros are dropped**: `15.00` arrives as `"15"`
 *
 * The second matters more than it looks. Anything comparing the wire value to a
 * formatted `"15.00"`, or using its length or decimal places, is comparing
 * against a string the API does not send. Read it with `Number()` and treat the
 * text as opaque.
 *
 * `countryCode` and `currency` are non-nullable with database defaults, so they
 * are always present — the old interface had them optional, which invited
 * `?? "JM"` fallbacks that could never fire and hid where the real default
 * lives.
 */
export const businessWire = z.object({
  id: z.string(),
  name: z.string(),

  countryCode: z.string(),
  currency: z.string(),

  trn: z.string().nullable(),
  addressLine: z.string().nullable(),
  town: z.string().nullable(),
  parish: z.string().nullable(),
  tradeType: z.string().nullable(),

  /** Who the platform bills, when the subscriber names someone other than the
   * account holder. */
  billingContactName: z.string().nullable(),
  billingContactEmail: z.string().nullable(),

  /**
   * A PERCENTAGE, not a fraction — 15 means 15%. A serialized Prisma Decimal,
   * so a string: see the note above before comparing it to anything.
   */
  defaultGctRate: z.string(),
});

export type BusinessWire = z.infer<typeof businessWire>;
