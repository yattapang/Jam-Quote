// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Item 1 (HIGH): the review found that `QuoteDecision.test.tsx` mocked
 * `@/lib/public-quote`'s `submitQuoteDecision` directly with a plain `Error`,
 * which hid the real defect — the PRODUCTION `submitQuoteDecision` (in
 * `lib/public-quote.ts`) threw a bare `Error`, so `errorMessage()` (which only
 * ever surfaces an `ApiError`'s message) always fell back to the generic
 * wording. A client opening an already-answered quote read "we couldn't
 * record your response" instead of the server's own "This quote has already
 * been answered..." sentence.
 *
 * This file does NOT mock `@/lib/public-quote` — it mocks only `global.fetch`,
 * so `submitQuoteDecision` runs for real and this proves the fetcher itself
 * throws something `errorMessage()` can read.
 */
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import QuoteDecision from "./QuoteDecision";

function renderDecision() {
  return render(<QuoteDecision token="tok_abc" status="SENT" businessName="Blackwood Construction" />);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("QuoteDecision + the REAL submitQuoteDecision fetcher — a 409 from the API", () => {
  it("shows the server's own already-answered sentence, not the generic fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 409,
        json: async () => ({ message: "This quote has already been answered. Contact the contractor to change it." }),
      })) as unknown as typeof fetch,
    );

    const user = userEvent.setup();
    renderDecision();
    await user.click(screen.getByRole("button", { name: /accept this quote/i }));
    await user.type(screen.getByLabelText(/your name/i), "Someone Else");
    await user.click(screen.getByRole("button", { name: /yes, accept/i }));

    expect(
      await screen.findByText("This quote has already been answered. Contact the contractor to change it."),
    ).toBeInTheDocument();
    // It must NOT have claimed success.
    expect(screen.queryByText(/accepted — thank you/i)).not.toBeInTheDocument();
  });

  it("falls back to plain wording, not a raw transport error, when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    );

    const user = userEvent.setup();
    renderDecision();
    await user.click(screen.getByRole("button", { name: /accept this quote/i }));
    await user.type(screen.getByLabelText(/your name/i), "Someone Else");
    await user.click(screen.getByRole("button", { name: /yes, accept/i }));

    expect(await screen.findByText(/we couldn't record your response/i)).toBeInTheDocument();
    expect(screen.queryByText("Failed to fetch")).not.toBeInTheDocument();
  });
});
