// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvoiceStatus } from "@jamquote/core";
import ToastProvider from "@/components/ui/ToastProvider";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

vi.mock("@/lib/api-client", () => ({
  recordManualPayment: vi.fn(),
  voidPayment: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import PaymentsPanel from "./PaymentsPanel";
import { recordManualPayment } from "@/lib/api-client";

describe("PaymentsPanel — success toast", () => {
  it("shows 'Payment recorded' after a successful save", async () => {
    vi.mocked(recordManualPayment).mockResolvedValue({ id: "pay-1" } as never);
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <PaymentsPanel invoiceId="inv-1" status={InvoiceStatus.INVOICED} balanceDueCents={10_000} payments={[]} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await user.type(screen.getByLabelText(/amount/i), "100");
    const form = screen.getByLabelText(/amount/i).closest("form")!;
    fireEvent.submit(form);

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Payment recorded");
  });

  it("does not show the toast when the save fails", async () => {
    vi.mocked(recordManualPayment).mockRejectedValue(new Error("Couldn't record that payment."));
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <PaymentsPanel invoiceId="inv-1" status={InvoiceStatus.INVOICED} balanceDueCents={10_000} payments={[]} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await user.type(screen.getByLabelText(/amount/i), "100");
    const form = screen.getByLabelText(/amount/i).closest("form")!;
    fireEvent.submit(form);

    await screen.findByText(/couldn't record that payment/i);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
