/**
 * Pure helpers behind the supplier price comparison (#26 Phase 2b). Kept out of
 * SupplierPricePanel so they can be unit-tested without a DOM.
 */

/**
 * The lowest price in the comparison, or null when there is nothing to compare.
 *
 * The API already sorts cheapest-first, but the panel marks rows by VALUE
 * rather than by position so that two suppliers quoting the same price are both
 * flagged — highlighting only the first would imply a difference that isn't
 * there.
 */
export function cheapestPriceCents(prices: { priceCents: number }[]): number | null {
  let cheapest: number | null = null;
  for (const p of prices) {
    if (cheapest === null || p.priceCents < cheapest) cheapest = p.priceCents;
  }
  return cheapest;
}

/**
 * The one place dollars become cents in the record-a-price form. Everything
 * downstream is integer cents; a blank or non-numeric field records 0, which
 * the panel rejects before it reaches the API.
 */
export function priceDollarsToCents(dollars: string): number {
  return Math.round((Number(dollars) || 0) * 100);
}
