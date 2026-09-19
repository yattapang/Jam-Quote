// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/**
 * "Send on WhatsApp", as a contractor meets it.
 *
 * Item 7 (first bullet): committed tests for the single-flight re-entry guard
 * and the no-phone refusal, both of which existed only as review claims
 * before this file.
 */
const shareQuote = vi.fn();
vi.mock("@/lib/api-client", () => ({
  shareQuote: (...args: unknown[]) => shareQuote(...args),
}));

import WhatsAppButton from "./WhatsAppButton";

const openSpy = vi.fn();

beforeEach(() => {
  shareQuote.mockReset();
  openSpy.mockReset();
  vi.stubGlobal("open", openSpy);
});

function renderButton(clientPhone?: string) {
  render(
    <WhatsAppButton
      quoteId="qt-1"
      quoteNum="QT-0001"
      clientName="Basil Reid"
      clientPhone={clientPhone}
      totalCents={100_000}
    />,
  );
}

describe("WhatsAppButton — no phone on file", () => {
  it("the button is disabled and a click never reaches the API", () => {
    renderButton(undefined);
    const button = screen.getByRole("button", { name: /send on whatsapp/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(shareQuote).not.toHaveBeenCalled();
  });

  it("an empty/whitespace-only phone is treated the same as no phone", () => {
    renderButton("   ");
    const button = screen.getByRole("button", { name: /send on whatsapp/i });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(shareQuote).not.toHaveBeenCalled();
  });
});

describe("WhatsAppButton — single-flight re-entry guard", () => {
  it("two synchronous clicks before the first share link resolves send only ONE shareQuote call", async () => {
    shareQuote.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ shareToken: "tok-abc" }), 10)),
    );
    renderButton("876 402 8811");
    const button = screen.getByRole("button", { name: /send on whatsapp/i });

    // Synchronous, no await between them — the same race a fast double click
    // produces, and the exact shape useSingleFlight exists to close.
    fireEvent.click(button);
    fireEvent.click(button);

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(shareQuote).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});
