// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Owner decision "c": warn (never block) when a document charges GCT while
 * the business isn't registered. See REVIEW-FINDINGS.md, "GCT is CHARGED
 * regardless of registration". The quote builder's GCT rate itself isn't
 * editable here (it's set by the page from the business default/registration
 * status before the builder ever mounts — see quotes/new/page.tsx), so this
 * only has to check the warning shows/hides for the rate x registration
 * combinations the builder is given.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  createQuote: vi.fn().mockResolvedValue({ id: "q_new" }),
  updateQuote: vi.fn().mockResolvedValue({ id: "q_new" }),
  createClient: vi.fn(),
  createProject: vi.fn(),
  createMaterialUnit: vi.fn(),
  createTrade: vi.fn(),
  invalidateMaterialSchema: vi.fn(),
}));

vi.mock("../../LineItemsEditor", () => ({
  default: () => <div data-testid="line-editor" />,
}));

import QuoteBuilder from "./QuoteBuilder";

const WARNING_TEXT = /you're charging gct but your profile says you're not gct registered/i;

function renderBuilder(gctRatePct: number, gctRegistered: boolean) {
  render(
    <QuoteBuilder
      clients={[{ id: "cl_1", name: "Marcia Brown" }]}
      projects={[]}
      gctRatePct={gctRatePct}
      gctRegistered={gctRegistered}
      initial={{ discountPct: 0, depositCents: 0, lines: [] }}
    />,
  );
}

describe("QuoteBuilder — GCT-while-unregistered warning", () => {
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
    expect(screen.getByRole("button", { name: /create quote/i })).toBeEnabled();
  });
});
