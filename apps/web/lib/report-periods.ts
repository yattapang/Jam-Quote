/**
 * Period presets for the Reports page's `?period=` searchParam. Server-
 * rendered on purpose (see app/(app)/reports/page.tsx) — the period lives in
 * the URL rather than client state, so it's a plain link switch with no
 * client component needed for the page shell.
 *
 * The Jamaica offset comes from core, the same constant the month bucketing
 * uses. These presets decide the window's edges and core decides which bucket
 * each row falls in, so if the two ever disagreed, "This month" would select
 * a range whose boundaries sit in a different month than the buckets drawn
 * from it — the chart would gain or lose a column for no visible reason.
 */
import { JAMAICA_UTC_OFFSET_MS } from "@jamquote/core";

function jamaicaLocalMidnightUtc(year: number, monthIndex0: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex0, day, 0, 0, 0, 0) - JAMAICA_UTC_OFFSET_MS);
}

/** {year, monthIndex0} of `now` as Jamaica-local calendar fields. */
function jamaicaYearMonth(now: Date): { year: number; month: number } {
  const shifted = new Date(now.getTime() + JAMAICA_UTC_OFFSET_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

export const REPORT_PERIODS = [
  { value: "month", label: "This month" },
  { value: "quarter", label: "Last 3 months" },
  { value: "year", label: "This year" },
  { value: "all", label: "All time" },
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number]["value"];

export function isReportPeriod(value: string | undefined): value is ReportPeriod {
  return REPORT_PERIODS.some((p) => p.value === value);
}

/**
 * Resolve a period preset to an explicit [from, to) ISO range for the API.
 *
 * "month" deliberately returns `{}` (no from/to) rather than computing the
 * range itself — GET /reports already defaults to the current Jamaica-local
 * calendar month when both are omitted (see ReportsService.resolveRange), so
 * this lets the API stay the single source of truth for "this month" instead
 * of two independent implementations quietly drifting apart.
 */
export function periodRange(period: ReportPeriod, now: Date = new Date()): { from?: string; to?: string } {
  if (period === "month") return {};

  const { year, month } = jamaicaYearMonth(now);
  // Exclusive end: start of the month AFTER the current one, Jamaica-local.
  const endYear = month === 11 ? year + 1 : year;
  const endMonth = month === 11 ? 0 : month + 1;
  const to = jamaicaLocalMidnightUtc(endYear, endMonth, 1).toISOString();

  if (period === "quarter") {
    // Start of the month 2 months before this one (so the window covers 3
    // whole calendar months including the current one).
    const startOffset = month - 2;
    const startYear = startOffset < 0 ? year - 1 : year;
    const startMonth = ((startOffset % 12) + 12) % 12;
    return { from: jamaicaLocalMidnightUtc(startYear, startMonth, 1).toISOString(), to };
  }

  if (period === "year") {
    return { from: jamaicaLocalMidnightUtc(year, 0, 1).toISOString(), to };
  }

  // "all": no real invoice/quote/job predates the platform, so a fixed
  // far-past boundary is equivalent to "everything" without needing a
  // separate unbounded code path through computeReportsSummary (which always
  // expects a concrete range).
  return { from: "2000-01-01T00:00:00.000Z", to };
}
