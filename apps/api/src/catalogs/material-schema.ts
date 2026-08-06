/**
 * Pure helpers for the material attribute schema (#26 Phase 2a). No Prisma,
 * no I/O — MaterialSchemaService supplies the rows and these decide what the
 * stored name, the normalized vocabulary value and the search haystack are.
 */

/** An attribute as far as composition/validation cares. */
export interface AttributeShape {
  key: string;
  label: string;
  kind: "ENUM" | "TEXT" | "NUMBER";
  required: boolean;
  includeInName: boolean;
  nameOrder: number | null;
}

/**
 * Comparison key for a controlled-vocabulary value. Case-folded and
 * whitespace-collapsed so "Cedar", "cedar" and " CEDAR " are one value rather
 * than three — the divergence this whole task exists to stop.
 *
 * MUST stay in lockstep with the `lower(btrim(...))` used by the 2a migration
 * backfill; if this changes, values written before and after the change stop
 * matching each other.
 */
export function normalizeOptionValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Machine key from a human label ("Bag size" -> "bag-size"). */
export function slugifyKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Builds the stored display name from the category label and the attributes
 * flagged includeInName, in nameOrder. Deliberately ONE generic rule rather
 * than a per-category template: templates ("2x4x16 Cedar (Select)") read
 * better for lumber but need bespoke formatting per category, which is
 * exactly the code-deploy-per-category coupling #26 set out to remove.
 * Per-category templating belongs with the admin schema editor in Phase 3.
 *
 * Attributes with no value are skipped, so a partially-filled material still
 * gets a sensible name instead of one with holes in it.
 */
export function composeMaterialName(
  categoryLabel: string,
  attributes: AttributeShape[],
  specs: Record<string, string>,
): string {
  const parts = attributes
    .filter((a) => a.includeInName)
    .sort((a, b) => (a.nameOrder ?? Number.MAX_SAFE_INTEGER) - (b.nameOrder ?? Number.MAX_SAFE_INTEGER))
    .map((a) => specs[a.key]?.trim())
    .filter((v): v is string => Boolean(v));

  return [categoryLabel.trim(), ...parts].filter(Boolean).join(" ");
}

/**
 * Lowercase haystack backing `q` search. Includes spec VALUES but not their
 * keys — a contractor searches for "cedar", never for "species".
 */
export function buildSearchText(
  name: string,
  description: string | null | undefined,
  specs: Record<string, string> | null | undefined,
): string {
  return [name, description ?? "", ...Object.values(specs ?? {})]
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * How many whole sell units to buy for a measured quantity — the one
 * conversion #26 accepts (see the units decision). Rounds UP, because you
 * cannot buy 0.4 of a box, and applies wastePct as overage BEFORE rounding so
 * the waste allowance can't be swallowed by the rounding step.
 *
 * Returns null when the material has no coverage configured, which is the
 * normal case; callers then use the measured quantity as-is.
 */
export function sellUnitsRequired(
  measuredQty: number,
  coveragePerSellUnit: number | null | undefined,
  wastePct: number | null | undefined,
): number | null {
  if (!coveragePerSellUnit || coveragePerSellUnit <= 0) return null;
  if (!Number.isFinite(measuredQty) || measuredQty <= 0) return 0;
  const withWaste = measuredQty * (1 + (wastePct ?? 0) / 100);
  return Math.ceil(withWaste / coveragePerSellUnit);
}
