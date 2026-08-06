/**
 * Shared display composition for a saved material favourite ("variant"): its
 * name plus any filled-in spec values (e.g. "Lumber 2x4 x 16ft x Select"),
 * which is what tells two same-named variants apart (2x4x8 cedar vs
 * 2x4x16 mahogany — see apps/web/lib/material-categories.ts for where specs
 * come from). Every place a favourite's identity is rendered — the quote
 * builder's type-ahead picker/dropdown label, the quote line description
 * composed when a favourite is picked, and the assembly builder's material
 * picker — goes through these so they can't drift apart from each other
 * (previously AssemblyForm had its own `materialLabel` that ignored specs
 * entirely).
 */
export interface MaterialLike {
  name: string;
  specs?: Record<string, string> | null;
}

/** The name + spec-values part shared by every rendering below. Specs are
 * joined in the order they were stored (Object.values preserves insertion
 * order for string keys, and materialPayloadFromValues inserts them in the
 * category's own field order — see MaterialForm), so "Dimension x Length x
 * Grade" reads in a sensible order rather than alphabetically. */
export function materialVariantName(m: MaterialLike): string {
  const specValues = m.specs ? Object.values(m.specs).filter(Boolean) : [];
  return specValues.length > 0 ? `${m.name} ${specValues.join(" x ")}` : m.name;
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
