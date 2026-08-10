/**
 * Pure helpers behind the "+ Add new…" rows that let a contractor create a
 * category, unit or supplier from inside the picker that needed it (#26). Kept
 * out of the forms so the two rules that actually matter — the sentinel is
 * never a real id, and an idempotent create never doubles a row — can be
 * unit-tested without a DOM.
 */

/**
 * The option value that means "I want to add one", not "I picked this one".
 * Double-underscored so it cannot collide with a cuid/uuid coming back from
 * the API, and deliberately not exported as a bare string anywhere else — the
 * predicate below is the only sanctioned way to ask.
 */
export const ADD_NEW_OPTION_VALUE = "__add__";

export function isAddNewOption(value: string | null | undefined): boolean {
  return value === ADD_NEW_OPTION_VALUE;
}

/**
 * A select value as it may be persisted: the sentinel collapses to "" (the
 * same "nothing chosen" the pickers already send). The forms never store the
 * sentinel in the first place, so this is the belt to that braces — it sits on
 * the payload builder, the last point before an id reaches the API.
 */
export function persistableOptionValue(value: string | null | undefined): string {
  return !value || isAddNewOption(value) ? "" : value;
}

/**
 * Splices a just-created row into a list so it shows up before the cached
 * schema refetches.
 *
 * The create endpoints are idempotent — a label that already matches returns
 * the EXISTING row — so the id is checked first and the incoming copy is
 * dropped rather than replacing what is already there: the stored row is the
 * canonical one (it may be curated, `custom: false`, and carry attributes this
 * caller knows nothing about).
 */
export function mergeCatalogRow<T extends { id: string }>(
  rows: readonly T[],
  created: T,
  compare: (a: T, b: T) => number,
): T[] {
  if (rows.some((r) => r.id === created.id)) return [...rows];
  return [...rows, created].sort(compare);
}

/**
 * Ordering for the material schema's categories and units, matching the order
 * the API returns them in: the curated `sort` rank first, then label, so rows
 * a contractor adds (which share the trailing sort bucket) stay alphabetical
 * among themselves instead of landing wherever the merge happened to put them.
 */
export function compareCatalogRows(
  a: { sort: number; label: string },
  b: { sort: number; label: string },
): number {
  return a.sort - b.sort || a.label.localeCompare(b.label);
}

/** Ordering for the supplier directory, which the API returns alphabetically. */
export function compareSuppliersByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}
