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
