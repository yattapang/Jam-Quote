// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddClientButton from "./AddClientButton";
import ToastProvider from "@/components/ui/ToastProvider";

vi.setConfig({ testTimeout: 30_000 });

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, createClient: vi.fn() };
});

/**
 * AddClientButton only shows the "Client saved" toast after createClient
 * actually resolves, and NOT when it rejects — the plant for this task was
 * exactly the opposite: showing the toast before the save resolved. See
 * ToastProvider.tsx for the mechanism and AddClientButton.tsx:18-19 for the
 * call site.
 */
describe("AddClientButton — success toast", () => {
  it("shows 'Client saved' only after a successful save", async () => {
    const { createClient } = await import("@/lib/api-client");
    vi.mocked(createClient).mockResolvedValue({ id: "c1" } as never);

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AddClientButton />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: /add client/i }));
    await user.type(await screen.findByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.click(screen.getByRole("button", { name: /save client/i }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Client saved");
  });

  it("does not show the toast when the save fails", async () => {
    const { createClient } = await import("@/lib/api-client");
    vi.mocked(createClient).mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AddClientButton />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: /add client/i }));
    await user.type(await screen.findByLabelText(/first name/i), "Jane");
    await user.type(screen.getByLabelText(/last name/i), "Doe");
    await user.click(screen.getByRole("button", { name: /save client/i }));

    await screen.findByText(/network down|couldn't save/i);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
