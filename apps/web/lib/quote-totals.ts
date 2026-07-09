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

export function groupLinesByCategory(quote: Quote) {
  const groups: Array<{ category: LineCategory; lines: Array<Quote["lines"][number]> }> = [];
  for (const cat of Object.values(LineCategory)) {
    const lines = quote.lines.filter((l) => l.category === cat);
    if (lines.length > 0) groups.push({ category: cat, lines });
  }
  return groups;
}

export const CATEGORY_LABEL: Record<LineCategory, string> = {
  [LineCategory.MATERIAL]: "Materials",
  [LineCategory.LABOUR]: "Labour",
  [LineCategory.EQUIPMENT]: "Equipment & rental",
  [LineCategory.RENTAL]: "Rentals",
  [LineCategory.SUBCONTRACTOR]: "Subcontractors",
  [LineCategory.OTHER]: "Other",
};

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
