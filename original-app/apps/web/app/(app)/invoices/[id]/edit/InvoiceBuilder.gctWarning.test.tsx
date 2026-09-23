// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuoteDetailLevel } from "@jamquote/core";

/**
 * Owner decision "c": warn (never block) when a document charges GCT while
 * the business isn't registered. See REVIEW-FINDINGS.md, "GCT is CHARGED
 * regardless of registration". Unlike the quote builder, the invoice
 * builder's GCT % field is directly editable, but the warning is driven by
 * the `gctRatePct` state (seeded from `initial.gctRatePct`) x the
 * `gctRegistered` prop, same as the quote builder.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

vi.mock("@/lib/api-client", () => ({
  updateInvoice: vi.fn().mockResolvedValue({ id: "inv_1" }),
}));

vi.mock("../../../LineItemsEditor", () => ({
  default: () => <div data-testid="line-editor" />,
}));

import InvoiceBuilder from "./InvoiceBuilder";

const WARNING_TEXT = /you're charging gct but your profile says you're not gct registered/i;

function renderBuilder(gctRatePct: number, gctRegistered: boolean) {
  render(
    <InvoiceBuilder
      invoiceId="inv_1"
      invoiceNumber="INV-0001"
      gctRegistered={gctRegistered}
      initial={{
        gctRatePct,
        discountPct: 0,
        depositCents: 0,
        detailLevel: QuoteDetailLevel.SUMMARY,
        lines: [],
      }}
    />,
  );
}

describe("InvoiceBuilder — GCT-while-unregistered warning", () => {
  it("shows the warning when the rate is > 0 and the business isn't registered", () => {
    renderBuilder(15, false);
    expect(screen.getByText(WARNING_TEXT)).toBeInTheDocument();
  });

  it("hides the warning when the business is registered, even at a positive rate", () => {
    renderBuilder(15, true);
    expect(screen.queryByText(WARNING_TEXT)).not.toBeInTheDocument();
  });

  it("hides the warning when the rate is 0, even if unregistered", () => {
    renderBuilder(0, false);
    expect(screen.queryByText(WARNING_TEXT)).not.toBeInTheDocument();
  });

  it("never disables the save button — a warning, not a block", () => {
    renderBuilder(15, false);
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });
});
