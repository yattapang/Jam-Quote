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

/**
 * What ONE line contributes to the subtotal: the extension plus its markup.
 *
 * Extracted because the accountant's `invoice-lines` export printed
 * `quantity * unitPrice` and never read `markupPct` at all — so on any invoice
 * carrying a line-level markup the lines file summed to LESS than the Subtotal
 * column of `invoices-issued`, breaking the one reconciliation invariant PLANNING
 * §4g says must hold.
 *
 * The comment above that line claimed "rounded the same way computeTotals rounds
 * it… any other rounding here and the file stops reconciling". The rounding was
 * right. The field it did not mention was the one that broke it — and its test
 * passed because the fixtures omitted `markupPct`, under a comment calling them
 * "the shape the real data has".
 *
 * So there is now one function, and both callers use it. Rounding once, in one
 * place, is the only way two files can be relied on to agree.
 */
export function lineAmountCents(line: Pick<TotalsLineInput, "quantity" | "unitPriceCents" | "markupPct">): Cents {
  const extensionCents = lineExtension(line.quantity, line.unitPriceCents);
  const markup = line.markupPct ?? 0;
  return markup > 0 ? extensionCents + applyPct(extensionCents, markup) : extensionCents;
}

export function computeTotals(input: TotalsInput): QuoteTotals {
  const discountPct = input.discountPct ?? 0;

  const lineTotals: LineTotal[] = input.lines.map((l) => ({
    extensionCents: lineExtension(l.quantity, l.unitPriceCents),
    afterMarkupCents: lineAmountCents(l),
    gctTreatment: l.gctTreatment,
  }));

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
