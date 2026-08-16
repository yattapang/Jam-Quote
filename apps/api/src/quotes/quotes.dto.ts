import { z } from "zod";
import {
  JobComponentKind,
  QuoteDetailLevel,
  QuoteStatus,
  quoteLineItemSchema,
} from "@jamquote/core";

/**
 * Display-only snapshot of one job component, captured at the moment
 * the job was dropped onto the quote. Never used in totals math (the
 * line's own quantity x unitPriceCents is) — only for DETAILED rendering.
 */
export const quoteLineJobComponentSchema = z.object({
  kind: z.nativeEnum(JobComponentKind),
  description: z.string().min(1),
  quantityPerUnit: z.number().positive(),
  // Snapshotted with the rest of the component so a sent document keeps
  // printing "3 trips" even if the job is later edited.
  unitLabel: z.string().min(1).optional(),
  unitPriceCents: z.number().int().nonnegative(),
});
export type QuoteLineJobComponentInput = z.infer<
  typeof quoteLineJobComponentSchema
>;

/**
 * A quote line item, plus display ordering within its section/quote and
 * optional job ("job type") fields. jobId is a plain reference
 * back to the source Job (not validated/FK'd here) — a normal,
 * non-job line simply omits all of these.
 */
export const quoteLineItemInputSchema = quoteLineItemSchema.and(
  z.object({
    sort: z.number().int().nonnegative().optional(),
    jobId: z.string().min(1).optional(),
    jobName: z.string().min(1).optional(),
    jobUnit: z.string().min(1).optional(),
    jobComponents: z.array(quoteLineJobComponentSchema).optional(),
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
  projectId: z.string().min(1).optional(),
  gctRatePct: z.number().min(0).max(100).optional(),
  discountPct: z.number().min(0).max(100).optional(),
  depositCents: z.number().int().nonnegative().optional(),
  validUntil: z.coerce.date().optional(),
  terms: z.string().optional(),
  // Display setting only (defaults to SUMMARY in the service): does not
  // affect totals math, only whether job lines render collapsed or
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
