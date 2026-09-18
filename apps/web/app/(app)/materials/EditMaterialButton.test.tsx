// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditMaterialButton from "./EditMaterialButton";
import type { MaterialFavourite } from "@/lib/types";

// Rendering a form and driving it with userEvent exceeds vitest's 5s default under the
// full parallel run; this was intermittently timing out, a harness limit, not behaviour.
vi.setConfig({ testTimeout: 30_000 });

/**
 * Wiring test for the material-clearing fix: EditMaterialButton must build its
 * PATCH payload with materialEditPayloadFromValues (which sends explicit
 * `null` for a blanked optional field), not materialPayloadFromValues (the
 * create builder, which OMITS a blank field — omission means "unchanged" on
 * this endpoint, so a clear would silently no-op). MaterialForm.test.ts only
 * covers the helper in isolation; nothing previously asserted which builder
 * EditMaterialButton actually calls. Reverting EditMaterialButton.tsx:38 back
 * to materialPayloadFromValues must fail this test.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    updateMaterialFavourite: vi.fn().mockResolvedValue({}),
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

describe("EditMaterialButton wiring", () => {
  it("blanking the description sends an explicit null, not an omission", async () => {
    const { updateMaterialFavourite } = await import("@/lib/api-client");
    render(<EditMaterialButton material={material()} />);

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    const description = await screen.findByLabelText(/description/i);
    await userEvent.clear(description);

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateMaterialFavourite).toHaveBeenCalledTimes(1);
    const [id, payload] = (updateMaterialFavourite as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(id).toBe("mat-1");
    expect(payload.description).toBeNull();
    expect("description" in payload).toBe(true);
  });
});
