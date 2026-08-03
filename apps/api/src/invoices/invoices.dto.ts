import { z } from "zod";
import {
  AssemblyComponentKind,
  QuoteDetailLevel,
  quoteLineItemSchema,
} from "@jamquote/core";

/**
 * Display-only snapshot of one assembly component, captured at the moment
 * the assembly was dropped onto the quote/invoice. Never used in totals math
 * — only for DETAILED rendering. Mirrors quotes.dto.ts exactly.
 */
export const invoiceLineAssemblyComponentSchema = z.object({
  kind: z.nativeEnum(AssemblyComponentKind),
  description: z.string().min(1),
  quantityPerUnit: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});
export type InvoiceLineAssemblyComponentInput = z.infer<
  typeof invoiceLineAssemblyComponentSchema
>;

/**
 * An invoice line item, plus display ordering within its section/invoice and
 * optional assembly ("job type") fields. Same shape as a quote line item —
 * invoice lines are copied from the quote at convert time and edited
 * independently thereafter.
 */
export const invoiceLineItemInputSchema = quoteLineItemSchema.and(
  z.object({
    sort: z.number().int().nonnegative().optional(),
    assemblyId: z.string().min(1).optional(),
    assemblyName: z.string().min(1).optional(),
    assemblyUnit: z.string().min(1).optional(),
    assemblyComponents: z.array(invoiceLineAssemblyComponentSchema).optional(),
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
  clientId: z.string().min(1).optional(),
  dueDate: z.coerce.date().optional(),
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
