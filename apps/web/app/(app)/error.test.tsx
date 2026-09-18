// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import AppError from "./error";

afterEach(() => {
  refresh.mockClear();
});

describe("app-wide error boundary", () => {
  it("offers a retry and never shows the raw error", async () => {
    const reset = vi.fn();
    render(<AppError error={Object.assign(new Error("secret stack detail"), {})} reset={reset} />);
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load this page");
    expect(document.body.textContent).not.toContain("secret stack detail");
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // The executed defect: Retry wired to `reset` alone does nothing in Next
  // 14.2 — `reset` only clears the boundary's error state and re-renders the
  // SAME cached Server Component payload, so the same failure returns
  // immediately. Retry must also call router.refresh() to re-fetch fresh data.
  it("re-fetches the page's data on retry, not just clears the boundary", async () => {
    const reset = vi.fn();
    render(<AppError error={Object.assign(new Error("boom"), {})} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
