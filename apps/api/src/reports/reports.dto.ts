import { z } from "zod";

/**
 * GET /reports query params. Both are optional and, when either is missing,
 * ReportsController fills in the current Jamaica-local calendar month (see
 * currentJamaicaMonthRange in reports.service.ts) — a fresh install of the
 * Reports page should show "this month" by default, not an error.
 *
 * z.coerce.date() so a bad/unparsable string becomes Invalid Date rather than
 * throwing here; ReportsController rejects an Invalid Date explicitly so the
 * caller gets a clear 400 instead of a confusing empty report.
 */
export const reportsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ReportsQueryInput = z.infer<typeof reportsQuerySchema>;
