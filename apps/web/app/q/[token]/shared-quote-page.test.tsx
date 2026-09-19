// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The public quote page (polish batch 4): the logo, when the business has
 * one; identical dates to the PDF's own formatter; and the accept button
 * always present for an answerable quote.
 */

const getSharedQuote = vi.fn();
const getSharedQuoteLogo = vi.fn();

vi.mock("@/lib/public-quote", () => ({
  getSharedQuote: (...args: unknown[]) => getSharedQuote(...args),
  getSharedQuoteLogo: (...args: unknown[]) => getSharedQuoteLogo(...args),
}));

import SharedQuotePage from "./page";

const baseQuote = {
  number: "Q-0042",
  status: "SENT",
  validUntil: "2026-10-01T12:00:00.000Z",
  clientName: "Marcia Brown",
  subtotalCents: 100000,
  gctCents: 15000,
  totalCents: 115000,
  depositCents: 0,
  discountPct: "0",
  terms: "",
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
  getSharedQuote.mockReset().mockResolvedValue(baseQuote);
  getSharedQuoteLogo.mockReset().mockResolvedValue(undefined);
});

describe("SharedQuotePage", () => {
  it("shows the logo when the business has one", async () => {
    getSharedQuoteLogo.mockResolvedValue({ dataUri: "data:image/png;base64,AAAA" });
    render(await SharedQuotePage({ params: { token: "tok_1" } }));
    const img = screen.getByAltText("Blackwood Construction logo");
    expect(img).toHaveAttribute("src", "data:image/png;base64,AAAA");
  });

  it("renders cleanly with no logo element when there isn't one", async () => {
    getSharedQuoteLogo.mockResolvedValue(undefined);
    render(await SharedQuotePage({ params: { token: "tok_1" } }));
    expect(screen.queryByAltText(/logo/i)).not.toBeInTheDocument();
  });

  it("formats the valid-until date the same way as the PDF's dateLabel helper", async () => {
    const { dateLabel } = await import("@/lib/api-client");
    render(await SharedQuotePage({ params: { token: "tok_1" } }));
    expect(screen.getByText(dateLabel(baseQuote.validUntil, "Valid until "))).toBeInTheDocument();
    expect(screen.queryByText(/2026-10-01/)).not.toBeInTheDocument();
  });

  it("shows the accept button for an answerable quote", async () => {
    render(await SharedQuotePage({ params: { token: "tok_1" } }));
    expect(screen.getByRole("button", { name: /accept/i })).toBeInTheDocument();
  });

  it("renders the unavailable-link message for an unknown token, with no stack trace", async () => {
    getSharedQuote.mockResolvedValue(undefined);
    render(await SharedQuotePage({ params: { token: "bad" } }));
    expect(screen.getByText(/isn't available/i)).toBeInTheDocument();
  });
});
