import { z } from "zod";
import {
  JobComponentKind,
  QuoteDetailLevel,
  QuoteStatus,
  quoteLineItemSchema,
  BOUNDS,
  boundedNumber,
  centsSchema,
  startOfJamaicaDayMs,
} from "@jamquote/core";

/** Matches a bare calendar date with no time or zone: `"2026-09-17"`. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `Date.parse`/`new Date(...)` reads a bare `YYYY-MM-DD` string as UTC
 * midnight, per the ISO-8601 date-only rule — but Jamaica is UTC-5 year
 * round (no DST), so UTC midnight is 7pm the PREVIOUS evening in Jamaica.
 * A contractor sending today's date, meaning today in Jamaica, would have it
 * parsed 5 hours into what is, for `startOfJamaicaDayMs`'s purposes, still
 * "yesterday" — and get refused for sending an already-past date on the day
 * of. A date-ONLY string is therefore read as Jamaica-local midnight
 * (`T00:00:00-05:00`) instead of UTC midnight; a full timestamp (one that
 * already carries a time or zone) is left alone and parsed as written.
 */
const coerceJamaicaDate = z.preprocess((v) => {
  if (typeof v === "string" && DATE_ONLY.test(v)) {
    return new Date(`${v}T00:00:00-05:00`);
  }
  return v;
}, z.coerce.date());

/**
 * `validUntil` must not be a date already in the past, Jamaica time (F-register
 * item: the web builder refused `validDays < BOUNDS.validDays.min`, but the API
 * took a raw date with no bound at all, so a client could save an
 * already-expired quote directly). Compared against the START of today in
 * Jamaica so "today" itself is always valid regardless of time of day.
 *
 * This only bounds the SHAPE of a supplied date on CREATE. `updateQuoteSchema`
 * uses `coerceJamaicaDate` (below) with no refine at all — `quotes.service.ts`
 * enforces "not in the past" on update, and only when the value being saved
 * actually CHANGES from what is already stored, so re-saving an untouched,
 * now-expired `validUntil` on an old draft does not become impossible.
 */
const validUntilNotPast = coerceJamaicaDate.refine(
  (d) => d.getTime() >= startOfJamaicaDayMs(Date.now()),
  { message: "validUntil must not be a date in the past" },
);

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
  unitPriceCents: centsSchema("unitPriceCents"),
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
  depositCents: centsSchema("depositCents").optional(),
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
export const updateQuoteSchema = createQuoteSchema.partial().extend({
  // No "not in the past" refine here — see the comment on `validUntilNotPast`
  // above. `quotes.service.ts#update` enforces it, only when the value
  // actually changes from what is stored.
  validUntil: coerceJamaicaDate.optional(),
});
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
