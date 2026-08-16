/**
 * Duplicate detection for a job's recipe, used by the job builder.
 *
 * The document already consolidates repeated items when it prints (see
 * groupJobComponents in @jamquote/core). This is the other half: telling the
 * contractor at the moment they do it, because adding the same material twice
 * is almost always a slip — reported as exactly that — and a job whose recipe
 * says "1 bag, 1 bag" is harder to read and edit later than one saying "2".
 *
 * Deliberately advisory, not preventive. A duplicate is not invalid: the cost
 * is identical either way, and blocking the save would stop someone recording
 * a recipe the way they think about it. It is flagged, and merging is offered.
 */

/** The subset of a builder row this module reasons about. */
export interface ComponentLike {
  key: string;
  kind: string;
  materialFavouriteId?: string;
  labourRateId?: string;
  equipmentItemId?: string;
  description: string;
  quantityPerUnit: string;
}

/**
 * What makes two rows "the same thing". A picked library row is identified by
 * its id — the surest signal, and immune to a description someone edited.
 * Anything typed by hand falls back to its trimmed, case-folded description,
 * so "Cement" and "cement " still read as one item.
 */
function identity(c: ComponentLike): string {
  const libraryId = c.materialFavouriteId ?? c.labourRateId ?? c.equipmentItemId;
  return libraryId ? `${c.kind}:id:${libraryId}` : `${c.kind}:text:${c.description.trim().toLowerCase()}`;
}

/**
 * Keys of rows that repeat an EARLIER row. The first occurrence is never
 * flagged — it is not the mistake, and marking both would leave the
 * contractor unsure which one to remove.
 *
 * A row with no description and nothing picked is skipped: a blank new row is
 * not a duplicate of the previous blank one, it is just unfinished.
 */
export function duplicateComponentKeys(components: readonly ComponentLike[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const c of components) {
    if (!c.materialFavouriteId && !c.labourRateId && !c.equipmentItemId && !c.description.trim()) continue;
    const id = identity(c);
    if (seen.has(id)) duplicates.add(c.key);
    else seen.add(id);
  }
  return duplicates;
}

/**
 * Folds every duplicate into its first occurrence, summing quantities, and
 * drops the now-empty rows. Order of the survivors is unchanged.
 *
 * Quantities are summed as numbers and written back as a string, because that
 * is what the form holds. A blank or unparseable quantity counts as zero
 * rather than poisoning the total with NaN.
 */
export function mergeDuplicateComponents<T extends ComponentLike>(components: readonly T[]): T[] {
  const order: string[] = [];
  const byIdentity = new Map<string, T>();
  const passthrough: T[] = [];

  for (const c of components) {
    if (!c.materialFavouriteId && !c.labourRateId && !c.equipmentItemId && !c.description.trim()) {
      passthrough.push(c);
      continue;
    }
    const id = identity(c);
    const existing = byIdentity.get(id);
    if (existing) {
      const total = (Number(existing.quantityPerUnit) || 0) + (Number(c.quantityPerUnit) || 0);
      byIdentity.set(id, { ...existing, quantityPerUnit: String(total) });
    } else {
      byIdentity.set(id, c);
      order.push(id);
    }
  }

  return [...order.map((id) => byIdentity.get(id) as T), ...passthrough];
}
