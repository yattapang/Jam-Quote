/**
 * Units on a job recipe row, and how pickers describe the items they offer.
 *
 * Pure, so it can be tested without rendering the form. It lives here because the
 * rule used to exist twice: once in ComponentRow's picker closure, and once as an
 * inline copy in the add-new-equipment path that could not reach that closure and
 * fell back to inventing a unit from the billing cadence.
 */
import type { EquipmentItem, LabourRate } from "@/lib/types";
import { lineUnitLabel } from "@/lib/quote-totals";

/**
 * The unit a recipe row should carry after an item is picked OR created for it.
 *
 * One definition, because there were two and they disagreed. The pickers in
 * `ComponentRow` kept a unit the contractor had typed and carried the item's own unit
 * otherwise, inventing nothing. The "add new equipment" path in `JobForm` could not
 * reach that closure, so it grew an inline copy that fell back to
 * `created.rateUnit.toLowerCase()` - stamping a word invented from the cadence enum
 * ("day") into the recipe and over whatever the contractor had written. That is the
 * exact defect the comment on `keepTypedUnit` records as fixed; it was fixed for
 * picking an existing item and not for creating one.
 */
export function keptUnit(
  typed: string | null | undefined,
  own: string | null | undefined,
): { unitLabel?: string } {
  if (typed?.trim()) return {}; // never clobber what the contractor wrote
  const mine = own?.trim();
  return mine ? { unitLabel: mine } : {};
}

export function equipmentLabel(e: EquipmentItem): string {
  const price = `$${e.rateDollars.toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${e.name} (${price}/${lineUnitLabel(e)})`;
}

/**
 * A labour component's description: the rate's trade and skill tier, with no
 * price — the description text lives on the component row, not the picker.
 * Sibling of `labourLabel` below (which is picker-only and includes price);
 * used by both ways of adding a labour component (picking an existing rate
 * and creating one inline) so they stop spelling the same rate two ways
 * ("Mason (Senior)" vs "Mason — Senior").
 */
export function labourDescription(r: { trade: string; skillTier?: string | null }): string {
  return r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade;
}

export function labourLabel(r: LabourRate): string {
  const price = `$${r.rateDollars.toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const trade = r.skillTier ? `${r.trade} — ${r.skillTier}` : r.trade;
  // The rate's OWN unit, not its cadence. This read `r.rateUnit.toLowerCase()` and
  // ignored `r.unitLabel` entirely, so a labour rate sold per job still printed its
  // billing cadence in the picker - the original "30 units for a job sold by the
  // metre" defect, in a function the unit-label guard cannot see into.
  return `${trade} (${price}/${lineUnitLabel(r)})`;
}
