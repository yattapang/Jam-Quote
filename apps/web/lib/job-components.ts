/**
 * Duplicate detection for a job's recipe, used by the job builder.
 *
 * The document already consolidates repeated items when it prints (see
 * groupJobComponents in @jamquote/core). This is the other half: telling the
 * contractor at the moment they do it, because adding the same material twice
 * is almost always a slip — reported as exactly that — and a job whose recipe
 * says "1 bag, 1 bag" is harder to read and edit later than one saying "2".
 *
 * Deliberately advisory, not preventive. A duplicate is not invalid: two rows
 * that genuinely match in price and unit cost the same whether merged or
 * left apart, and blocking the save would stop someone recording a recipe
 * the way they think about it. It is flagged, and merging is offered — but
 * ONLY when merging cannot change the price: two rows with a different unit
 * price, or a different unit, are flagged without a merge, because folding
 * them into one row-with-one-price would silently reprice the job (see
 * mergeDuplicateComponents below). Same price and unit is still not always
 * enough: core rounds each row's extension half-up, so three "Sand" rows at
 * $0.10 x 0.333 cost 9c unmerged but 10c merged, and canMerge/
 * mergeDuplicateComponents refuse that pair too, using core's own
 * lineExtension so this can never disagree with what the job actually costs.
 */

import { lineExtension, normalizeUnitLabel } from "@jamquote/core";

/** The subset of a builder row this module reasons about. */
export interface ComponentLike {
  key: string;
  kind: string;
  materialFavouriteId?: string;
  labourRateId?: string;
  equipmentItemId?: string;
  description: string;
  quantityPerUnit: string;
  /** The form holds price in dollars as a string (JobComponentDraft), same as
   * quantityPerUnit. Absent on the bare test fixtures that don't care about
   * price/unit — undefined is treated as "no price set". */
  unitPriceDollars?: string;
  unitLabel?: string;
}

const isBlank = (c: ComponentLike) =>
  !c.materialFavouriteId && !c.labourRateId && !c.equipmentItemId && !c.description.trim();

/**
 * What makes two rows "the same thing" for FLAGGING purposes. A picked
 * library row is identified by its id — the surest signal, and immune to a
 * description someone edited. Anything typed by hand falls back to its
 * trimmed, case-folded description, so "Cement" and "cement " still read as
 * one item. Deliberately loose: it does not consider price or unit, because
 * two differently-priced "Transport" rows are still worth flagging to the
 * contractor even though they cannot be safely merged.
 */
function identity(c: ComponentLike): string {
  const libraryId = c.materialFavouriteId ?? c.labourRateId ?? c.equipmentItemId;
  return libraryId ? `${c.kind}:id:${libraryId}` : `${c.kind}:text:${c.description.trim().toLowerCase()}`;
}

/**
 * What makes two rows safely MERGEABLE: the same identity() AND the same
 * unit price AND the same unit. Summing quantities across rows that don't
 * share a price silently reprices the job (a $5,000 row and a $3,000 row
 * "combined" into one $5,000-priced row of quantity 2 goes from $8,000 to
 * $10,000) — so price is part of the merge key, not just the flag key.
 * Same for unit: "1 bag" + "25 kg" must never become "26 bag".
 */
function mergeIdentity(c: ComponentLike): string {
  return `${identity(c)}:price:${priceCentsOf(c)}:unit:${normalizeUnitLabel(c.unitLabel ?? "")}`;
}

// Compared as cents, not the raw string, so "5000" and "5000.00" (both
// legitimate ways the form or an API round-trip could spell the same price)
// still count as the same price.
function priceCentsOf(c: ComponentLike): number {
  return c.unitPriceDollars !== undefined ? Math.round((Number(c.unitPriceDollars) || 0) * 100) : 0;
}

/**
 * Whether folding this whole GROUP of same-mergeIdentity rows into one row
 * changes the total cost. Compares the sum of each row's own (rounded)
 * lineExtension against the lineExtension of one row holding the summed,
 * step-rounded quantity — the exact computation mergeDuplicateComponents
 * would produce — using core's lineExtension so this can never drift from
 * what computeJobUnitCostCents actually charges.
 *
 * A single-row "group" is trivially mergeable (there is nothing to fold).
 */
