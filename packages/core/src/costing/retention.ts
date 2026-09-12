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
  /** Held back under the contract. A missing column is treated as none held. */
  retentionCents: Cents | null | undefined;
  retentionReleased: boolean;
}): InvoiceSettlement {
  // `?? 0` guards a missing column, which `Math.max` would otherwise turn into NaN
  // and carry silently into every figure downstream. Tightening the released check to
  // `!= null` exposed this: a caller whose select omitted `retentionCents` went from
  // "treated as released" to "held = NaN", so a fully-paid invoice read PARTIAL. No
  // retention recorded means none held; NaN means nothing at all.
  const held = params.retentionReleased ? 0 : Math.max(0, params.retentionCents ?? 0);
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

/**
 * The four columns every settlement question needs.
 *
 * Named so a caller cannot pass a total where a paid amount belongs, and so
 * `retentionReleasedAt` is converted in ONE place rather than at each of the
 * dozen call sites that used to write `Boolean(inv.retentionReleasedAt)`.
 */
export interface RetainableInvoice {
  totalCents: Cents;
  paidCents: Cents;
  retentionCents: Cents;
  /**
   * `Date | string | null`, because JSON has no Date.
   *
   * The API holds a `Date`, the web receives the ISO string the wire carries, and
   * both ask this question. Typing it `Date | null` pushed a conversion onto every
   * web caller — and the first three all avoided it by zeroing `retentionCents`
   * and passing `null` here instead, which is a second way of saying "released" in
   * the argument built to carry it. Accepting the string is what makes the honest
   * call the easy one.
   */
  retentionReleasedAt: Date | string | null;
}

/**
 * Settlement straight from an invoice row. **Prefer this to `invoiceSettlement`.**
 *
 * ## Why this exists
 *
 * A review of every money path found six places comparing a payment against
 * `totalCents` when the question was "how much is payable now?". The total and the
 * due-now amount differ by exactly the retention, so on any contract with a
 * retention clause all six were wrong in the same direction — against the client:
 *
 * - a WiPay checkout opened for money the contract says the client keeps
 * - an invoice that could never reach PAID, because paid could never reach total
 * - a settled invoice flipped to OVERDUE and chased in the nightly digest
 * - the PDF and its covering email both demanding the retained amount
 *
 * The helper was right and each surface reimplemented the subtraction. So this is
 * the one to call, taking the row rather than four loose numbers: a caller that
 * has an invoice cannot get the arguments wrong, and there is a single name to
 * grep for when checking that a new surface asks the right question.
 */
export function settlementOf(invoice: RetainableInvoice): InvoiceSettlement {
  return invoiceSettlement({
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    retentionCents: invoice.retentionCents,
    // `!= null`, not `!== null`: an `undefined` — a partial select, or a JSON body
    // with the key absent — used to read as RELEASED, which zeroes `heldCents` and
    // pushes retained money into due-now. Every production caller supplies the field,
    // so this was latent; it failed in the one direction this helper exists to
    // prevent, which is under-reporting what is held.
    retentionReleased: invoice.retentionReleasedAt != null,
  });
}

/**
 * What the balance owed on an invoice actually is, for a client-facing document.
 *
 * `total - paid` is the wrong sum whenever retention is held, and it was the sum
 * on the PDF, in the covering email and in the card-payment amount. This returns
 * what the client should be asked for, and `heldCents` alongside it so a document
 * can show the held line rather than silently omitting it.
 */
export function amountToRequest(invoice: RetainableInvoice): {
  dueNowCents: Cents;
  heldCents: Cents;
  outstandingCents: Cents;
} {
  const s = settlementOf(invoice);
  return { dueNowCents: s.dueNowCents, heldCents: s.heldCents, outstandingCents: s.outstandingCents };
}
