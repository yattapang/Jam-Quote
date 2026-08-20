import type { Cents } from "../tax/money.js";

/**
 * Retention — money the client withholds until the work is signed off.
 *
 * Normal in Jamaican construction contracts, and a system that ignores it
 * reports receivables that are wrong on every contract that uses one.
 *
 * The rule that matters: retained money is NOT overdue and NOT a shortfall. An
 * invoice for $100,000 with 10% retention is fully settled when $90,000
 * arrives — the remaining $10,000 is being held under the terms, not owed. A
 * system that counts it as outstanding has contractors chasing clients for
 * money nobody owes yet, which costs them the relationship the terms exist to
 * protect.
 */

/** Withheld amount for a total, rounded to the cent. Clamped to 0–100%: a
 * negative retention is not a thing, and one over 100% would make the amount
 * due negative. */
export function retentionCents(totalCents: Cents, pct: number | null | undefined): Cents {
  if (!pct || !Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round((totalCents * Math.min(pct, 100)) / 100);
}

export interface InvoiceSettlement {
  /** Payable NOW — the invoice total less anything still being held. */
  dueNowCents: Cents;
  /** Held under the contract, and not yet payable. */
  heldCents: Cents;
  /** Still to be paid of what is currently due. Never negative. */
  outstandingCents: Cents;
  /** True when everything currently payable has been received. Retention
   * still held does NOT make this false. */
  settledForNow: boolean;
}

/**
 * What is actually owed on an invoice right now.
 *
 * `retentionReleased` flips the held amount into what is due — that is the
 * moment sign-off happens and the money becomes payable, and it is why the
 * release date is stored rather than inferred from a percentage.
 */
export function invoiceSettlement(params: {
  totalCents: Cents;
  paidCents: Cents;
  retentionCents: Cents;
  retentionReleased: boolean;
}): InvoiceSettlement {
  const held = params.retentionReleased ? 0 : Math.max(0, params.retentionCents);
  const dueNowCents = Math.max(0, params.totalCents - held);
  return {
    dueNowCents,
    heldCents: held,
    // Never negative: an overpayment is a credit to sort out by hand, not a
    // negative receivable that quietly offsets another invoice's balance.
    outstandingCents: Math.max(0, dueNowCents - params.paidCents),
    settledForNow: params.paidCents >= dueNowCents,
  };
}
