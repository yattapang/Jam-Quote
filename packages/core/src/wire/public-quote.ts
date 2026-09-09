import { z } from "zod";
import { GctTreatment, LineCategory, QuoteDetailLevel, RateUnit } from "../types/enums.js";

/**
 * What an anonymous holder of a quote share token receives.
 *
 * **This schema is different in kind from the others in `wire/`.** Those are
 * FLOORS — the fields the web relies on, with extra fields tolerated because the
 * browser cannot be broken by data it never reads.
 *
 * This one is a CEILING. It sits on the only unauthenticated surface in the API,
 * so it is `.strict()`: an unexpected field is an error, not a shrug. The schema
 * is therefore the specification of what a client may see, and widening it is a
 * disclosure decision that has to be written down here to happen at all.
 *
 * ## Why that matters concretely
 *
 * The public views used to reuse the TENANT's Prisma include, so every line
 * carried the whole row — including `markupPct`, the contractor's margin on that
 * line. Nothing had leaked (the column was null everywhere and no quote held a
 * live token), but the boundary had widened silently because a spread inherits
 * decisions nobody re-made.
 *
 * `.strict()` makes that impossible to repeat quietly: a new field on the row
 * fails the parse until someone adds it here, in a diff, with a reason.
 */

/** One priced line. Everything here is printed on the document the client was
 * already sent, and nothing else. */
export const publicQuoteLineWire = z
  .object({
    id: z.string(),
    category: z.nativeEnum(LineCategory),
    description: z.string(),
    /** A serialized Decimal, so a string: "10", "2.5". */
    quantity: z.string(),
    rateUnit: z.nativeEnum(RateUnit),
    unitLabel: z.string().nullable(),
    /** Integer cents. Money is never a Decimal in this system. */
    // The line AMOUNT, markup included — not the unit price. The client's page only
  // ever multiplied the unit price, and could not include the markup (correctly
  // withheld), so the lines did not sum to the subtotal beneath them. Sending the
  // answer rather than two of its three inputs is also strictly less disclosure.
  amountCents: z.number().int(),
    gctTreatment: z.nativeEnum(GctTreatment),
  })
  .strict();

export type PublicQuoteLineWire = z.infer<typeof publicQuoteLineWire>;

/** The contractor's letterhead — name, address and TRN, exactly as the PDF
 * carries them. */
export const publicBusinessWire = z
  .object({
    name: z.string(),
    addressLine: z.string().nullable(),
    town: z.string().nullable(),
    parish: z.string().nullable(),
    trn: z.string().nullable(),
  })
  .strict();

export const publicQuoteWire = z
  .object({
    number: z.string(),
    status: z.string(),
    /** ISO instant, or null when the quote does not expire. */
    validUntil: z.string().nullable(),
    terms: z.string().nullable(),
    detailLevel: z.nativeEnum(QuoteDetailLevel),

    /** Serialized Decimals — strings. `"15"`, not `15` and not `"15.00"`:
     * JSON.stringify drops trailing zeros. */
    gctRate: z.string(),
    discountPct: z.string(),

    depositCents: z.number().int(),
    subtotalCents: z.number().int(),
    gctCents: z.number().int(),
    totalCents: z.number().int(),

    lineItems: z.array(publicQuoteLineWire),
    sections: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          lineItems: z.array(publicQuoteLineWire),
        })
        .strict(),
    ),

    /** The client's own name, for "Prepared for ...". Null when the quote has
     * no client attached. */
    clientName: z.string().nullable(),
    business: publicBusinessWire,
  })
  .strict();

export type PublicQuoteWire = z.infer<typeof publicQuoteWire>;
