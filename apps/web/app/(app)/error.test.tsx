// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AppError from "./error";

describe("app-wide error boundary", () => {
  it("offers a retry and never shows the raw error", async () => {
    const reset = vi.fn();
    render(<AppError error={Object.assign(new Error("secret stack detail"), {})} reset={reset} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load this page");
    expect(document.body.textContent).not.toContain("secret stack detail");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
