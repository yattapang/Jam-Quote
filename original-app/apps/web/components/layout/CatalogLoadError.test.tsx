// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

import CatalogLoadError from "./CatalogLoadError";

afterEach(() => {
  refresh.mockClear();
});

/**
 * Render test for the catalog route error boundaries (materials, labour,
 * equipment, jobs — see each catalog route's error.tsx). It must show a
 * clear "Couldn't load" message with a Retry action, never a raw error
 * message/stack, and Retry must call the passed reset() AND re-fetch the
 * page's data via router.refresh() (see lib/use-retry.ts — reset() alone
 * re-renders the same cached, failed payload in Next 14.2).
 */
describe("CatalogLoadError", () => {
  it("renders a load-failure message (not the raw error) and a working Retry", async () => {
    const reset = vi.fn();
    render(<CatalogLoadError label="materials" reset={reset} />);

    expect(screen.getByText(/Couldn't load your materials/i)).toBeInTheDocument();
    expect(screen.queryByText(/TypeError|at Object\.|stack/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  // The executed defect: Retry wired to `reset` alone does nothing — it never
  // re-issues the failed request, so the same "couldn't load" state returns
  // immediately on the next render.
  it("re-fetches the page's data on retry, not just clears the boundary", async () => {
    const reset = vi.fn();
    render(<CatalogLoadError label="materials" reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
