/**
 * Whether "Add to quote" may be pressed on the Add material screen.
 *
 * `quantity > 0 && effectiveUnitPriceCents > 0` used to be missing entirely —
 * only the override-note requirement was checked, so a zero quantity or a
 * zero (non-overridden) price line could be added to the quote silently.
 * Kept in its own module (no React Native imports) so it can be unit tested
 * directly.
 */
export function canSaveMaterialLine(
  quantity: number,
  effectiveUnitPriceCents: number,
  isOverridden: boolean,
  overrideNote: string,
): boolean {
  return quantity > 0 && effectiveUnitPriceCents > 0 && (!isOverridden || overrideNote.trim().length > 0);
}
