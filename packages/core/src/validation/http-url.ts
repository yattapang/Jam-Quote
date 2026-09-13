/**
 * Is this a full http(s) web address?
 *
 * ## Why this is in core, and why it is stricter than Zod's `.url()`
 *
 * `z.string().url()` accepts `javascript:`, `mailto:` and `ftp:`. The rule-pack and
 * regulatory DTOs used it for `sourceUrl`, and two screens render that value straight
 * into an `href` — one of them the CONTRACTOR dashboard's regulatory feed, which is a
 * tenant-facing surface. So anything holding a staff token could store a `javascript:`
 * URL and have every tenant's browser offer it as a link.
 *
 * A correct check already existed as a private function inside one web module, and its
 * own comment named those three schemes as the reason Zod's rule was not enough. It was
 * applied to that form's client-side validation and never to the DTO or to the second
 * render site: the hazard was identified and then closed in one place out of three.
 * That is this repo's oldest defect shape — a correct helper no caller reaches.
 *
 * One definition, spent by the DTOs, the client validator and the render guard.
 */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * The value to put in an `href`, or null when it is not a safe web address.
 *
 * Render sites spend this rather than trusting stored data, because a row written
 * before the DTO was tightened is still in the database. Tightening the input and not
 * guarding the output would leave every existing row live — and `sourceUrl` has been
 * editable from the console since long before the DTO knew better.
 */
export function safeHref(value: string | null | undefined): string | null {
  return value != null && value !== "" && isHttpUrl(value) ? value : null;
}

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
 */
export function isIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
