// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MaterialForm, { emptyMaterialForm } from "./MaterialForm";

// The schema fetch is network-backed; the form degrades to a plain
// name+price form when it fails, which is all these tests need.
vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    fetchMaterialSchema: vi.fn().mockRejectedValue(new Error("no network in tests")),
  };
});

function renderForm() {
  const onSubmit = vi.fn();
  render(<MaterialForm initial={emptyMaterialForm} onCancel={() => {}} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
}

/**
 * Two real defects a contractor hit saving a material:
 *
 * - **A price with cents could not be typed.** The Price input had no `step`,
 *   so the browser (real Chrome/Firefox validation, not simulated here — a
 *   JSDOM `<input type="number">` accepts anything) needed `step="0.01"` to
 *   stop silently rejecting "12.50". Pinned here as an attribute assertion
 *   since JSDOM does not enforce HTML number-input validation itself.
 * - **A blank price saved as $0.** `Number("") || 0` in the payload builder
 *   turned "no price typed" into a real, wrong price of zero dollars.
 */
describe("MaterialForm — Price field", () => {
  it("carries step=\"0.01\" so a price with cents can be typed", () => {
    renderForm();
    expect(screen.getByLabelText(/price \$/i)).toHaveAttribute("step", "0.01");
  });

  it("refuses to submit a blank price", async () => {
    const { onSubmit, user } = renderForm();

    await user.type(screen.getByLabelText(/^name$/i), "Cement");
    await user.click(screen.getByRole("button", { name: /save material/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/price is required/i)).toBeInTheDocument();
  });

  it("keeps the blank price field as typed rather than replacing it with 0", async () => {
    const { user } = renderForm();

    await user.type(screen.getByLabelText(/^name$/i), "Cement");
    await user.click(screen.getByRole("button", { name: /save material/i }));

    expect(screen.getByLabelText(/price \$/i)).toHaveValue(null);
  });

  it("submits once a price is typed", async () => {
    const { onSubmit, user } = renderForm();

    await user.type(screen.getByLabelText(/^name$/i), "Cement");
    await user.type(screen.getByLabelText(/price \$/i), "12.50");
    await user.click(screen.getByRole("button", { name: /save material/i }));

    expect(onSubmit).toHaveBeenCalled();
  });
});
