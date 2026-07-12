import { computeTotals, LineCategory, type QuoteTotals } from "@jamquote/core";
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

/** Sum of afterMarkup cents for lines in one category — for the by-section subtotal rows. */
export function categorySubtotalCents(quote: Quote, totals: QuoteTotals, category: LineCategory): number {
  return quote.lines.reduce((sum, line, i) => {
    if (line.category !== category) return sum;
    return sum + (totals.lineTotals[i]?.afterMarkupCents ?? 0);
  }, 0);
}

function groupByCategory(lines: Array<Quote["lines"][number]>) {
  const groups: Array<{ category: LineCategory; lines: Array<Quote["lines"][number]> }> = [];
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

export interface HeadingGroup {
  title: string;
  lines: Array<Quote["lines"][number]>;
}

/**
 * Groups a quote's lines under their heading, ordered the way the user
 * introduced them: first the quote's named `sections` — already sort-ordered
 * by the API to first-appearance order (see quotes.service.ts) — each
 * keeping its custom or built-in-category title as-is.
 *
 * Legacy fallback: quotes created before per-line headings existed may still
 * carry lines outside any section. Those are grouped by built-in category
 * (canonical category order) and appended after the named sections, so old
 * quotes keep rendering instead of losing their line items.
 */
export function groupLinesByHeading(quote: Quote): HeadingGroup[] {
  const sections = (quote.sections ?? []).filter((s) => s.lines.length > 0);
  const sectionedIds = new Set(sections.flatMap((s) => s.lines.map((l) => l.id)));
  const ungrouped = quote.lines.filter((l) => !sectionedIds.has(l.id));
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
