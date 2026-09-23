// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditMaterialButton from "./EditMaterialButton";
import ToastProvider from "@/components/ui/ToastProvider";
import type { MaterialFavourite } from "@/lib/types";

vi.setConfig({ testTimeout: 30_000 });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    updateMaterialFavourite: vi.fn(),
    fetchMaterialSchema: vi.fn().mockResolvedValue({ categories: [], units: [] }),
    getSuppliersClient: vi.fn().mockResolvedValue([]),
    getMaterialPrices: vi.fn().mockResolvedValue([]),
  };
});

function material(overrides: Partial<MaterialFavourite> = {}): MaterialFavourite {
  return {
    id: "mat-1",
    name: "Cement",
    nameCustom: true,
    priceCents: 1000,
    priceDollars: 10,
    supplierId: "sup-1",
    description: "Portland",
    measureUnit: "m²",
    coveragePerSellUnit: 4,
    wastePct: 10,
    ...overrides,
  } as MaterialFavourite;
}

describe("EditMaterialButton — success toast", () => {
  it("shows 'Material saved' only after a successful save", async () => {
    const { updateMaterialFavourite } = await import("@/lib/api-client");
    vi.mocked(updateMaterialFavourite).mockResolvedValue({} as never);

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <EditMaterialButton material={material()} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Material saved");
  });

  it("does not show the toast when the save fails", async () => {
    const { updateMaterialFavourite } = await import("@/lib/api-client");
    vi.mocked(updateMaterialFavourite).mockRejectedValue(new Error("Couldn't save."));

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <EditMaterialButton material={material()} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await screen.findByText(/couldn't save/i);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
