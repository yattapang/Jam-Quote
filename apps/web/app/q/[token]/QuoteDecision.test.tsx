// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Accept or decline, as a CLIENT meets it.
 *
 * This is the only screen in the app used by someone who has no account and
 * never will, and it is the front end of the only unauthenticated write in the
 * API. It has never been exercised by a test, which is why it is here.
 *
 * The behaviours that matter are about not making a mess of somebody else's
 * decision:
 *
 * - **A settled quote offers no buttons.** Clicking a control that can only
 *   fail is worse than not having one, and the commonest real cause is two
 *   people opening the same link.
 * - **A name is required**, and the refusal says so. It is not authentication —
 *   the token is the credential — it makes the click deliberate and gives the
 *   contractor a named answer to point at.
 * - **The API's own message is shown.** "This quote has already been answered"
 *   is the sentence a second reader needs; "is the API running?" would send a
 *   homeowner to check a server.
 */

const submitQuoteDecision = vi.fn();

vi.mock("@/lib/public-quote", () => ({
  submitQuoteDecision: (...args: unknown[]) => submitQuoteDecision(...args),
}));

import QuoteDecision from "./QuoteDecision";

beforeEach(() => {
  submitQuoteDecision.mockReset().mockResolvedValue(undefined);
});

function renderDecision(status = "SENT") {
  render(<QuoteDecision token="tok_1" status={status} businessName="Blackwood Construction" />);
  return userEvent.setup();
}

describe("QuoteDecision — when it offers a choice", () => {
  it("offers Accept and Decline on a quote that has been sent", () => {
    renderDecision("SENT");
    expect(screen.getByRole("button", { name: /accept this quote/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /decline/i })).toBeInTheDocument();
  });

  it("offers them on one the client has already opened", () => {
    renderDecision("VIEWED");
    expect(screen.getByRole("button", { name: /accept this quote/i })).toBeInTheDocument();
  });

  it("offers NOTHING on a quote already accepted", () => {
    // The commonest real cause is two people opening the same link. Showing a
    // button that can only fail is worse than showing none.
    renderDecision("ACCEPTED");
    expect(screen.queryByRole("button", { name: /accept this quote/i })).not.toBeInTheDocument();
    expect(screen.getByText(/accepted/i)).toBeInTheDocument();
  });

  it("offers nothing on one already declined, and says so", () => {
    renderDecision("DECLINED");
    expect(screen.queryByRole("button", { name: /accept this quote/i })).not.toBeInTheDocument();
    expect(screen.getByText(/declined/i)).toBeInTheDocument();
  });

  it("renders nothing at all once a quote has been invoiced", () => {
    // Past the point of deciding. No buttons, and no stale "you accepted this"
    // either.
    const { container } = render(
      <QuoteDecision token="tok_1" status="INVOICED" businessName="Blackwood Construction" />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("QuoteDecision — answering", () => {
  it("asks for a name before it will send an acceptance", async () => {
    const user = renderDecision();
    await user.click(screen.getByRole("button", { name: /accept this quote/i }));
    await user.click(screen.getByRole("button", { name: /yes, accept/i }));

    expect(submitQuoteDecision).not.toHaveBeenCalled();
    expect(screen.getByText(/please enter your name/i)).toBeInTheDocument();
  });

  it("sends the acceptance once a name is given", async () => {
    const user = renderDecision();
    await user.click(screen.getByRole("button", { name: /accept this quote/i }));
    await user.type(screen.getByLabelText(/your name/i), "Marcia Brown");
    await user.click(screen.getByRole("button", { name: /yes, accept/i }));

    expect(submitQuoteDecision).toHaveBeenCalledWith("tok_1", {
      decision: "ACCEPT",
      name: "Marcia Brown",
      reason: undefined,
    });
  });

  it("asks for an optional reason when declining, and sends it", async () => {
    // "Too expensive" and "wrong start date" lead to completely different
    // follow-ups, and a decline with no reason tells the contractor nothing
    // they can act on.
    const user = renderDecision();
    await user.click(screen.getByRole("button", { name: /^decline$/i }));
    await user.type(screen.getByLabelText(/your name/i), "Marcia Brown");
    await user.type(screen.getByLabelText(/anything you/i), "Too expensive right now");
    await user.click(screen.getByRole("button", { name: /yes, decline/i }));

    expect(submitQuoteDecision).toHaveBeenCalledWith("tok_1", {
      decision: "DECLINE",
      name: "Marcia Brown",
      reason: "Too expensive right now",
    });
  });

  it("does not attach a decline reason to an acceptance", async () => {
    const user = renderDecision();
    await user.click(screen.getByRole("button", { name: /accept this quote/i }));
    await user.type(screen.getByLabelText(/your name/i), "Marcia");
    await user.click(screen.getByRole("button", { name: /yes, accept/i }));

    expect(submitQuoteDecision.mock.calls[0]?.[1]).toMatchObject({ reason: undefined });
  });

  it("confirms afterwards, and stops offering the choice", async () => {
    const user = renderDecision();
    await user.click(screen.getByRole("button", { name: /accept this quote/i }));
    await user.type(screen.getByLabelText(/your name/i), "Marcia");
    await user.click(screen.getByRole("button", { name: /yes, accept/i }));

    expect(await screen.findByText(/accepted/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /yes, accept/i })).not.toBeInTheDocument();
  });

  it("warns that it cannot be undone here", async () => {
    // True, and deliberate: letting the public link flip an accepted quote back
    // and forth would destroy the record the feature exists to create.
    const user = renderDecision();
    await user.click(screen.getByRole("button", { name: /accept this quote/i }));
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
  });
});

describe("QuoteDecision — when the API refuses", () => {
  it("shows the API's own sentence, not a guess about the network", async () => {
    // A second person opening the same link needs THIS message.
    submitQuoteDecision.mockRejectedValue(
      new Error("This quote has already been answered. Contact the contractor to change it."),
    );
    const user = renderDecision();
    await user.click(screen.getByRole("button", { name: /accept this quote/i }));
    await user.type(screen.getByLabelText(/your name/i), "Someone Else");
    await user.click(screen.getByRole("button", { name: /yes, accept/i }));

    expect(await screen.findByText(/already been answered/i)).toBeInTheDocument();
  });

  it("does not claim success when the send failed", async () => {
    submitQuoteDecision.mockRejectedValue(new Error("This quote has already been answered."));
    const user = renderDecision();
    await user.click(screen.getByRole("button", { name: /accept this quote/i }));
    await user.type(screen.getByLabelText(/your name/i), "Someone Else");
    await user.click(screen.getByRole("button", { name: /yes, accept/i }));

    await screen.findByText(/already been answered/i);
    expect(screen.queryByText(/thank you/i)).not.toBeInTheDocument();
  });
});
