// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/impersonation-actions", () => ({ startImpersonation: vi.fn() }));

import { RegulatoryEditor } from "./AdminConsole";

/**
 * The "Add entry" form accepted a title of only spaces and an `ftp://`
 * source URL, both of which the server refuses — createRegulatoryUpdateSchema
 * in apps/api/src/admin/admin.dto.ts requires a non-empty trimmed title and
 * isHttpUrl(sourceUrl). The refusal also used to render behind the modal
 * overlay (a separate `regError` block in the page, at a lower z-index than
 * the dialog), so it was never actually visible.
 */
function renderEditor(overrides: Partial<Parameters<typeof RegulatoryEditor>[0]> = {}) {
  const onSave = vi.fn();
  render(<RegulatoryEditor entry={null} busy={false} onCancel={() => {}} onSave={onSave} {...overrides} />);
  return { onSave, user: userEvent.setup() };
}

describe("RegulatoryEditor — client-side validation", () => {
  it("refuses a title that is only spaces", async () => {
    const { onSave, user } = renderEditor();

    await user.type(screen.getByLabelText(/title/i), "   ");
    // Summary also carries a native `required`, which would otherwise block
    // submission before this test ever reaches the title check.
    await user.type(screen.getByLabelText(/summary/i), "The rate changes.");
    await user.click(screen.getByRole("button", { name: /add entry/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/title is required/i)).toBeInTheDocument();
  });

  it("refuses an ftp:// source URL, matching the server's own wording", async () => {
    const { onSave, user } = renderEditor();

    await user.type(screen.getByLabelText(/title/i), "New GCT rate");
    await user.type(screen.getByLabelText(/summary/i), "The rate changes.");
    await user.type(screen.getByLabelText(/source url/i), "ftp://example.com/notice.pdf");
    await user.click(screen.getByRole("button", { name: /add entry/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/source url must be a full web address/i)).toBeInTheDocument();
  });

  it("accepts a real https source URL", async () => {
    const { onSave, user } = renderEditor();

    await user.type(screen.getByLabelText(/title/i), "New GCT rate");
    await user.type(screen.getByLabelText(/summary/i), "The rate changes.");
    await user.type(screen.getByLabelText(/source url/i), "https://www.jamaicatax.gov.jm/gct");
    await user.click(screen.getByRole("button", { name: /add entry/i }));

    expect(onSave).toHaveBeenCalled();
  });

  it("shows the server's own error INSIDE the dialog", () => {
    renderEditor({ error: "Something went wrong on the server" });
    expect(screen.getByText(/something went wrong on the server/i)).toBeInTheDocument();
  });
});
