import { LineCategory } from "@jamquote/core";
import type { ThemeTokens } from "@jamquote/ui";

/** Section heading label + accent color per line category, matching the
 * quote editor's Materials (info) / Labour (warn) / Equipment (good) coding
 * in extracted/JamQuote.dc.html. Subcontractor/Other fall back to accent. */
export const categoryLabel: Record<LineCategory, string> = {
  MATERIAL: "Materials",
  LABOUR: "Labour",
  EQUIPMENT: "Equipment & rental",
  RENTAL: "Equipment & rental",
  SUBCONTRACTOR: "Subcontractors",
  OTHER: "Other",
};

export function categoryColor(category: LineCategory, colors: ThemeTokens): string {
  switch (category) {
    case LineCategory.MATERIAL:
      return colors.info;
    case LineCategory.LABOUR:
      return colors.warn;
    case LineCategory.EQUIPMENT:
    case LineCategory.RENTAL:
      return colors.good;
    default:
      return colors.accent;
  }
}

export const CATEGORY_ORDER: LineCategory[] = [
  LineCategory.MATERIAL,
  LineCategory.LABOUR,
  LineCategory.EQUIPMENT,
  LineCategory.RENTAL,
  LineCategory.SUBCONTRACTOR,
  LineCategory.OTHER,
];
