// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import BillingCard from "./BillingCard";

/**
 * getBillingStatus returns null when it couldn't load. The card said so in
 * its body, but its header pill still read "Free" - asserting a plan the page
 * never learned. A Pro contractor would be told they were on Free.
 */
describe("BillingCard with no status", () => {
  it("says billing couldn't load and does not claim a plan", () => {
    render(<BillingCard status={null} plans={null} />);
    expect(screen.getByText(/Couldn't load billing status/i)).toBeInTheDocument();
    expect(screen.queryByText("Free")).not.toBeInTheDocument();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upgrade/i })).not.toBeInTheDocument();
  });
});
