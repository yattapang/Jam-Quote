// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import { InvoiceStatus, PAYMENT_REFERENCE_MAX_LENGTH } from "@jamquote/core";

/**
 * The payment reference had no `maxLength`, so a contractor could type past
 * the DTO's `z.string().max(120)` limit and only find out on save. This
 * checks the input carries the shared `PAYMENT_REFERENCE_MAX_LENGTH`
 * constant — the same one `recordManualPaymentSchema` now imports — so form
 * and server cannot drift apart again.
 *
 * A second describe block covers the double-submit guard: recording a
 * payment moves real money on the customer's statement, so two submits
 * landing before React re-renders the button disabled must not record it
 * twice — see useSingleFlight (apps/web/lib/use-single-flight.ts).
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

vi.mock("@/lib/api-client", () => ({
  recordManualPayment: vi.fn(),
  voidPayment: vi.fn(),
}));

import PaymentsPanel from "./PaymentsPanel";
import { recordManualPayment } from "@/lib/api-client";

describe("PaymentsPanel — reference field", () => {
  it("caps the reference at PAYMENT_REFERENCE_MAX_LENGTH", async () => {
    const user = userEvent.setup();
    render(
      <PaymentsPanel invoiceId="inv-1" status={InvoiceStatus.INVOICED} balanceDueCents={10_000} payments={[]} />,
    );
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    const reference = screen.getByLabelText(/reference/i);
    expect(reference).toHaveAttribute("maxLength", String(PAYMENT_REFERENCE_MAX_LENGTH));
  });
});

describe("PaymentsPanel — double submit", () => {
  it("records the payment once when the form is submitted twice with no render between", async () => {
    let resolvePayment!: () => void;
    vi.mocked(recordManualPayment).mockReturnValue(
      new Promise((resolve) => {
        resolvePayment = () => resolve({ id: "pay-1" } as never);
      }),
    );
    refresh.mockReset();

    const user = userEvent.setup();
    render(
      <PaymentsPanel invoiceId="inv-1" status={InvoiceStatus.INVOICED} balanceDueCents={10_000} payments={[]} />,
    );
    await user.click(screen.getByRole("button", { name: /record payment/i }));
    await user.type(screen.getByLabelText(/amount/i), "100");

    const form = screen.getByLabelText(/amount/i).closest("form")!;

    // Two submits fired inside one act() with no render/await between — the
    // same shape as a real double click, which `disabled={saving}` alone
    // cannot stop (both fire before the re-render lands).
    await act(async () => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      resolvePayment();
    });

    expect(recordManualPayment).toHaveBeenCalledTimes(1);
  });
});
