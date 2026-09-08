// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The delete affordance, and the message it gives when the API says no.
 *
 * The owner met this trying to delete a quote: the API had answered *"Only DRAFT
 * quotes can be deleted"* — a deliberate business rule — and the app replied
 * *"Couldn't delete — is the API running?"*, sending them to check a server that
 * had answered them perfectly well.
 *
 * The cause was a bare `catch {}` that discarded the error. Eleven screens share
 * this component, so the same wrong answer was waiting on every one of them.
 *
 * **Reporting the wrong cause is worse than reporting none.** A generic failure
 * makes someone retry; a confidently wrong one makes them debug the wrong thing.
 */

const deleteQuote = vi.fn();
const refresh = vi.fn();
const push = vi.fn();

/**
 * Declared through `vi.hoisted` because `vi.mock` factories are lifted to the
 * top of the file. A plain class declaration below them is not initialised when
 * the factory runs, which fails as "Cannot access FakeApiError before
 * initialization" — a message that reads like a bug in the component.
 */
const { FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    status: number;
    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
  return { FakeApiError };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: FakeApiError,
  deleteQuote: (...a: unknown[]) => deleteQuote(...a),
  deleteClient: vi.fn(),
  deleteInvoice: vi.fn(),
  deleteProject: vi.fn(),
  deleteLabourRate: vi.fn(),
  deleteEquipmentItem: vi.fn(),
  deleteMaterialFavourite: vi.fn(),
  deleteJob: vi.fn(),
}));

import DeleteRowButton from "./DeleteRowButton";

beforeEach(() => {
  deleteQuote.mockReset().mockResolvedValue(undefined);
  refresh.mockReset();
  push.mockReset();
});

function renderDelete(props: Partial<Parameters<typeof DeleteRowButton>[0]> = {}) {
  render(
    <DeleteRowButton kind="quote" id="q1" confirmMessage="Delete this quote?" {...props} />,
  );
  return userEvent.setup();
}

/**
 * The row trigger and the modal's confirm button are BOTH labelled "Delete", so
 * a name query matches two elements once the modal is open. The confirm is the
 * later one in the document.
 *
 * Worth noting rather than working around silently: two controls with the same
 * accessible name, one of which is destructive, is a real if minor
 * accessibility smell. Left as-is because renaming the confirm is a product
 * decision, not a test's to make.
 */
async function confirmDelete(user: ReturnType<typeof userEvent.setup>) {
  const buttons = screen.getAllByRole("button", { name: /^delete$/i });
  await user.click(buttons[buttons.length - 1]!);
}

describe("DeleteRowButton — confirming first", () => {
  it("does not delete on the first click", async () => {
    const user = renderDelete();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    // An outward, irreversible action always confirms.
    expect(deleteQuote).not.toHaveBeenCalled();
  });

  it("deletes once confirmed, and refreshes the list", async () => {
    const user = renderDelete();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await confirmDelete(user);

    expect(deleteQuote).toHaveBeenCalledWith("q1");
    expect(refresh).toHaveBeenCalled();
  });

  it("navigates away instead of refreshing when told to", async () => {
    // From a detail page, refreshing would leave the contractor on a record
    // that no longer exists.
    const user = renderDelete({ redirectTo: "/quotes" });
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await confirmDelete(user);

    expect(push).toHaveBeenCalledWith("/quotes");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing on cancel", async () => {
    const user = renderDelete();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(deleteQuote).not.toHaveBeenCalled();
  });
});

describe("DeleteRowButton — what it says when the API refuses", () => {
  it("shows the API's OWN reason", async () => {
    // The defect, as a test. This is the exact message the owner should have
    // seen and did not.
    deleteQuote.mockRejectedValue(new FakeApiError("Only DRAFT quotes can be deleted"));
    const user = renderDelete();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await confirmDelete(user);

    expect(await screen.findByText(/only draft quotes can be deleted/i)).toBeInTheDocument();
  });

  it("does NOT blame the API when the API answered", async () => {
    deleteQuote.mockRejectedValue(new FakeApiError("Only DRAFT quotes can be deleted"));
    const user = renderDelete();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await confirmDelete(user);

    await screen.findByText(/only draft quotes/i);
    expect(screen.queryByText(/is the api running/i)).not.toBeInTheDocument();
  });

  it("DOES blame the network when the fetch never completed", async () => {
    // Here the fallback is accurate, and saying so is useful. A TypeError from
    // fetch means no response arrived at all.
    deleteQuote.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = renderDelete();
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await confirmDelete(user);

    expect(await screen.findByText(/is the api running/i)).toBeInTheDocument();
  });

  it("leaves the row in place when the delete failed", async () => {
    // Neither navigating nor refreshing: a failed delete must not look like a
    // successful one.
    deleteQuote.mockRejectedValue(new FakeApiError("Only DRAFT quotes can be deleted"));
    const user = renderDelete({ redirectTo: "/quotes" });
    await user.click(screen.getByRole("button", { name: /delete/i }));
    await confirmDelete(user);

    await screen.findByText(/only draft quotes/i);
    expect(push).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
