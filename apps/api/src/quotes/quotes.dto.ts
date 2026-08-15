import { z } from "zod";
import {
  JobComponentKind,
  QuoteDetailLevel,
  QuoteStatus,
  quoteLineItemSchema,
} from "@jamquote/core";

/**
 * Display-only snapshot of one assembly component, captured at the moment
 * the assembly was dropped onto the quote. Never used in totals math (the
 * line's own quantity x unitPriceCents is) — only for DETAILED rendering.
 */
export const quoteLineAssemblyComponentSchema = z.object({
  kind: z.nativeEnum(JobComponentKind),
  description: z.string().min(1),
  quantityPerUnit: z.number().positive(),
  unitPriceCents: z.number().int().nonnegative(),
});
export type QuoteLineAssemblyComponentInput = z.infer<
  typeof quoteLineAssemblyComponentSchema
>;

/**
 * A quote line item, plus display ordering within its section/quote and
 * optional assembly ("job type") fields. assemblyId is a plain reference
 * back to the source Assembly (not validated/FK'd here) — a normal,
 * non-assembly line simply omits all of these.
 */
export const quoteLineItemInputSchema = quoteLineItemSchema.and(
  z.object({
    sort: z.number().int().nonnegative().optional(),
    assemblyId: z.string().min(1).optional(),
    assemblyName: z.string().min(1).optional(),
    assemblyUnit: z.string().min(1).optional(),
    assemblyComponents: z.array(quoteLineAssemblyComponentSchema).optional(),
  }),
);
export type QuoteLineItemInput = z.infer<typeof quoteLineItemInputSchema>;

export const quoteSectionInputSchema = z.object({
  title: z.string().min(1),
  sort: z.number().int().nonnegative().optional(),
  lineItems: z.array(quoteLineItemInputSchema).default([]),
});
export type QuoteSectionInput = z.infer<typeof quoteSectionInputSchema>;

/**
 * Create/replace shape for a quote. `sections` groups line items under a
 * heading; `lineItems` are ungrouped lines at the quote's top level. Both are
 * optional and may be combined.
 */
export const createQuoteSchema = z.object({
  clientId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  gctRatePct: z.number().min(0).max(100).optional(),
  discountPct: z.number().min(0).max(100).optional(),
  depositCents: z.number().int().nonnegative().optional(),
  validUntil: z.coerce.date().optional(),
  terms: z.string().optional(),
  // Display setting only (defaults to SUMMARY in the service): does not
  // affect totals math, only whether assembly lines render collapsed or
  // expanded into their component snapshot.
  detailLevel: z.nativeEnum(QuoteDetailLevel).optional(),
  sections: z.array(quoteSectionInputSchema).default([]),
  lineItems: z.array(quoteLineItemInputSchema).default([]),
});
export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

/**
 * Update replaces quote-level fields and — when `sections`/`lineItems` are
 * provided — fully replaces the nested line items (simplest correct model
 * for a scaffold; a future PATCH-by-id-for-lines endpoint can refine this).
 */
export const updateQuoteSchema = createQuoteSchema.partial();
export type UpdateQuoteInput = z.infer<typeof updateQuoteSchema>;

export const updateQuoteStatusSchema = z.object({
  status: z.nativeEnum(QuoteStatus),
});
export type UpdateQuoteStatusInput = z.infer<typeof updateQuoteStatusSchema>;
