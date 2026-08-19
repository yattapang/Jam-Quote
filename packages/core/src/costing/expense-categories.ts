/**
 * Suggested expense categories for a purchase.
 *
 * A deliberate middle path. `Purchase.category` stays FREE TEXT — a contractor
 * must be able to write their own word, and the house rule in this codebase is
 * that vocabulary never needs a migration to extend. But free text with no
 * suggestions drifts immediately: "Cement", "cement" and "Cemnt" become three
 * categories, and the accountant export they exist for cannot group any of it.
 *
 * So these are OFFERED, not enforced — a datalist, not a dropdown. They cover
 * what a Jamaican contractor actually spends on, in the words they would use.
 *
 * If tenants start needing their own managed list — hiding ones they never
 * use, renaming others — promote this to a table alongside MaterialCategoryDef
 * and Trade, which already work that way. Not yet: a constant costs nothing
 * and a table needs an admin screen to be worth having.
 */
export const PURCHASE_CATEGORY_SUGGESTIONS = [
  "Materials",
  "Labour",
  "Subcontractor",
  "Equipment hire",
  "Tools",
  "Transport & fuel",
  "Permits & fees",
  "Overheads",
] as const;

/**
 * Group purchases by category for a spend breakdown, largest first.
 *
 * Blank and whitespace-only categories collapse into one "Uncategorised"
 * bucket rather than several invisible ones, and matching is case- and
 * padding-insensitive so "cement " and "Cement" are the same line — which is
 * the drift the suggestions above exist to reduce but cannot prevent.
 */
export function groupByCategory<T extends { category?: string | null; amountCents: number }>(
  purchases: readonly T[],
): { category: string; totalCents: number; count: number }[] {
  const buckets = new Map<string, { category: string; totalCents: number; count: number }>();

  for (const p of purchases) {
    const label = p.category?.trim() || "Uncategorised";
    const key = label.toLowerCase();
    const existing = buckets.get(key);
    if (existing) {
      existing.totalCents += p.amountCents;
      existing.count += 1;
    } else {
      // First spelling seen wins the label, so the list reads in the
      // contractor's own words rather than a normalised one they never typed.
      buckets.set(key, { category: label, totalCents: p.amountCents, count: 1 });
    }
  }

  return [...buckets.values()].sort((a, b) => b.totalCents - a.totalCents);
}