function extensionsEqualAfterMerge(group: readonly ComponentLike[]): boolean {
  const [first, ...rest] = group;
  if (!first || rest.length === 0) return true;
  const priceCents = priceCentsOf(first);
  const sumIndividual = group.reduce(
    (sum, c) => sum + lineExtension(Number(c.quantityPerUnit) || 0, priceCents),
    0,
  );
  const totalQty = roundToQuantityStep(
    group.reduce((sum, c) => sum + (Number(c.quantityPerUnit) || 0), 0),
  );
  const mergedExtension = lineExtension(totalQty, priceCents);
  return mergedExtension === sumIndividual;
}

/**
 * Whether the row `key` belongs to a group that can be safely folded
 * together: at least one other row shares its identity() AND its price and
 * unit AND merging that group would not change the total cost (see
 * extensionsEqualAfterMerge). Used by the job builder to decide whether to
 * offer "Combine them" for a flagged duplicate, or the no-button warning
 * instead.
 */
export function canMerge(components: readonly ComponentLike[], key: string): boolean {
  const target = components.find((c) => c.key === key);
  if (!target || isBlank(target)) return false;
  const id = identity(target);
  const group = components.filter((c) => !isBlank(c) && identity(c) === id);
  if (group.length < 2) return false;
  const mid = mergeIdentity(target);
  if (!group.every((c) => mergeIdentity(c) === mid)) return false;
  return extensionsEqualAfterMerge(group);
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
    if (isBlank(c)) continue;
    const id = identity(c);
    if (seen.has(id)) duplicates.add(c.key);
    else seen.add(id);
  }
  return duplicates;
}

/** Round to the quantity field's step (BOUNDS.quantity.step = 0.001, i.e. 3
 * decimal places) so a summed quantity like 0.1 + 0.2 === 0.30000000000000004
 * can actually be saved — both the browser input and the DTO refuse a value
 * with more decimal places than the step allows. */
const QUANTITY_STEP = 0.001;
function roundToQuantityStep(n: number): number {
  return Math.round(n / QUANTITY_STEP) * QUANTITY_STEP;
}

/**
 * Folds every TRUE duplicate — same identity, same unit price, same unit,
 * AND (see extensionsEqualAfterMerge) a merged row that costs exactly what
 * the separate rows summed to — into its first occurrence, summing
 * quantities, and drops the now-empty rows. Rows that only share a loose
 * identity() but differ in price or unit are left exactly as they were, and
 * so is a group that shares price and unit but whose merged extension would
 * round to a different cent than the sum of its parts (core rounds each
 * row's extension half-up, so e.g. three rows of $0.10 x 0.333 cost 9c
 * unmerged but 10c merged): merging either would change the total cost,
 * which this function must never do (see the P0 tests in
 * job-components.test.ts).
 *
 * Quantities are summed as numbers, rounded to the quantity step, and
 * written back as a string, because that is what the form holds. A blank or
 * unparseable quantity counts as zero rather than poisoning the total with
 * NaN.
 *
 * Order is unchanged, including blank rows: the result is built by walking
 * the input once, keeping every row in place and only dropping a row that is
 * a later occurrence of an already-merged, mergeable identity.
 */
export function mergeDuplicateComponents<T extends ComponentLike>(components: readonly T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const c of components) {
    if (isBlank(c)) continue;
    const id = mergeIdentity(c);
    const group = groups.get(id);
    if (group) group.push(c);
    else groups.set(id, [c]);
  }

  const mergeableIds = new Set<string>();
  const totals = new Map<string, number>();
  for (const [id, group] of groups) {
    if (group.length < 2 || !extensionsEqualAfterMerge(group)) continue;
    mergeableIds.add(id);
    totals.set(
      id,
      group.reduce((sum, c) => sum + (Number(c.quantityPerUnit) || 0), 0),
    );
  }

  const seen = new Set<string>();
  const result: T[] = [];
  for (const c of components) {
    if (isBlank(c)) {
      result.push(c);
      continue;
    }
    const id = mergeIdentity(c);
    if (!mergeableIds.has(id)) {
      result.push(c);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const total = totals.get(id) ?? 0;
    result.push({ ...c, quantityPerUnit: String(roundToQuantityStep(total)) });
  }
  return result;
}
