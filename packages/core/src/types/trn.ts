/**
 * Displaying a Jamaican TRN.
 *
 * A TRN is STORED as nine bare digits — `trnSchema` strips punctuation on the
 * way in, so the database never holds a format. That is the right call: one
 * canonical form means a TRN typed as `102458963` and one typed as
 * `102-458-963` are the same value, and neither has to be normalised at
 * comparison time.
 *
 * But nobody in Jamaica reads or writes it that way. It is quoted, printed on
 * invoices and read aloud in groups of three, and a nine-digit run is
 * genuinely harder to check against a paper document. So the grouping is a
 * DISPLAY concern, applied at every surface that shows one.
 *
 * Lives in core because there are nine such surfaces — settings, the quote and
 * invoice PDFs, both public pages, the quote detail header, the admin console,
 * the client form and the accountant export. A format re-implemented nine
 * times is a format that will eventually disagree with itself.
 */

/**
 * `102458963` -> `102-458-963`.
 *
 * Anything that is not exactly nine digits is returned TRIMMED BUT OTHERWISE
 * UNTOUCHED. Two reasons: a partially typed number must not be rearranged
 * under the person typing it, and a value that somehow is not a Jamaican TRN
 * should be shown as it actually is rather than forced into a shape it does
 * not have. Displaying a wrong tax number tidily is worse than displaying it
 * plainly.
 */
export function formatTrn(trn: string | null | undefined): string {
  if (!trn) return "";
  const trimmed = trn.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length !== 9) return trimmed;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/**
 * The same grouping, applied as someone types.
 *
 * Separate from `formatTrn` because the rules differ: this one groups a
 * PARTIAL number too, so the dashes appear as the field fills rather than
 * arriving all at once on the ninth digit. It also caps at nine digits, since
 * a tenth is always a typo.
 *
 * Returns bare digits grouped — never the original string — so pasting
 * `TRN: 102 458 963` yields `102-458-963` rather than being rejected.
 */
export function formatTrnInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)];
  return groups.filter((g) => g.length > 0).join("-");
}
