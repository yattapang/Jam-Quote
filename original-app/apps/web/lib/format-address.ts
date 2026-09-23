/**
 * Joins the parts of an address into one line, skipping blanks.
 *
 * Exists because town (#30) is optional and most existing records do not have
 * one — naive interpolation produced ", St. Catherine" or trailing commas on
 * the document a customer reads. Parts are ordered street -> town -> parish,
 * which is how a Jamaican address is written.
 */
export function formatAddress(
  parts: (string | null | undefined)[],
): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(", ");
}
