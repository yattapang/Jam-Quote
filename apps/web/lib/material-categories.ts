/**
 * Structured material catalog: each category names the set of spec fields a
 * contractor fills in for that kind of material (e.g. rebar diameter/length,
 * block size/type). Drives the dynamic spec fields in MaterialForm and the
 * category filter + option labels on the materials page and the quote
 * builder's saved-material picker. Mirrors MaterialFavourite.category /
 * .specs (both nullable/free-form strings — see schema.prisma) — this list is
 * just the UI's suggested set, not a DB-enforced enum.
 */
export interface MaterialCategory {
  name: string;
  /** Ordered spec field labels this category asks for (e.g. "Diameter",
   * "Length"). Empty for categories with no standard spec shape ("Other"). */
  specFields: string[];
}

export const MATERIAL_CATEGORIES: MaterialCategory[] = [
  { name: "Steel / Rebar", specFields: ["Diameter", "Length"] },
  { name: "Blocks", specFields: ["Size", "Type"] },
  { name: "Lumber", specFields: ["Dimension", "Length", "Grade"] },
  { name: "Cement", specFields: ["Type", "Bag size"] },
  { name: "Aggregate / Sand", specFields: ["Type"] },
  { name: "Roofing", specFields: ["Type", "Gauge"] },
  { name: "Tiles", specFields: ["Size", "Finish"] },
  { name: "Plumbing", specFields: ["Diameter", "Material"] },
  { name: "Electrical", specFields: ["Gauge", "Type"] },
  { name: "Paint", specFields: ["Type", "Finish"] },
  { name: "Other", specFields: [] },
];

/** The ordered spec field labels for a given category name, or an empty
 * array when the category is unset/unrecognized (e.g. an older material with
 * no category, or a custom string not in the curated list). */
export function specFieldsFor(category?: string | null): string[] {
  return MATERIAL_CATEGORIES.find((c) => c.name === category)?.specFields ?? [];
}

/**
 * Reconciles a material form's spec values when the user switches category
 * mid-edit. Two categories can share a field label (e.g. "Type" appears on
 * Cement, Aggregate/Sand, Roofing, Electrical and Paint; "Diameter" appears
 * on Steel/Rebar and Plumbing) — a value typed under a shared label carries
 * over rather than vanishing just because the category changed. Anything
 * typed under a label the new category doesn't ask for is dropped (there's
 * nowhere to show it), and its label is reported in `dropped` so the caller
 * can warn the contractor instead of silently discarding their input (see
 * MaterialForm's category Select onChange).
 */
export function specsForCategoryChange(
  previousSpecs: Record<string, string>,
  previousCategory: string | undefined,
  nextCategory: string | undefined,
): { specs: Record<string, string>; dropped: string[] } {
  const previousFields = specFieldsFor(previousCategory);
  const nextFields = new Set(specFieldsFor(nextCategory));
  const specs: Record<string, string> = {};
  const dropped: string[] = [];
  for (const field of previousFields) {
    const value = previousSpecs[field]?.trim();
    if (!value) continue;
    if (nextFields.has(field)) specs[field] = value;
    else dropped.push(field);
  }
  return { specs, dropped };
}
