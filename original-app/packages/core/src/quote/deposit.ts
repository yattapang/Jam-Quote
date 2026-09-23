/**
 * Deposit entry: a flat amount, or a percentage of the document total.
 *
 * Contractors ask for deposits both ways — "$50,000 up front" and "half now" —
 * and the second one was previously left to the contractor to work out on a
 * phone and retype, which is exactly where a wrong number gets quoted.
 *
 * Only ONE thing is ever stored: Quote.depositCents. The percentage is an input
 * method, resolved here at entry time, not a second representation of the same
 * fact persisted alongside the first. That is deliberate — a stored percentage
 * would silently re-price an already-sent quote the moment a line changed, and
 * the contractor would have no way to know the figure their client agreed to
 * had moved.
 *
 * Resolving against the total AFTER tax is intended: "half now" means half of
 * what the client will actually pay. This is safe from circularity because
 * computeTotals derives totalCents before the deposit and uses the deposit only
 * for balanceDueCents (see totals.ts).
 */

import type { Cents } from "../tax/money.js";

/** How the contractor expressed the deposit. */
export const DepositMode = {
  AMOUNT: "AMOUNT",
  PERCENT: "PERCENT",
} as const;
export type DepositMode = (typeof DepositMode)[keyof typeof DepositMode];

/**
 * The deposit in cents, given what the contractor typed.
 *
 * Rounds half-up to the cent, so a 33% deposit on an odd total lands on a
 * payable figure rather than a fraction of a cent.
 *
 * Clamped to [0, totalCents]. A deposit over the total would make balance due
 * negative — which reads as the contractor owing their client money — and a
 * negative deposit is not a thing. Both are typos, and clamping keeps the
 * document coherent instead of propagating a nonsense number onto a PDF.
 */
export function depositCentsFrom(
  mode: DepositMode,
  /** Raw field value: dollars when AMOUNT, percent when PERCENT. */
  raw: string | number,
  totalCents: Cents,
): Cents {
  const n = typeof raw === "number" ? raw : Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0) return 0;

  const cents =
    mode === DepositMode.PERCENT
      ? Math.round((totalCents * Math.min(n, 100)) / 100)
      : Math.round(n * 100);

  return Math.max(0, Math.min(cents, Math.max(totalCents, 0)));
}
