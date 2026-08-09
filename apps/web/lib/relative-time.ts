/**
 * Compact "how long ago" labels for API timestamps.
 *
 * Lives in lib/ rather than beside its first caller because two unrelated
 * screens need it — the admin console's supplier-feed freshness column and the
 * contractor-facing supplier price comparison — and a component must never
 * import from a page module.
 *
 * The API deliberately sends raw ISO timestamps rather than pre-rendered
 * relative strings (a server-rendered "2 hours ago" is wrong the moment it is
 * cached), so the formatting is ours to do.
 */

/** Rounded to the coarsest useful unit — a price quoted "3d ago" is stale
 * whether it was 3 or 4 hours into that day, and the extra precision would
 * only make the row noisier. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "—";
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
