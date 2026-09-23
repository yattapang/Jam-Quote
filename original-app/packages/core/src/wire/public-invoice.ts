import { z } from "zod";
import { QuoteDetailLevel } from "../types/enums.js";
import {
  publicBusinessWire,
  // A quote line and an invoice line disclose IDENTICALLY - the same eight
  // fields, all of them printed on the document the client already holds. Shared
  // rather than restated, because two copies of a disclosure boundary are two
  // boundaries that will eventually differ, and this is the surface where that
  // matters most.
  publicQuoteLineWire as publicLineWire,
} from "./public-quote.js";

/**
 * What an anonymous holder of an INVOICE share token receives.
 *
 * `.strict()`, for the same reason as `publicQuoteWire`: this is the
 * unauthenticated surface, so an unexpected field is a disclosure rather than
 * something to shrug at. Widening it has to be written down here to happen.
 *
 * ## What an invoice adds over a quote, and why each is safe to send
 *
 * - **`paidCents`** — the client's own payments. They know what they paid; being
 *   told is the point of the link.
 * - **`retentionCents` / `retentionReleased`** — money the client is holding
 *   under the contract. Also theirs to know, and hiding it would make the
 *   balance look wrong.
 * - **`issueDate` / `dueDate`** — what they are being asked to pay and by when.
 *
 * What it deliberately does NOT add: the payment LEDGER. `paidCents` is a total.
 * Which method, which date, which reference — that is the contractor's record of
 * their own banking, and a client needs none of it to pay an invoice.
 */
export const publicInvoiceWire = z
  .object({
    number: z.string(),
    status: z.string(),

    /** ISO instants. `dueDate` is null when no terms were agreed - and an
     * invoice with no due date is never overdue, which is why null is a real
     * state rather than a missing value. */
    issueDate: z.string(),
    dueDate: z.string().nullable(),

    terms: z.string().nullable(),
    detailLevel: z.nativeEnum(QuoteDetailLevel),

    /** Serialized Decimals - strings. */
    gctRate: z.string(),
    discountPct: z.string(),

    depositCents: z.number().int(),
    subtotalCents: z.number().int(),
    gctCents: z.number().int(),
    totalCents: z.number().int(),

    /** A TOTAL, never the ledger behind it. */
    paidCents: z.number().int(),

    /** Withheld under the contract until sign-off. Not a shortfall: an invoice
     * with retention held is settled when the rest arrives. */
    retentionCents: z.number().int(),
    retentionReleased: z.boolean(),

    lineItems: z.array(publicLineWire),
    sections: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          lineItems: z.array(publicLineWire),
        })
        .strict(),
    ),

    clientName: z.string().nullable(),
    business: publicBusinessWire,
  })
  .strict();

export type PublicInvoiceWire = z.infer<typeof publicInvoiceWire>;
