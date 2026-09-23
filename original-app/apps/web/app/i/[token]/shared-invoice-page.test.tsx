// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The public invoice page (polish batch 4): logo when present, and dates
 * formatted identically to the PDF's own formatter.
 */

const getSharedInvoice = vi.fn();
const getSharedInvoiceLogo = vi.fn();

vi.mock("@/lib/public-invoice", () => ({
  getSharedInvoice: (...args: unknown[]) => getSharedInvoice(...args),
  getSharedInvoiceLogo: (...args: unknown[]) => getSharedInvoiceLogo(...args),
}));

import SharedInvoicePage from "./page";

const baseInvoice = {
  number: "I-0007",
  status: "INVOICED",
  issueDate: "2026-09-01T12:00:00.000Z",
  dueDate: "2026-09-30T12:00:00.000Z",
  terms: "",
  detailLevel: "STANDARD",
  gctRate: "0.15",
  discountPct: "0",
  depositCents: 0,
  subtotalCents: 100000,
  gctCents: 15000,
  totalCents: 115000,
  paidCents: 0,
  retentionCents: 0,
  retentionReleased: false,
  clientName: "Marcia Brown",
  lineItems: [
    {
      id: "l1",
      description: "Roof repair",
      quantity: "1",
      rateUnit: "JOB",
      unitLabel: null,
      amountCents: 100000,
    },
  ],
  sections: [],
  business: {
    name: "Blackwood Construction",
    addressLine: "12 Main St",
    town: "Kingston",
    parish: "Kingston",
    trn: null,
  },
};

beforeEach(() => {
  getSharedInvoice.mockReset().mockResolvedValue(baseInvoice);
  getSharedInvoiceLogo.mockReset().mockResolvedValue(undefined);
});

describe("SharedInvoicePage", () => {
  it("shows the logo when the business has one", async () => {
    getSharedInvoiceLogo.mockResolvedValue({ dataUri: "data:image/png;base64,BBBB" });
    render(await SharedInvoicePage({ params: { token: "tok_1" } }));
    const img = screen.getByAltText("Blackwood Construction logo");
    expect(img).toHaveAttribute("src", "data:image/png;base64,BBBB");
  });

  it("renders cleanly with no logo element when there isn't one", async () => {
    render(await SharedInvoicePage({ params: { token: "tok_1" } }));
    expect(screen.queryByAltText(/logo/i)).not.toBeInTheDocument();
  });

  it("formats issued/due dates the same way as the PDF's dateLabel helper", async () => {
    const { dateLabel } = await import("@/lib/api-client");
    render(await SharedInvoicePage({ params: { token: "tok_1" } }));
    expect(screen.getByText(dateLabel(baseInvoice.issueDate, "Issued "))).toBeInTheDocument();
    expect(screen.getByText(dateLabel(baseInvoice.dueDate, "Due "))).toBeInTheDocument();
    expect(screen.queryByText(/2026-09-01/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-09-30/)).not.toBeInTheDocument();
  });

  it("renders the unavailable-link message for an unknown token", async () => {
    getSharedInvoice.mockResolvedValue(undefined);
    render(await SharedInvoicePage({ params: { token: "bad" } }));
    expect(screen.getByText(/isn't available/i)).toBeInTheDocument();
  });
});
