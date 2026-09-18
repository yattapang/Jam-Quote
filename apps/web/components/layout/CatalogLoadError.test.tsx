// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CatalogLoadError from "./CatalogLoadError";

/**
 * Render test for the catalog route error boundaries (materials, labour,
 * equipment, jobs — see each catalog route's error.tsx). It must show a
 * clear "Couldn't load" message with a Retry action, never a raw error
 * message/stack, and Retry must call the passed reset().
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
});
