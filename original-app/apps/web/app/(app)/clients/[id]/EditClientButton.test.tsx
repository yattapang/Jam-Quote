// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EditClientButton from "./EditClientButton";
import type { Client } from "@/lib/types";

// Rendering a form and driving it with userEvent exceeds vitest's 5s default under the
// full parallel run; this was intermittently timing out, a harness limit, not behaviour.
vi.setConfig({ testTimeout: 30_000 });

/**
 * Wiring test mirroring EditMaterialButton.test.tsx: EditClientButton must
 * call clientEditPayloadFromValues (sends explicit null for a blanked town),
 * not clientPayloadFromValues (the create builder, which omits it — a no-op
 * on a PATCH). Reverting EditClientButton.tsx:23 to the create builder must
 * fail this test.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    updateClient: vi.fn().mockResolvedValue({}),
  };
});

function client(overrides: Partial<Client> = {}): Client {
  return {
    id: "client-1",
    firstName: "Jane",
    lastName: "Doe",
    name: "Jane Doe",
    initials: "JD",
    town: "Ocho Rios",
    parish: "St. Ann" as Client["parish"],
    phone: "876-555-0100",
    address: "1 Main St",
    email: "jane@example.com",
    trn: undefined,
    ...overrides,
  } as Client;
}

describe("EditClientButton wiring", () => {
  it("blanking the town sends an explicit null, not an omission", async () => {
    const { updateClient } = await import("@/lib/api-client");
    render(<EditClientButton client={client()} />);

    await userEvent.click(screen.getByRole("button", { name: /^edit$/i }));

    const town = await screen.findByLabelText(/town \/ city/i);
    await userEvent.clear(town);

    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(updateClient).toHaveBeenCalledTimes(1);
    const [id, payload] = (updateClient as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(id).toBe("client-1");
    expect(payload.town).toBeNull();
    expect("town" in payload).toBe(true);
  });
});
