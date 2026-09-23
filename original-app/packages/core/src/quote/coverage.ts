/**
 * Coverage math: turning a measured quantity into whole purchase units.
 *
 * A contractor measures a job in one unit and buys in another. The wall is
 * 40 m², the tile comes in boxes, the bill has to say boxes. Doing that
 * conversion in your head on site is where estimates quietly go wrong — and
 * getting it wrong by one box is the difference between finishing on Friday
 * and going back to the depot.
 *
 * Lives in core rather than the API because all three surfaces need the same
 * answer: the API stores it, the web quote builder shows it as you type, and
 * mobile will do the same on site. Two implementations would drift, and the
 * one that drifts is the one that quoted the customer.
 */

/** Percentage overage added before rounding, e.g. 10 for 10%. */
export type WastePct = number;

export interface CoverageResult {
  /** Whole sell units to buy — boxes, bags, sheets. */
  sellUnits: number;
  /** The measured quantity after the waste allowance, before rounding.
   * Kept so the UI can show its working instead of asserting a number. */
  withWasteQty: number;
  /** Units of pure rounding-up, i.e. how much is bought beyond the waste
   * allowance simply because you cannot buy part of a box. */
  roundedUpBy: number;
}

/**
 * How many whole sell units to buy for a measured quantity.
 *
 * Rounds UP, because you cannot buy 0.4 of a box, and applies wastePct as
 * overage BEFORE rounding — otherwise the rounding step swallows the
 * allowance and a 10% waste margin silently becomes 0% on any job that
 * happens to divide evenly.
 *
 * Returns null when the material has no coverage configured, which is the
 * normal case; callers then use the measured quantity as-is.
 */
export function sellUnitsRequired(
  measuredQty: number,
  coveragePerSellUnit: number | null | undefined,
  wastePct: WastePct | null | undefined,
): number | null {
  if (!coveragePerSellUnit || coveragePerSellUnit <= 0) return null;
  if (!Number.isFinite(measuredQty) || measuredQty <= 0) return 0;
  const withWaste = measuredQty * (1 + (wastePct ?? 0) / 100);
  return Math.ceil(withWaste / coveragePerSellUnit);
}

/**
 * The same conversion, with the intermediate figures the UI needs to explain
 * itself. A quote line that jumps from "40" to "12" with no explanation looks
 * like a bug; showing "40 m² + 10% waste = 44 m² → 12 boxes" reads as
 * arithmetic the contractor can check and correct.
 *
 * Returns null on exactly the same condition as sellUnitsRequired, so callers
 * can branch once.
 */
export function coverageBreakdown(
  measuredQty: number,
  coveragePerSellUnit: number | null | undefined,
  wastePct: WastePct | null | undefined,
): CoverageResult | null {
  const sellUnits = sellUnitsRequired(measuredQty, coveragePerSellUnit, wastePct);
  if (sellUnits === null) return null;
  const safeQty = Number.isFinite(measuredQty) && measuredQty > 0 ? measuredQty : 0;
  const withWasteQty = safeQty * (1 + (wastePct ?? 0) / 100);
  return {
    sellUnits,
    withWasteQty,
    // coveragePerSellUnit is > 0 here — sellUnitsRequired already refused
    // anything else — so this cannot divide by zero.
    roundedUpBy: sellUnits - withWasteQty / (coveragePerSellUnit as number),
  };
}
