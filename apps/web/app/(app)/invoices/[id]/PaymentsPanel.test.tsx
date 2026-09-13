// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InvoiceStatus, PAYMENT_REFERENCE_MAX_LENGTH } from "@jamquote/core";

/**
 * The payment reference had no `maxLength`, so a contractor could type past
 * the DTO's `z.string().max(120)` limit and only find out on save. This
 * checks the input carries the shared `PAYMENT_REFERENCE_MAX_LENGTH`
 * constant — the same one `recordManualPaymentSchema` now imports — so form
 * and server cannot drift apart again.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

vi.mock("@/lib/api-client", () => ({
  recordManualPayment: vi.fn(),
  voidPayment: vi.fn(),
}));

import PaymentsPanel from "./PaymentsPanel";

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
