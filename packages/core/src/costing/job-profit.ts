/**
 * Did this job make money?
 *
 * The question contractors actually ask, and the one the app could not answer:
 * it recorded what work was SOLD but never what was BOUGHT. An accountant's
 * export falls out of this rather than the other way round.
 *
 * Pure, so the definitions below can be argued about in tests rather than
 * discovered in a disputed figure months later.
 */

import type { Cents } from "../tax/money.js";

/**
 * What counts as revenue for a job.
 *
 * DRAFT invoices are excluded: a draft is not a claim on anyone, and counting
 * one would let a contractor make a job look profitable by typing an invoice
 * they never sent.
 */
export interface JobRevenueLine {
  status: string;
  totalCents: Cents;
  /** Cash actually received against this invoice. */
  paidCents: Cents;
}

export interface JobCostLine {
  amountCents: Cents;
  /** The GCT portion, which is reclaimable input tax rather than a cost. */
  gctCents: Cents;
}

export interface JobProfit {
  /** Invoiced, excluding drafts — what the job is worth on paper. */
  revenueCents: Cents;
  /** Of that, what has actually arrived. */
  collectedCents: Cents;
  /** Total spend attributed to this job, GCT included. */
  costCents: Cents;
  /**
   * Spend NET of reclaimable GCT — the true cost to a GCT-registered
   * contractor, since the tax comes back. See `netProfitCents`.
   */
  costExGctCents: Cents;
  /** Reclaimable input tax on this job's purchases. */
  inputTaxCents: Cents;
  /** revenue - costExGct. The honest margin for a registered business. */
  netProfitCents: Cents;
  /**
   * Margin as a percentage of revenue, or null when there is no revenue yet.
   *
   * Null rather than 0: a job with costs and no invoices has an undefined
   * margin, and showing "-100%" or "0%" would both read as facts about a job
   * that simply has not been billed.
   */
  marginPct: number | null;
}

const DRAFT = "DRAFT";

/**
 * @param registeredForGct Whether the business reclaims input tax. When false
 * the GCT paid on purchases is a real cost and is NOT netted off — reporting
 * an unregistered sole trader's margin as if they got the tax back would
 * overstate every job they do.
 */
export function computeJobProfit(
  revenue: readonly JobRevenueLine[],
  costs: readonly JobCostLine[],
  registeredForGct = true,
): JobProfit {
  let revenueCents = 0;
  let collectedCents = 0;
  for (const r of revenue) {
    if (r.status === DRAFT) continue;
    revenueCents += r.totalCents;
    collectedCents += r.paidCents;
  }

  let costCents = 0;
  let inputTaxCents = 0;
  for (const c of costs) {
    costCents += c.amountCents;
    inputTaxCents += c.gctCents;
  }

  const reclaimable = registeredForGct ? inputTaxCents : 0;
  const costExGctCents = costCents - reclaimable;
  const netProfitCents = revenueCents - costExGctCents;

  return {
    revenueCents,
    collectedCents,
    costCents,
    costExGctCents,
    inputTaxCents,
    netProfitCents,
    marginPct:
      revenueCents === 0 ? null : Math.round((netProfitCents / revenueCents) * 1000) / 10,
  };
}

/**
 * What one labour entry cost: quantity x rate, rounded to the cent.
 *
 * Rounded HERE rather than by summing raw products, because half-days and
 * part-hours are normal and a fraction of a cent per entry accumulates into a
 * job total that will not reconcile against a wage sheet. One rounding per
 * entry, at the point the entry is priced.
 *
 * A non-finite or negative quantity yields 0 rather than NaN: a bad keystroke
 * should leave the figure unchanged, not poison every total that includes it.
 */
export function labourEntryCostCents(
  quantity: number | string,
  rateCents: Cents,
): Cents {
  const qty = typeof quantity === "number" ? quantity : Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return Math.round(qty * rateCents);
}
