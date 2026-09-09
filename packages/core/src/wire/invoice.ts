import { z } from "zod";
import { InvoiceStatus, PaymentMethod, QuoteDetailLevel } from "../types/enums.js";
// An invoice line and a quote line are the SAME columns - conversion copies them
// across unchanged, which is what makes the figures survive the seam. The web
// already asserted this with `ApiInvoiceLineItem = ApiLineItem`; sharing the
// schema means the two cannot drift apart later.
import { quoteLineWire as lineWire, quoteSectionWire as sectionWire } from "./quote.js";

/**
 * An invoice as it arrives in the browser. See `wire/README.md`. The last shape
 * on seam 1.
 *
 * Like the quote, it comes in **two shapes**: the list read carries the columns,
 * the detail read adds sections, lines, payments and reminders. Hence
 * `invoiceWire` and `invoiceDetailWire`.
 *
 * ## Retention is three fields, and each means something different
 *
 * This is the part worth reading before touching anything:
 *
 * - **`retentionPct`** — the percentage agreed. Nullable, because null ("not
 *   agreed") and `"0"` ("no retention on this contract") are different
 *   statements, and the form keeps them apart deliberately.
 * - **`retentionCents`** — a SNAPSHOT of the withheld amount, taken when the
 *   invoice was raised. It exists so editing the job's percentage later cannot
 *   restate a document the client is already holding.
 * - **`retentionReleasedAt`** — when the money became payable. Null while held.
 *
 * Retention is **not a shortfall**: an invoice with 10% held is settled when the
 * other 90% arrives. Deriving that is `invoiceSettlement`'s job, and no screen
 * should subtract these by hand.
 *
 * ## `paidCents` is a total, and `payments` is the ledger behind it
 *
 * Both are here because this is the CONTRACTOR's read. `publicInvoiceWire` sends
 * the total and refuses the ledger — which method, which date, which bank
 * reference is the contractor's own banking record.
 */

/** One recorded payment. Voided ones are soft-deleted and never sent. */
export const paymentWire = z.object({
  id: z.string(),
  amountCents: z.number().int(),
  method: z.nativeEnum(PaymentMethod),
  /** Cheque number, bank reference or wallet transaction id. Named for its WiPay
   * origin, reused for manual references. */
  providerRef: z.string().nullable(),
  status: z.string(),
  paidAt: z.string(),
});

export type PaymentWire = z.infer<typeof paymentWire>;

/**
 * One chase, as it happened.
 *
 * The row means the contractor SENT this, never that the client read it — on
 * WhatsApp the message is handed to WhatsApp and delivery is unobservable.
 */
export const invoiceReminderWire = z.object({
  id: z.string(),
  /** "EMAIL" | "WHATSAPP". Plain text, so a new channel needs no migration. */
  channel: z.string(),
  /** The address or number AS SENT, so a later edit to the client record cannot
   * rewrite history. */
  sentTo: z.string().nullable(),
  /** What was owed at the time — a reminder for $45,000 must still read as
   * $45,000 after a part payment. */
  outstandingCents: z.number().int(),
  sentAt: z.string(),
});

export type InvoiceReminderWire = z.infer<typeof invoiceReminderWire>;

/** What every invoice endpoint sends. Nested items only on the detail read. */
export const invoiceWire = z.object({
  id: z.string(),
  businessId: z.string(),
  number: z.string(),
  status: z.nativeEnum(InvoiceStatus),

  clientId: z.string().nullable(),
  /** The quote this was converted from, when there was one. */
  quoteId: z.string().nullable(),

  /** Serialized Decimals - strings. */
  gctRate: z.string(),
  discountPct: z.string(),

  depositCents: z.number().int(),
  subtotalCents: z.number().int(),
  gctCents: z.number().int(),
  totalCents: z.number().int(),
  /** A TOTAL. The ledger is `payments`. */
  paidCents: z.number().int(),

  terms: z.string().nullable(),

  /**
   * The date the invoice BEARS — what the contractor is billing as of, and what
   * every report buckets revenue by. Distinct from `createdAt` so June's work
   * written up in July is still June revenue.
   */
  issueDate: z.string(),
  /** Null when no terms were agreed — and an invoice with no due date is never
   * overdue, so null is a real state rather than a missing value. */
  dueDate: z.string().nullable(),

  /** See the note above: three fields, three different meanings. */
  retentionPct: z.string().nullable(),
  retentionCents: z.number().int(),
  retentionReleasedAt: z.string().nullable(),

  createdAt: z.string(),
  updatedAt: z.string(),

  detailLevel: z.nativeEnum(QuoteDetailLevel),

  /** Absent on the LIST read, which runs no include. */
  lineItems: z.array(lineWire).optional(),
  sections: z.array(sectionWire).optional(),
  payments: z.array(paymentWire).optional(),
  reminders: z.array(invoiceReminderWire).optional(),
});

export type InvoiceWire = z.infer<typeof invoiceWire>;

/** The detail read, where the nested collections are guaranteed. */
export const invoiceDetailWire = invoiceWire.extend({
  lineItems: z.array(lineWire),
  sections: z.array(sectionWire),
  payments: z.array(paymentWire),
  reminders: z.array(invoiceReminderWire),
});

export type InvoiceDetailWire = z.infer<typeof invoiceDetailWire>;
