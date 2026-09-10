import type { Prisma } from "@prisma/client";
import { startOfJamaicaMonth } from "./month.util.js";

/**
 * Which quotes count against a free plan's monthly allowance.
 *
 * ## Why this is one definition
 *
 * Two places ask the question: `QuotesService.assertCanCreateQuote`, which ENFORCES
 * the limit, and `BillingService`, which shows the contractor "quotes used this
 * month". They had different clauses — billing counted every row, the gate counted
 * originals — so the number on the Settings card was not the number being enforced.
 * A contractor could read "3 of 5" and be refused.
 *
 * ## What counts
 *
 * **Jobs quoted, not documents produced.** A revision replaces an unagreed quote and
 * a variation adds to an accepted one; in both cases the job was counted when the
 * original was created, so charging again would mean a contractor's own corrections
 * eating their allowance. `parentQuoteId` catches all three descendant kinds —
 * `version` did not, because `revise` of a CLOSED quote reserves a new number and
 * restarts at version 1.
 *
 * **Issuance, not stock.** There is deliberately NO `deletedAt` filter. `remove`
 * soft-deletes, and excluding tombstones would give the slot back — a tenant at the
 * cap could create a draft, email the PDF to the client, delete it and repeat. The
 * allowance limits how many quotes you send in a month, not how many you keep.
 */
export function quoteAllowanceWhere(businessId: string, now = new Date()): Prisma.QuoteWhereInput {
  return {
    businessId,
    createdAt: { gte: startOfJamaicaMonth(now) },
    parentQuoteId: null,
    variationOfQuoteId: null,
  };
}
