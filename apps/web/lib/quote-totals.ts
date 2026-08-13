import { computeTotals, LineCategory, type QuoteTotals, type RateUnit } from "@jamquote/core";
import type { Quote } from "./types";

/** Wraps @jamquote/core's computeTotals — the only place quote math happens. */
export function getQuoteTotals(quote: Pick<Quote, "lines" | "gctRatePct" | "discountPct" | "depositCents">): QuoteTotals {
  return computeTotals({
    lines: quote.lines.map((l) => ({
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      markupPct: l.markupPct,
      gctTreatment: l.gctTreatment,
    })),
    gctRatePct: quote.gctRatePct,
    discountPct: quote.discountPct,
    depositCents: quote.depositCents,
  });
}

/**
 * What is still owed on an invoice: the total less payments already recorded.
 *
 * Lives here, beside getQuoteTotals, so the PDF and the covering email can
 * never quote two different figures. A customer who has already paid half and
 * then reads "please pay $180,000" in the email body while the attached PDF
 * says $90,000 has been given two invoices, not one.
 *
 * Clamped at zero: an overpayment is a credit to settle separately, not a
 * negative "amount due" put in front of a customer.
 */
export function invoiceBalanceCents(totalCents: number, paidCents: number): number {
  return Math.max(0, totalCents - paidCents);
}

/** Sum of afterMarkup cents for lines in one category — for the by-section subtotal rows. */
export function categorySubtotalCents(quote: Quote, totals: QuoteTotals, category: LineCategory): number {
  return quote.lines.reduce((sum, line, i) => {
    if (line.category !== category) return sum;
    return sum + (totals.lineTotals[i]?.afterMarkupCents ?? 0);
  }, 0);
}

function groupByCategory<L extends { category: LineCategory }>(lines: L[]) {
  const groups: Array<{ category: LineCategory; lines: L[] }> = [];
  for (const cat of Object.values(LineCategory)) {
    const catLines = lines.filter((l) => l.category === cat);
    if (catLines.length > 0) groups.push({ category: cat, lines: catLines });
  }
  return groups;
}

export function groupLinesByCategory(quote: Quote) {
  return groupByCategory(quote.lines);
}

export const CATEGORY_LABEL: Record<LineCategory, string> = {
  [LineCategory.MATERIAL]: "Materials",
  [LineCategory.LABOUR]: "Labour",
  [LineCategory.EQUIPMENT]: "Equipment & rental",
  [LineCategory.RENTAL]: "Rentals",
  [LineCategory.SUBCONTRACTOR]: "Subcontractors",
  [LineCategory.OTHER]: "Other",
};

export interface HeadingGroup<L = Quote["lines"][number]> {
  title: string;
  lines: L[];
}

/** Structural shape `groupLinesByHeading` needs — satisfied by `Quote` and,
 * separately, by the mapped `Invoice` view type in api-client.ts (both carry
 * a flattened `lines` array plus optional named `sections`). */
interface Groupable<L extends { id: string; category: LineCategory }> {
  lines: L[];
  sections?: { title: string; lines: L[] }[];
}

/**
 * Groups an entity's lines (a quote or an invoice) under their heading,
 * ordered the way the user introduced them: first the named `sections` —
 * already sort-ordered by the API to first-appearance order (see
 * quotes.service.ts) — each keeping its custom or built-in-category title
 * as-is.
 *
 * Legacy fallback: rows created before per-line headings existed may still
 * carry lines outside any section. Those are grouped by built-in category
 * (canonical category order) and appended after the named sections, so old
 * quotes keep rendering instead of losing their line items.
 */
export function groupLinesByHeading<L extends { id: string; category: LineCategory }>(
  entity: Groupable<L>,
): HeadingGroup<L>[] {
  const sections = (entity.sections ?? []).filter((s) => s.lines.length > 0);
  const sectionedIds = new Set(sections.flatMap((s) => s.lines.map((l) => l.id)));
  const ungrouped = entity.lines.filter((l) => !sectionedIds.has(l.id));
  const legacyGroups = groupByCategory(ungrouped).map((g) => ({
    title: CATEGORY_LABEL[g.category],
    lines: g.lines,
  }));
  return [...sections.map((s) => ({ title: s.title, lines: s.lines })), ...legacyGroups];
}

export const CATEGORY_ACCENT: Record<LineCategory, string> = {
  [LineCategory.MATERIAL]: "var(--jq-info)",
  [LineCategory.LABOUR]: "var(--jq-warn)",
  [LineCategory.EQUIPMENT]: "var(--jq-good)",
  [LineCategory.RENTAL]: "var(--jq-good)",
  [LineCategory.SUBCONTRACTOR]: "var(--jq-accent)",
  [LineCategory.OTHER]: "var(--jq-neutral-pill)",
};

/**
 * How a line's quantity is denominated on the customer-facing document.
 *
 * Prefers the line's own `unitLabel` snapshot — how the MATERIAL is sold
 * ("bag", "sheet", "length") — and falls back to rateUnit's label. rateUnit is
 * the labour-time vocabulary (HOUR/DAY/…/UNIT), so before #26 a material sold
 * by the bag printed as "unit" on the quote the customer reads.
 *
 * The snapshot is a plain string captured when the line was created, so a
 * quote already sent does not change if the contractor later renames the unit.
 */
export function lineUnitLabel(line: { rateUnit: RateUnit; unitLabel?: string | null }): string {
  return line.unitLabel?.trim() || RATE_UNIT_LABEL[line.rateUnit];
}

export const RATE_UNIT_LABEL = {
  HOUR: "hour",
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
  JOB: "job",
  UNIT: "unit",
} as const;

export const GCT_TREATMENT_LABEL = {
  STANDARD: "Standard",
  ZERO_RATED: "Zero-rated",
  EXEMPT: "Exempt",
} as const;
