// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Removing a supplier price used to confirm via `window.confirm`, which
 * cannot be styled and some mobile browsers block or auto-dismiss. It now
 * uses the shared ConfirmModal (same pattern as DeleteRowButton) — this
 * checks the dialog names the item, cancel is a no-op, and confirm sends
 * exactly one delete.
 */

const getMaterialPrices = vi.fn();
const getSuppliersClient = vi.fn();
const deleteMaterialPrice = vi.fn();

vi.mock("@/lib/api-client", () => ({
  createMaterialPrice: vi.fn(),
  createSupplier: vi.fn(),
  deleteMaterialPrice: (...a: unknown[]) => deleteMaterialPrice(...a),
  getMaterialPrices: (...a: unknown[]) => getMaterialPrices(...a),
  getSuppliersClient: (...a: unknown[]) => getSuppliersClient(...a),
}));

import SupplierPricePanel from "./SupplierPricePanel";

beforeEach(() => {
  getSuppliersClient.mockReset().mockResolvedValue([]);
  deleteMaterialPrice.mockReset().mockResolvedValue(undefined);
  getMaterialPrices.mockReset().mockResolvedValue([
    {
      id: "price-1",
      supplierId: "sup-1",
      supplierName: "Rapid True Value",
      priceCents: 150_000,
      fetchedAt: "2026-08-01T00:00:00.000Z",
      location: null,
      note: null,
    },
  ]);
});

function renderPanel() {
  render(
    <SupplierPricePanel materialFavouriteId="mat-1" currentPriceCents={0} onUsePrice={vi.fn()} />,
  );
  return userEvent.setup();
}

describe("SupplierPricePanel — remove confirm", () => {
  it("names the item in the dialog", async () => {
    const user = renderPanel();
    await screen.findByText(/rapid true value/i);
    await user.click(screen.getByRole("button", { name: /remove/i }));

    expect(
      screen.getByRole("heading", { name: /remove the rapid true value price of/i }),
    ).toBeInTheDocument();
  });

  it("sends nothing on cancel", async () => {
    const user = renderPanel();
    await screen.findByText(/rapid true value/i);
    await user.click(screen.getByRole("button", { name: /remove/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(deleteMaterialPrice).not.toHaveBeenCalled();
  });

  it("sends exactly one delete on confirm", async () => {
    const user = renderPanel();
    await screen.findByText(/rapid true value/i);
    await user.click(screen.getByRole("button", { name: /remove/i }));
    const buttons = screen.getAllByRole("button", { name: /^remove$/i });
    await user.click(buttons[buttons.length - 1]!);

    expect(deleteMaterialPrice).toHaveBeenCalledTimes(1);
    expect(deleteMaterialPrice).toHaveBeenCalledWith("price-1");
  });
});
