// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClientForm, { emptyClientForm } from "./ClientForm";

/**
 * What a contractor actually experiences typing into the client form.
 *
 * Two of these test defects the owner found by clicking, and neither was
 * reachable from a unit test:
 *
 * - **The TRN did not group.** `formatTrn` was correct and unit-tested; the
 *   input simply did not call it, so nine digits stayed nine digits unless the
 *   contractor typed the dashes themselves. The classic shape here — a correct
 *   helper no screen calls.
 * - **`town` was accepted and never saved.** That one was in the API, but the
 *   payload assertion below is where the web half is pinned.
 */

function renderForm(overrides: Partial<typeof emptyClientForm> = {}) {
  const onSubmit = vi.fn();
  render(
    <ClientForm
      initial={{ ...emptyClientForm, ...overrides }}
      onCancel={() => {}}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

describe("ClientForm — the TRN field", () => {
  it("groups digits as they are typed, without the contractor typing dashes", async () => {
    const { user } = renderForm();
    const trn = screen.getByLabelText(/TRN/i);

    await user.type(trn, "102458963");

    // 102-458-963, not 102458963. A nine-digit run is materially harder to
    // check against a paper document, which is why this matters at all.
    expect(trn).toHaveValue("102-458-963");
  });

  it("adds each dash as the field fills, rather than all at once at the end", async () => {
    const { user } = renderForm();
    const trn = screen.getByLabelText(/TRN/i);

    await user.type(trn, "1024");
    expect(trn).toHaveValue("102-4");
  });

  it("does not fight a contractor who types the dashes themselves", async () => {
    const { user } = renderForm();
    const trn = screen.getByLabelText(/TRN/i);

    await user.type(trn, "102-458-963");
    expect(trn).toHaveValue("102-458-963");
  });

  it("stops at nine digits, because a tenth is always a typo", async () => {
    const { user } = renderForm();
    const trn = screen.getByLabelText(/TRN/i);

    await user.type(trn, "1024589631234");
    expect(trn).toHaveValue("102-458-963");
  });

  it("can be cleared back to empty, leaving no stray dash", async () => {
    const { user } = renderForm({ trn: "102-458-963" });
    const trn = screen.getByLabelText(/TRN/i);

    await user.clear(trn);
    // A lone "-" left in the box would be impossible for a contractor to
    // remove, since every keystroke would re-add it.
    expect(trn).toHaveValue("");
  });

  it("shows an existing TRN already grouped when editing", () => {
    renderForm({ trn: "102-458-963" });
    expect(screen.getByLabelText(/TRN/i)).toHaveValue("102-458-963");
  });
});

describe("ClientForm — what reaches the API", () => {
  it("sends the town, which was silently discarded for months", async () => {
    const { onSubmit, user } = renderForm();

    await user.type(screen.getByLabelText(/first name/i), "Marcia");
    await user.type(screen.getByLabelText(/town/i), "Ocho Rios");
    await user.click(screen.getByRole("button", { name: /save client/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ town: "Ocho Rios" }));
  });

  it("refuses to submit without a first name, and says so", async () => {
    const { onSubmit, user } = renderForm();

    await user.click(screen.getByRole("button", { name: /save client/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    // The message matters as much as the refusal: a form that simply does
    // nothing on click reads as broken.
    expect(screen.getByText(/first name is required/i)).toBeInTheDocument();
  });

  it("does not treat a whitespace-only name as a name", async () => {
    const { onSubmit, user } = renderForm();

    await user.type(screen.getByLabelText(/first name/i), "   ");
    await user.click(screen.getByRole("button", { name: /save client/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
