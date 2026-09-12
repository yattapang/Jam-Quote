/**
 * Single source of truth for the contractor dashboard's stat cards. Mirrors
 * how `computeTotals` is the SSOT for money math — every surface derives
 * these numbers from the same quotes data instead of hand-typing them.
 */

import { QuoteStatus } from "../types/enums.js";
import type { Cents } from "../tax/money.js";
import {
  computeReceivables,
  JAMAICA_UTC_OFFSET_MS,
  type ReportInvoice,
} from "../reports/summary.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WIN_RATE_WINDOW_DAYS = 90;

export interface DashboardStatInput {
  status: QuoteStatus;
  totalCents: Cents;
  createdAt: string; // ISO
}

export interface DashboardStats {
  pipelineValueCents: Cents;
  winRatePct90d: number;
  quotesThisMonth: number;
  overdueInvoicesCents: Cents;
}

/**
 * Compute the dashboard's four headline stats from a business's quotes and
 * invoices.
 *
 * `invoices` is deliberately REQUIRED rather than defaulting to `[]`. This
 * card spent a long release cycle reading a hardcoded 0 behind a "no
 * invoicing backend yet" TODO, quietly telling every contractor they were
 * owed nothing. An optional parameter would let a caller reintroduce exactly
 * that by omission; a required one makes the compiler ask for the data.
 */
export function computeDashboardStats(
  quotes: DashboardStatInput[],
  invoices: ReportInvoice[],
  now: Date = new Date(),
): DashboardStats {
  return {
    pipelineValueCents: pipelineValueCents(quotes),
    winRatePct90d: winRatePct90d(quotes, now),
    quotesThisMonth: quotesThisMonth(quotes, now),
    // Reuses the Reports page's receivables logic rather than re-deriving
    // "overdue" here — it already handles the unpaid remainder, skips drafts,
    // and treats a missing due date as never overdue. A second implementation
    // would drift and show two different numbers for the same money.
    overdueInvoicesCents: computeReceivables(invoices, now).totalOverdueCents,
  };
}

/** Open opportunities: quotes sent to a client but not yet won, lost, or still a draft. */
function pipelineValueCents(quotes: DashboardStatInput[]): Cents {
  return quotes
    .filter((q) => q.status === QuoteStatus.SENT || q.status === QuoteStatus.VIEWED)
    .reduce((sum, q) => sum + q.totalCents, 0);
}

/**
 * Of quotes that reached a terminal outcome within the last 90 days, the
 * percentage that were won. An integer 0-100; returns 0 rather than dividing
 * by zero when there's no such quote.
 *
 * "Won" must agree with `computeQuoteFunnel` in reports/summary.ts: ACCEPTED
 * *or* INVOICED, because accepting a quote here converts it straight to an
 * invoice, leaving ACCEPTED behind entirely. Counting only ACCEPTED would
 * drop every converted quote from the numerator (INVOICED isn't ACCEPTED)
 * while it stays out of the denominator too (INVOICED isn't terminal by the
 * old list), so the dashboard and Reports would disagree on the same
 * business's win rate depending on how far along its won quotes were —
 * and worse, it would actively punish the contractor for succeeding, since
 * finishing the job (invoicing) makes their own win rate look worse.
 */
function winRatePct90d(quotes: DashboardStatInput[], now: Date): number {
  const cutoff = now.getTime() - WIN_RATE_WINDOW_DAYS * MS_PER_DAY;
  const terminalRecent = quotes.filter((q) => {
    if (
      q.status !== QuoteStatus.ACCEPTED &&
      q.status !== QuoteStatus.INVOICED &&
      q.status !== QuoteStatus.DECLINED &&
      q.status !== QuoteStatus.EXPIRED
    ) {
      return false;
    }
    const created = new Date(q.createdAt).getTime();
    return !Number.isNaN(created) && created >= cutoff;
  });
  if (terminalRecent.length === 0) return 0;
  const won = terminalRecent.filter(
    (q) => q.status === QuoteStatus.ACCEPTED || q.status === QuoteStatus.INVOICED,
  ).length;
  return Math.round((won / terminalRecent.length) * 100);
}

/**
 * Count of quotes created on/after the first of `now`'s month, in Jamaica
 * local time. JamQuote's contractors are in Jamaica (UTC-5, no DST), so the
 * "1st" they mean is midnight Jamaica, not midnight UTC — a plain UTC
 * boundary would roll the counter over 5 hours early every month (e.g. at
 * 7pm on the 31st Jamaica time), still crediting new quotes to the month
 * that hasn't ended for the contractor yet.
 */
function quotesThisMonth(quotes: DashboardStatInput[], now: Date): number {
  const jamaicaNow = new Date(now.getTime() + JAMAICA_UTC_OFFSET_MS);
  const monthStart =
    Date.UTC(jamaicaNow.getUTCFullYear(), jamaicaNow.getUTCMonth(), 1) - JAMAICA_UTC_OFFSET_MS;
  return quotes.filter((q) => {
    const created = new Date(q.createdAt).getTime();
    return !Number.isNaN(created) && created >= monthStart;
  }).length;
}
