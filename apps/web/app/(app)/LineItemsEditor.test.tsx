// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GctTreatment, LineCategory, QuoteDetailLevel, RateUnit } from "@jamquote/core";
import type { DraftLine } from "@/lib/line-editor";
import { LineKind } from "@/lib/line-editor";

/**
 * Unit price had no `step`, so the browser's number spinner (and typed
 * fractional cents) rounded to whole dollars — a $10.50 material silently
 * became $10 or $11. Measured quantity (the coverage calculator) had the
 * same gap against `BOUNDS.quantity.step`. Both are checked directly against
 * `BOUNDS` so this test cannot drift from the source of truth.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/use-material-schema", () => ({
  useMaterialSchema: () => ({ schema: { units: [] }, loading: false }),
  invalidateMaterialSchema: vi.fn(),
}));
vi.mock("@/lib/api-client", () => ({
  createEquipmentItem: vi.fn(),
  createJob: vi.fn(),
  createLabourRate: vi.fn(),
  createMaterialFavourite: vi.fn(),
  createMaterialUnit: vi.fn(),
  updateMaterialFavourite: vi.fn(),
}));

import LineItemsEditor from "./LineItemsEditor";
import { BOUNDS } from "@jamquote/core";

function baseLine(overrides: Partial<DraftLine> = {}): DraftLine {
  return {
    key: "l1",
    kind: LineKind.MATERIAL,
    heading: { kind: "category", category: LineCategory.MATERIAL },
    description: "Cement",
    quantity: "2",
    rateUnit: RateUnit.UNIT,
    unitPriceDollars: "10",
    gctTreatment: GctTreatment.STANDARD,
    ...overrides,
  } as DraftLine;
}

describe("LineItemsEditor — numeric input steps", () => {
  it("gives unit price a money step", () => {
    render(
      <LineItemsEditor
        documentNoun="quote"
        lines={[baseLine()]}
        onLinesChange={() => {}}
        detailLevel={QuoteDetailLevel.SUMMARY}
        onDetailLevelChange={() => {}}
      />,
    );
    const unitPrice = screen.getByPlaceholderText("Unit $");
    expect(unitPrice).toHaveAttribute("step", "0.01");
  });

  it("gives measured quantity BOUNDS.quantity.step", () => {
    const favourite = {
      id: "fav-1",
      name: "Paint",
      priceCents: 5000,
      measureUnit: "sq ft",
      coveragePerSellUnit: 400,
      wastePct: 0,
    };
    render(
      <LineItemsEditor
        documentNoun="quote"
        lines={[baseLine({ materialFavouriteId: "fav-1" })]}
        onLinesChange={() => {}}
        favourites={[favourite as never]}
        detailLevel={QuoteDetailLevel.SUMMARY}
        onDetailLevelChange={() => {}}
      />,
    );
    const measured = screen.getByLabelText(/measured quantity, in sq ft/i);
    expect(measured).toHaveAttribute("step", String(BOUNDS.quantity.step));
  });
});
