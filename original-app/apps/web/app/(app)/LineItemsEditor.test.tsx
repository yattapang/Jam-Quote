// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
import { createMaterialFavourite } from "@/lib/api-client";

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

describe("LineItemsEditor — favourite-save lock is keyed by material identity", () => {
  it("two DIFFERENT lines that name the SAME material create only one favourite when saved back-to-back", async () => {
    vi.mocked(createMaterialFavourite).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ id: "fav-new", name: "Cement", priceCents: 1000 } as never), 5)),
    );

    // Two separate LINE keys, same freehand description and price — the
    // real-world case is the same material entered twice on one document.
    // Before the fix the lock was keyed by line `key`, so both lines' saves
    // passed the "not found yet" check and both created a favourite.
    const lines = [baseLine({ key: "l1", description: "Cement", unitPriceDollars: "10" }), baseLine({ key: "l2", description: "Cement", unitPriceDollars: "10" })];

    render(
      <LineItemsEditor
        documentNoun="quote"
        lines={lines}
        onLinesChange={() => {}}
        detailLevel={QuoteDetailLevel.SUMMARY}
        onDetailLevelChange={() => {}}
      />,
    );

    const saveButtons = screen.getAllByRole("button", { name: "Save as favourite material" });
    expect(saveButtons).toHaveLength(2);

    // Synchronous, no await between them — the same race a fast double click
    // produces, and the exact shape useSingleFlight-style locks exist to close.
    fireEvent.click(saveButtons[0]!);
    fireEvent.click(saveButtons[1]!);

    // Let both in-flight promises settle.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(createMaterialFavourite).toHaveBeenCalledTimes(1);
  });

  it("two DIFFERENT materials saved back-to-back are NOT blocked by each other's lock", async () => {
    vi.mocked(createMaterialFavourite).mockClear();
    vi.mocked(createMaterialFavourite).mockImplementation(
      (input: unknown) =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ id: `fav-${(input as { name: string }).name}`, ...(input as object), priceCents: 1000 } as never),
            5,
          ),
        ),
    );

    // Two DIFFERENT materials — the identity key (materialFavouriteId, or
    // `desc:${name}` for a freehand line) differs between them, so this must
    // NOT hit the same-material lock the test above exists to prove closes.
    const lines = [
      baseLine({ key: "l1", description: "Cement", unitPriceDollars: "10" }),
      baseLine({ key: "l2", description: "Sand", unitPriceDollars: "8" }),
    ];

    render(
      <LineItemsEditor
        documentNoun="quote"
        lines={lines}
        onLinesChange={() => {}}
        detailLevel={QuoteDetailLevel.SUMMARY}
        onDetailLevelChange={() => {}}
      />,
    );

    const saveButtons = screen.getAllByRole("button", { name: "Save as favourite material" });
    expect(saveButtons).toHaveLength(2);

    fireEvent.click(saveButtons[0]!);
    fireEvent.click(saveButtons[1]!);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(createMaterialFavourite).toHaveBeenCalledTimes(2);
  });
});
