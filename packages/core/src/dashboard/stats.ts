/**
 * Single source of truth for the contractor dashboard's stat cards. Mirrors
 * how `computeTotals` is the SSOT for money math — every surface derives
 * these numbers from the same quotes data instead of hand-typing them.
 */

import { QuoteStatus } from "../types/enums.js";
import type { Cents } from "../tax/money.js";
import { computeReceivables, type ReportInvoice } from "../reports/summary.js";

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
 * Of quotes that reached a terminal outcome (ACCEPTED, DECLINED, or EXPIRED)
 * within the last 90 days, the percentage that were ACCEPTED. An integer
 * 0-100; returns 0 rather than dividing by zero when there's no such quote.
 */
function winRatePct90d(quotes: DashboardStatInput[], now: Date): number {
  const cutoff = now.getTime() - WIN_RATE_WINDOW_DAYS * MS_PER_DAY;
  const terminalRecent = quotes.filter((q) => {
    if (
      q.status !== QuoteStatus.ACCEPTED &&
      q.status !== QuoteStatus.DECLINED &&
      q.status !== QuoteStatus.EXPIRED
    ) {
      return false;
    }
    const created = new Date(q.createdAt).getTime();
    return !Number.isNaN(created) && created >= cutoff;
  });
  if (terminalRecent.length === 0) return 0;
  const won = terminalRecent.filter((q) => q.status === QuoteStatus.ACCEPTED).length;
  return Math.round((won / terminalRecent.length) * 100);
}

/**
 * Count of quotes created on/after the first of `now`'s month. Uses UTC to
 * compute the boundary, since `createdAt` is always a UTC ISO timestamp and
 * this must give the same answer regardless of the server's local timezone.
 */
function quotesThisMonth(quotes: DashboardStatInput[], now: Date): number {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  return quotes.filter((q) => {
    const created = new Date(q.createdAt).getTime();
    return !Number.isNaN(created) && created >= monthStart;
  }).length;
}
