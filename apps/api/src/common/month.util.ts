/**
 * Start of the current calendar month, server time (00:00 on the 1st).
 * Used as the "quotes this month" boundary for free-tier gating and the
 * billing status endpoint — deliberately simple (no timezone handling)
 * per the Phase-1 scope.
 */
export function startOfCurrentMonth(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
