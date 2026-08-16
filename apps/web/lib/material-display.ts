/**
 * Shared display composition for a saved material favourite ("variant"): its
 * name plus any filled-in spec values (e.g. "Lumber 2x4 x 16ft x Select"),
 * which is what tells two same-named variants apart (2x4x8 cedar vs
 * 2x4x16 mahogany). Every place a favourite's identity is rendered — the quote
 * builder's type-ahead picker/dropdown label, the quote line description
 * composed when a favourite is picked, and the job builder's material
 * picker — goes through these so they can't drift apart from each other
 * (previously JobForm had its own `materialLabel` that ignored specs
 * entirely).
 */
export interface MaterialLike {
  name: string;
  specs?: Record<string, string> | null;
  /** Set once the material has been entered against the Phase 2a attribute
   * schema (#26). Its presence means `name` was COMPOSED server-side from the
   * category's includeInName attributes. */
  categoryDefId?: string | null;
  /** True when the contractor pinned the name by hand instead of letting it
   * compose. */
  nameCustom?: boolean | null;
}

/**
 * The name + spec-values part shared by every rendering below.
 *
 * TWO SHAPES live here, and telling them apart is the whole job:
 *
 * - Phase 2a materials (categoryDefId set, nameCustom false) already carry
 *   their spec values INSIDE `name`, because MaterialSchemaService composed it
 *   there ("Lumber 2x4 16ft Cedar Select"). Appending the specs again would
 *   render "Lumber 2x4 16ft Cedar Select 2x4 x 16ft x Select" on a document a
 *   customer reads. So the name is used verbatim.
 *
 * - Legacy/uncategorized materials (and 2a materials with a pinned custom
 *   name, which may say nothing about the variant) still need the Phase 1
 *   composition, or their Dimension/Length/Grade never reach the quote line —
 *   the original defect this module was written to fix.
 *
 * Specs are joined in stored order (Object.values preserves insertion order
 * for string keys), so they read in the category's own field order rather
 * than alphabetically.
 */
export function materialVariantName(m: MaterialLike): string {
  const nameAlreadyComposed = Boolean(m.categoryDefId) && !m.nameCustom;
  if (nameAlreadyComposed) return m.name;

  const specValues = m.specs ? Object.values(m.specs).filter(Boolean) : [];
  return specValues.length > 0 ? `${m.name} ${specValues.join(" x ")}` : m.name;
}

/**
 * PREVIEW-ONLY mirror of the server's composeMaterialName
 * (apps/api/src/catalogs/material-schema.ts), used to show a contractor what
 * their material will be called while they are still filling the form.
 *
 * The SERVER IS AUTHORITATIVE — it composes the name that is actually stored,
 * and this never decides anything. It is duplicated rather than shared because
 * the rule is six lines and the alternative is a new cross-package export for
 * a live-preview string; if the two ever disagree the stored name still wins
 * and the preview is simply briefly wrong. Keep them in step by hand.
 */
export function composeMaterialNamePreview(
  categoryLabel: string,
  attributes: { key: string; includeInName: boolean; nameOrder: number | null }[],
  specs: Record<string, string>,
): string {
  const parts = attributes
    .filter((a) => a.includeInName)
    .sort((a, b) => (a.nameOrder ?? Number.MAX_SAFE_INTEGER) - (b.nameOrder ?? Number.MAX_SAFE_INTEGER))
    .map((a) => specs[a.key]?.trim())
    .filter((v): v is string => Boolean(v));
  return [categoryLabel.trim(), ...parts].filter(Boolean).join(" ");
}

/** Dropdown/picker option label: variant name, unit (if any), and last known
 * price — so contractors can tell variants and stale prices apart at a
 * glance. Materials with no category/specs (the pre-existing shape) render
 * exactly as before: "name (unit) — price". */
export function materialFavouriteLabel(
  m: MaterialLike & { unit?: string | null; priceDollars: number },
): string {
  const price = `$${m.priceDollars.toLocaleString("en-JM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const base = materialVariantName(m);
  const withUnit = m.unit ? `${base} (${m.unit})` : base;
  return `${withUnit} — ${price}`;
}

/**
 * Quote-line description composed from a picked favourite: variant name plus
 * its free-text description, if set. Deliberately excludes price/unit — those
 * live in the line's own unitPriceCents/rateUnit fields, not its description
 * text. This is what makes the specs feature actually visible on the quote
 * document handed to the customer (see QuoteBuilder.pickFavourite /
 * createMaterialForLine) — previously a picked favourite contributed only
 * its bare `name`, so a variant's Dimension/Length/Grade never appeared on
 * the line at all.
 */
export function materialLineDescription(
  m: MaterialLike & { description?: string | null },
): string {
  const base = materialVariantName(m);
  const desc = m.description?.trim();
  return desc ? `${base} — ${desc}` : base;
}
