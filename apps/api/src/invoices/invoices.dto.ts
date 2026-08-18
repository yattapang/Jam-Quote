import { z } from "zod";
import {
  JobComponentKind,
  QuoteDetailLevel,
  quoteLineItemSchema,
} from "@jamquote/core";

/**
 * Display-only snapshot of one job component, captured at the moment
 * the job was dropped onto the quote/invoice. Never used in totals math
 * — only for DETAILED rendering. Mirrors quotes.dto.ts exactly.
 */
export const invoiceLineJobComponentSchema = z.object({
  kind: z.nativeEnum(JobComponentKind),
  description: z.string().min(1),
  quantityPerUnit: z.number().positive(),
  // Snapshotted with the rest of the component so a sent document keeps
  // printing "3 trips" even if the job is later edited.
  unitLabel: z.string().min(1).optional(),
  unitPriceCents: z.number().int().nonnegative(),
});
export type InvoiceLineJobComponentInput = z.infer<
  typeof invoiceLineJobComponentSchema
>;

/**
 * An invoice line item, plus display ordering within its section/invoice and
 * optional job ("job type") fields. Same shape as a quote line item —
 * invoice lines are copied from the quote at convert time and edited
 * independently thereafter.
 */
export const invoiceLineItemInputSchema = quoteLineItemSchema.and(
  z.object({
    sort: z.number().int().nonnegative().optional(),
    jobId: z.string().min(1).optional(),
    jobName: z.string().min(1).optional(),
    jobUnit: z.string().min(1).optional(),
    jobComponents: z.array(invoiceLineJobComponentSchema).optional(),
  }),
);
export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemInputSchema>;

export const invoiceSectionInputSchema = z.object({
  title: z.string().min(1),
  sort: z.number().int().nonnegative().optional(),
  lineItems: z.array(invoiceLineItemInputSchema).default([]),
});
export type InvoiceSectionInput = z.infer<typeof invoiceSectionInputSchema>;

/**
 * PATCH shape for an invoice. Only legal while the invoice is DRAFT (enforced
 * in the service). Edits header fields; when `sections`/`lineItems` are
 * provided, fully replaces the nested line items — same "simplest correct
 * model" as quotes.dto.ts's updateQuoteSchema.
 */
export const updateInvoiceSchema = z.object({
  // Nullable, not merely optional: sending null detaches the client, while
  // omitting the key leaves whoever is attached alone. The editor's client
  // picker offers a blank option, and that option has to mean something.
  clientId: z.string().min(1).nullable().optional(),
  dueDate: z.coerce.date().optional(),
  // The date the invoice bears. Reports attribute revenue to it, so it is a
  // financial field, not a cosmetic one — see Invoice.issueDate in schema.
  issueDate: z.coerce.date().optional(),
  terms: z.string().optional(),
  gctRatePct: z.number().min(0).max(100).optional(),
  discountPct: z.number().min(0).max(100).optional(),
  depositCents: z.number().int().nonnegative().optional(),
  // Display setting only — does not affect totals math.
  detailLevel: z.nativeEnum(QuoteDetailLevel).optional(),
  sections: z.array(invoiceSectionInputSchema).optional(),
  lineItems: z.array(invoiceLineItemInputSchema).optional(),
});
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;

/**
 * Create an invoice from scratch — not from a quote (#27 follow-on).
 *
 * Deliberately does NOT accept `quoteId`: an invoice that came from a quote is
 * created through POST /invoices/from-quote/:quoteId, which deep-copies the
 * quote's lines and keeps the two linked. Letting a caller assert that link on
 * a hand-built invoice would claim a provenance the data does not have, and
 * `finalize` uses quoteId to flip the source quote to INVOICED.
 *
 * Nor does it accept a `number` or `status`: the number is reserved
 * server-side so it cannot collide or skip, and every invoice starts DRAFT so
 * it can be reviewed before being finalized.
 */
export const createInvoiceSchema = z.object({
  clientId: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
  // The date the invoice bears. Reports attribute revenue to it, so it is a
  // financial field, not a cosmetic one — see Invoice.issueDate in schema.
  issueDate: z.coerce.date().optional(),
  terms: z.string().optional(),
  // Defaults are applied from the business's own settings when omitted — see
  // InvoicesService.create, which reads defaultGctRate rather than hardcoding.
  gctRatePct: z.number().min(0).max(100).optional(),
  discountPct: z.number().min(0).max(100).default(0),
  depositCents: z.number().int().nonnegative().default(0),
  detailLevel: z.nativeEnum(QuoteDetailLevel).optional(),
  sections: z.array(invoiceSectionInputSchema).default([]),
  lineItems: z.array(invoiceLineItemInputSchema).default([]),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
