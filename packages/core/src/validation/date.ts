/**
 * Is this a real calendar date in YYYY-MM-DD form?
 *
 * The rule-pack DTO validates `verifiedAsOf` with `z.string().date()`, which
 * checks calendar validity (no `2026-02-31`), not just the shape of the string.
 * The web client re-validated the same field with `/^\d{4}-\d{2}-\d{2}$/`, which
 * matches the shape but not the calendar — so a save the DTO would refuse with a
 * clear field message instead 400'd on the server via the array-path error. This
 * is the one definition both the DTO and the client spend, so the two cannot
 * drift back apart.
 *
 * `year` must be built with `setUTCFullYear`, not `Date.UTC`: `Date.UTC(year, ...)`
 * maps any two- or fewer-digit `year` (0-99) onto 1900-1999, per the ECMA-262 rule
 * for `Date.UTC`/`new Date(...)` with a year in that range. `z.string().date()`
 * has no such special case — it accepts "0000-01-01" as year 0 — so the two
 * disagreed on every year below 100. Starting from a UTC epoch and overwriting
 * the year field with `setUTCFullYear` never invokes that legacy mapping.
 */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
