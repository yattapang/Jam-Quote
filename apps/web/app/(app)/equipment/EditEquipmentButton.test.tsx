// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RateUnit } from "@jamquote/core";
import EditEquipmentButton from "./EditEquipmentButton";
import type { EquipmentItem } from "@/lib/types";

// Rendering a form and driving it with userEvent exceeds vitest's 5s default under the
// full parallel run; this was intermittently timing out, a harness limit, not behaviour.
vi.setConfig({ testTimeout: 30_000 });

/**
 * Wiring test mirroring EditMaterialButton.test.tsx: EditEquipmentButton must
 * call equipmentEditPayloadFromValues (sends explicit null for a blanked
 * vendor), not equipmentPayloadFromValues (the create builder, which omits
 * it — a no-op on a PATCH). Reverting EditEquipmentButton.tsx:21 to the
 * create builder must fail this test.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    updateEquipmentItem: vi.fn().mockResolvedValue({}),
  };
});

function item(overrides: Partial<EquipmentItem> = {}): EquipmentItem {
  return {
    id: "eq-1",
    name: "Concrete mixer",
    owned: false,
    vendor: "ABC Rentals",
    vendorPhone: "876-555-0134",
    rateCents: 500000,
    rateDollars: 5000,
    rateUnit: RateUnit.DAY,
    ...overrides,
  };
}

describe("EditEquipmentButton wiring", () => {
  it("blanking the vendor sends an explicit null, not an omission", async () => {
    const { updateEquipmentItem } = await import("@/lib/api-client");
    render(<EditEquipmentButton item={item()} />);

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    const vendor = await screen.findByLabelText(/^vendor$/i);
    await userEvent.clear(vendor);

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateEquipmentItem).toHaveBeenCalledTimes(1);
    const [id, payload] = (updateEquipmentItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(id).toBe("eq-1");
    expect(payload.vendor).toBeNull();
    expect("vendor" in payload).toBe(true);
  });
});
