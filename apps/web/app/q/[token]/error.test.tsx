// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SharedQuoteError from "./error";

describe("SharedQuoteError", () => {
  it("renders a calm message with no raw error text, API mention or stack trace", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("ECONNREFUSED 10.0.0.4:3001 /public/quotes/x"), {
      digest: "abc123",
    });
    render(<SharedQuoteError error={error} reset={() => {}} />);

    expect(screen.getByText(/isn't loading right now/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/ECONNREFUSED/)).not.toBeInTheDocument();
    expect(screen.queryByText(/api/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/abc123/)).not.toBeInTheDocument();
    expect(screen.queryByText(/stack/i)).not.toBeInTheDocument();
  });
});
