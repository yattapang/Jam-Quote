/**
 * Pure helpers behind the "Catalog & vocabulary" settings screen (Phase 3,
 * PLANNING.md — "Archive & hide vocabulary"): deciding whether a curated or
 * tenant-owned catalog row is hidden for this business, and ordering each
 * group so a contractor scanning the list sees what's still offered first and
 * what they've turned off grouped at the bottom, rather than interleaved with
 * no visual anchor.
 *
 * Kept out of the component because there is no DOM testing in this repo —
 * the two rules that matter (a hide/unhide is looked up by kind+id, not id
 * alone, and the display order never re-sorts within a bucket) are unit
 * tested here instead.
 */

/** Mirrors the API's CatalogKind (apps/api/src/catalogs/catalog-hidden.service.ts)
 * — the only three values the API accepts for a hidden-catalog entry. */
export type CatalogEntryKind = "MATERIAL_CATEGORY" | "MATERIAL_UNIT" | "TRADE";

export interface HiddenCatalogEntry {
  kind: CatalogEntryKind;
  rowId: string;
}

/** Composite key: ids are only unique WITHIN a kind (a category and a unit
 * live in different tables), so kind must be part of the lookup key. */
function hiddenKey(kind: CatalogEntryKind, rowId: string): string {
  return `${kind}:${rowId}`;
}

/** Builds an O(1) lookup set from GET /catalogs/hidden's flat list. */
export function buildHiddenSet(entries: readonly HiddenCatalogEntry[]): Set<string> {
  return new Set(entries.map((e) => hiddenKey(e.kind, e.rowId)));
}

export function isHidden(
  hiddenSet: ReadonlySet<string>,
  kind: CatalogEntryKind,
  rowId: string,
): boolean {
  return hiddenSet.has(hiddenKey(kind, rowId));
}

/** Returns a NEW set with one entry added (hiding) or removed (unhiding) —
 * used to update local state optimistically once the API call for that
 * change has actually succeeded. Never mutates the set it was given. */
export function withHiddenToggled(
  hiddenSet: ReadonlySet<string>,
  kind: CatalogEntryKind,
  rowId: string,
  hidden: boolean,
): Set<string> {
  const next = new Set(hiddenSet);
  const key = hiddenKey(kind, rowId);
  if (hidden) next.add(key);
  else next.delete(key);
  return next;
}

/**
 * Orders one group (categories, units, or trades) for display: rows still
 * offered first, in the order the caller passed them in, then hidden rows
 * after, also in the order passed in. `rows` is expected to already be in
 * the order the API/schema returns (sort-then-label for categories/units,
 * alphabetical for trades) — this only splits that order into two buckets,
 * it never re-sorts within either one.
 */
export function orderForDisplay<T extends { id: string }>(
  rows: readonly T[],
  hiddenSet: ReadonlySet<string>,
  kind: CatalogEntryKind,
): T[] {
  const visible: T[] = [];
  const hidden: T[] = [];
  for (const row of rows) {
    (isHidden(hiddenSet, kind, row.id) ? hidden : visible).push(row);
  }
  return [...visible, ...hidden];
}
