/**
 * The single source of truth for quote/invoice totals. Imported by api, web,
 * and mobile — never re-implement this per surface. See docs/ARCHITECTURE.md §5.
 */

import { GctTreatment } from "../types/enums.js";
import {
  type Cents,
  applyPct,
  lineExtension,
  roundCents,
} from "../tax/money.js";

export interface TotalsLineInput {
  quantity: number;
  unitPriceCents: Cents;
  markupPct?: number; // per-line margin, optional
  gctTreatment: GctTreatment;
}

export interface TotalsInput {
  lines: TotalsLineInput[];
  /** Business/quote GCT rate as a percentage, e.g. 15 for 15%. */
  gctRatePct: number;
  /** Optional quote-level discount percentage applied before GCT. */
  discountPct?: number;
  /** Optional deposit requested (informational; not subtracted from total). */
  depositCents?: Cents;
}

export interface LineTotal {
  extensionCents: Cents; // quantity * unitPrice
  afterMarkupCents: Cents; // extension * (1 + markup)
  gctTreatment: GctTreatment;
}

export interface QuoteTotals {
  lineTotals: LineTotal[];
  subtotalCents: Cents; // sum of afterMarkup, pre-discount
  discountCents: Cents; // >= 0, amount removed
  taxableBaseCents: Cents; // post-discount total of STANDARD lines only
  gctCents: Cents; // GCT charged
  totalCents: Cents; // subtotal - discount + gct
  depositCents: Cents; // pass-through
  balanceDueCents: Cents; // total - deposit
}

/**
 * Compute totals. GCT applies ONLY to the post-discount share of STANDARD
 * lines. ZERO_RATED and EXEMPT lines never attract GCT. Discount is spread
 * proportionally across all lines so the taxable base is reduced fairly.
 */
export function computeTotals(input: TotalsInput): QuoteTotals {
  const discountPct = input.discountPct ?? 0;

  const lineTotals: LineTotal[] = input.lines.map((l) => {
    const extensionCents = lineExtension(l.quantity, l.unitPriceCents);
    const markup = l.markupPct ?? 0;
    const afterMarkupCents =
      markup > 0
        ? extensionCents + applyPct(extensionCents, markup)
        : extensionCents;
    return { extensionCents, afterMarkupCents, gctTreatment: l.gctTreatment };
  });

  const subtotalCents = lineTotals.reduce(
    (sum, l) => sum + l.afterMarkupCents,
    0,
  );

  const discountCents = discountPct > 0 ? applyPct(subtotalCents, discountPct) : 0;

  // Post-discount taxable base: STANDARD lines only, discounted proportionally.
  const standardBeforeDiscount = lineTotals
    .filter((l) => l.gctTreatment === GctTreatment.STANDARD)
    .reduce((sum, l) => sum + l.afterMarkupCents, 0);

  const discountFactor =
    subtotalCents > 0 ? (subtotalCents - discountCents) / subtotalCents : 1;

  const taxableBaseCents = roundCents(standardBeforeDiscount * discountFactor);
  const gctCents = applyPct(taxableBaseCents, input.gctRatePct);

  const totalCents = subtotalCents - discountCents + gctCents;
  const depositCents = input.depositCents ?? 0;
  const balanceDueCents = totalCents - depositCents;

  return {
    lineTotals,
    subtotalCents,
    discountCents,
    taxableBaseCents,
    gctCents,
    totalCents,
    depositCents,
    balanceDueCents,
  };
}
