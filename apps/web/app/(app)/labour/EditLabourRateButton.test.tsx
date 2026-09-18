// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RateUnit } from "@jamquote/core";
import EditLabourRateButton from "./EditLabourRateButton";
import type { LabourRate } from "@/lib/types";

// Rendering a form and driving it with userEvent exceeds vitest's 5s default under the
// full parallel run; this was intermittently timing out, a harness limit, not behaviour.
vi.setConfig({ testTimeout: 30_000 });

/**
 * Wiring test mirroring EditMaterialButton.test.tsx: EditLabourRateButton
 * must call labourRateEditPayloadFromValues (sends explicit null for a
 * blanked skillTier), not labourRatePayloadFromValues (the create builder,
 * which omits it — a no-op on a PATCH). Reverting
 * EditLabourRateButton.tsx:29 to the create builder must fail this test.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    updateLabourRate: vi.fn().mockResolvedValue({}),
  };
});

function rate(overrides: Partial<LabourRate> = {}): LabourRate {
  return {
    id: "rate-1",
    trade: "Mason",
    skillTier: "Journeyman",
    rateCents: 500000,
    rateDollars: 5000,
    rateUnit: RateUnit.DAY,
    ...overrides,
  };
}

describe("EditLabourRateButton wiring", () => {
  it("blanking the skill tier sends an explicit null, not an omission", async () => {
    const { updateLabourRate } = await import("@/lib/api-client");
    render(<EditLabourRateButton rate={rate()} trades={[]} />);

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    const skillTier = await screen.findByLabelText(/skill tier/i);
    await userEvent.clear(skillTier);

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateLabourRate).toHaveBeenCalledTimes(1);
    const [id, payload] = (updateLabourRate as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(id).toBe("rate-1");
    expect(payload.skillTier).toBeNull();
    expect("skillTier" in payload).toBe(true);
  });
});
