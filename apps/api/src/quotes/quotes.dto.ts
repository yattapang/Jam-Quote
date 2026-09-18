import { z } from "zod";
import {
  JobComponentKind,
  QuoteDetailLevel,
  QuoteStatus,
  quoteLineItemSchema,
  BOUNDS,
  boundedNumber,
  startOfJamaicaDayMs,
} from "@jamquote/core";

/**
 * `validUntil` must not be a date already in the past, Jamaica time (F-register
 * item: the web builder refused `validDays < BOUNDS.validDays.min`, but the API
 * took a raw date with no bound at all, so a client could save an
 * already-expired quote directly). Compared against the START of today in
 * Jamaica so "today" itself is always valid regardless of time of day.
 *
 * This only bounds the SHAPE of a supplied date; `quotes.service.ts` decides
 * whether the bound applies on update (it does not re-check an unchanged
 * `validUntil` carried over from an existing quote, so editing an old quote
 * whose date has since passed does not become impossible).
 */
const validUntilNotPast = z
  .coerce
  .date()
  .refine((d) => d.getTime() >= startOfJamaicaDayMs(Date.now()), {
    message: "validUntil must not be a date in the past",
  });

/**
 * Display-only snapshot of one job component, captured at the moment
 * the job was dropped onto the quote. Never used in totals math (the
 * line's own quantity x unitPriceCents is) — only for DETAILED rendering.
 */
export const quoteLineJobComponentSchema = z.object({
  kind: z.nativeEnum(JobComponentKind),
  description: z.string().trim().min(1).max(500),
  quantityPerUnit: z.number().positive(),
  // Snapshotted with the rest of the component so a sent document keeps
  // printing "3 trips" even if the job is later edited.
  unitLabel: z.string().trim().min(1).max(40).optional(),
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
    jobId: z.string().max(64).min(1).optional(),
    jobName: z.string().trim().min(1).max(200).optional(),
    jobUnit: z.string().trim().min(1).max(40).optional(),
    jobComponents: z.array(quoteLineJobComponentSchema).optional(),
  }),
);
export type QuoteLineItemInput = z.infer<typeof quoteLineItemInputSchema>;

export const quoteSectionInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
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
  clientId: z.string().max(64).min(1).optional(),
  projectId: z.string().max(64).min(1).optional(),
  gctRatePct: boundedNumber(BOUNDS.gctRatePct).optional(),
  discountPct: boundedNumber(BOUNDS.discountPct).optional(),
  depositCents: z.number().int().nonnegative().optional(),
  validUntil: validUntilNotPast.optional(),
  terms: z.string().max(5000).optional(),
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

/**
 * A client's accept/decline through the public link.
 *
 * The name is required and non-empty: an unnamed decision is worth much less
 * as a record, and typing your own name is what makes the click deliberate
 * rather than accidental. Capped so the field cannot be used as free storage
 * on an unauthenticated endpoint.
 */
export const quoteDecisionSchema = z.object({
  decision: z.enum(["ACCEPT", "DECLINE"]),
  name: z.string().trim().min(1, "Please enter your name").max(120),
  reason: z.string().trim().max(500).optional(),
});
export type QuoteDecisionInput = z.infer<typeof quoteDecisionSchema>;
