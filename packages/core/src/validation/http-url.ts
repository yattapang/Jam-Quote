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
