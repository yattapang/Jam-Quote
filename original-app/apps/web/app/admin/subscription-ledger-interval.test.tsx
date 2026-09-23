// @vitest-environment jsdom
import { describe, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TenantBilling } from "./AdminConsole";
import type { AdminSubscriptionPayment } from "@/lib/api-client";

/**
 * S13: `AdminSubscriptionPayment` dropped `interval`, which the endpoint sends, so
 * a ledger row could not say whether a receipt bought a month or a year — on the
 * exact screen reconciled against a bank statement. This renders the real ledger
 * row (`TenantBilling`, exported from `AdminConsole.tsx` for this test) with a
 * mocked fetch and asserts the term shows on screen, so a rewrite that drops the
 * field from the type OR the render fails here rather than only in a type check.
 */

function row(overrides: Partial<AdminSubscriptionPayment> = {}): AdminSubscriptionPayment {
  return {
    id: "sp-1",
    businessId: "biz-1",
    amountCents: 250_000,
    currency: "JMD",
    method: "BANK_TRANSFER",
    reference: "REF-1",
    paidAt: "2026-08-01T00:00:00.000Z",
    coversFrom: "2026-08-01T00:00:00.000Z",
    coversUntil: "2027-08-01T00:00:00.000Z",
    interval: "annual",
    note: null,
    voidedAt: null,
    ...overrides,
  };
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/impersonation-actions", () => ({ startImpersonation: vi.fn() }));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return { ...actual, getSubscriptionPayments: vi.fn().mockResolvedValue([]) };
});

describe("the subscription ledger row", () => {
  it("shows the term the payment bought, not just the date range", async () => {
    const { getSubscriptionPayments } = await import("@/lib/api-client");
    vi.mocked(getSubscriptionPayments).mockResolvedValueOnce([row({ interval: "annual" })]);
    render(<TenantBilling businessId="biz-1" onChanged={() => {}} currency="JMD" />);
    await screen.findByText(/· year/);
  });

  it("shows month for a monthly payment", async () => {
    const { getSubscriptionPayments } = await import("@/lib/api-client");
    vi.mocked(getSubscriptionPayments).mockResolvedValueOnce([row({ id: "sp-2", interval: "monthly" })]);
    render(<TenantBilling businessId="biz-1" onChanged={() => {}} currency="JMD" />);
    await screen.findByText(/· month/);
  });
});
