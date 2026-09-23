// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/impersonation-actions", () => ({ startImpersonation: vi.fn() }));

import { TenantBilling } from "./AdminConsole";

/**
 * "Record & extend term" recorded real money on ONE click, with no
 * confirmation — unlike Void beside it, which already used window.confirm.
 * It also left the Term <select> on whatever the staffer last chose after a
 * successful save, silently pre-selecting "switch term again" the next time
 * the drawer opened for the same tenant.
 */

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    getSubscriptionPayments: vi.fn().mockResolvedValue([]),
    recordSubscriptionPayment: vi.fn().mockResolvedValue({}),
    voidSubscriptionPayment: vi.fn().mockResolvedValue({}),
  };
});

function renderBilling() {
  const onChanged = vi.fn();
  render(<TenantBilling businessId="biz-1" onChanged={onChanged} currency="USD" />);
  return { onChanged };
}

describe("Record & extend term — confirmation", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("cancelling the confirm fires no request", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { recordSubscriptionPayment } = await import("@/lib/api-client");
    renderBilling();

    await userEvent.click(await screen.findByRole("button", { name: /record payment/i }));
    await userEvent.click(await screen.findByRole("button", { name: /record & extend term/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(recordSubscriptionPayment).not.toHaveBeenCalled();
  });

  it("the confirm names the amount and the term", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderBilling();

    await userEvent.click(await screen.findByRole("button", { name: /record payment/i }));
    await userEvent.type(screen.getByLabelText(/amount/i), "25.00");
    await userEvent.selectOptions(screen.getByLabelText(/^term$/i), "annual");
    await userEvent.click(await screen.findByRole("button", { name: /record & extend term/i }));

    const message = confirmSpy.mock.calls[0]?.[0] as string;
    expect(message).toMatch(/25/);
    expect(message).toMatch(/annual/i);
  });

  it("confirming fires the request", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { recordSubscriptionPayment } = await import("@/lib/api-client");
    renderBilling();

    await userEvent.click(await screen.findByRole("button", { name: /record payment/i }));
    await userEvent.click(await screen.findByRole("button", { name: /record & extend term/i }));

    expect(recordSubscriptionPayment).toHaveBeenCalledTimes(1);
  });

  it("resets the term choice back to 'Keep current term' after a successful record", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderBilling();

    await userEvent.click(await screen.findByRole("button", { name: /record payment/i }));
    const termSelect = screen.getByLabelText(/^term$/i) as HTMLSelectElement;
    await userEvent.selectOptions(termSelect, "annual");
    await userEvent.click(await screen.findByRole("button", { name: /record & extend term/i }));

    // The drawer re-opens after a successful save (setOpen(false) then a
    // fresh "Record payment" click) — the term must not still read "annual".
    await userEvent.click(await screen.findByRole("button", { name: /record payment/i }));
    expect((screen.getByLabelText(/^term$/i) as HTMLSelectElement).value).toBe("");
  });
});
