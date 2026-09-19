// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import userEvent from "@testing-library/user-event";
import type { ApiLabourEntry, ApiPurchase } from "@/lib/api-client";

/**
 * Remove (purchases and labour) had no try/catch and no busy state: a
 * rejected delete left no error on screen, and a double click could send two
 * delete requests. This renders the real component with mocked API calls and
 * asserts both behaviourally.
 *
 * The row "Remove" button now opens a ConfirmModal (the same pattern
 * DeleteRowButton uses, see apps/web/components/ui/ConfirmModal.tsx) instead
 * of `window.confirm` — so these tests open the dialog, then act on ITS
 * "Remove" button, which is the actual trigger for the API call.
 */

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

vi.mock("@/lib/api-client", () => ({
  createPurchase: vi.fn(),
  deletePurchase: vi.fn(),
  createLabourEntry: vi.fn(),
  deleteLabourEntry: vi.fn(),
}));

import ProjectCosts from "./ProjectCosts";

// Rendering and driving this form with userEvent exceeds vitest's 5s default under
// the full parallel run; it timed out intermittently. A harness limit, not behaviour.
vi.setConfig({ testTimeout: 30_000 });

function purchase(overrides: Partial<ApiPurchase> = {}): ApiPurchase {
  return {
    id: "p-1",
    description: "Cement",
    amountCents: 10_000,
    gctCents: 0,
    category: null,
    purchasedAt: "2026-08-01T12:00:00.000Z",
    reference: null,
    ...overrides,
  } as ApiPurchase;
}

function labourEntry(overrides: Partial<ApiLabourEntry> = {}): ApiLabourEntry {
  return {
    id: "l-1",
    description: "Devon",
    quantity: 1,
    rateCents: 5_000,
    unitLabel: "day",
    workedOn: "2026-08-01T12:00:00.000Z",
    ...overrides,
  } as ApiLabourEntry;
}

beforeEach(() => {
  refresh.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

/** The row trigger and the modal's confirm button are both labelled "Remove",
 * so a name query matches two once the modal is open — the confirm is the
 * later one in the document (same pattern as DeleteRowButton.test.tsx). */
function confirmButton() {
  const buttons = screen.getAllByRole("button", { name: /^remove$/i });
  return buttons[buttons.length - 1]!;
}

describe("ProjectCosts — Remove purchase", () => {
  it("shows an error when the delete is rejected", async () => {
    const { deletePurchase } = await import("@/lib/api-client");
    vi.mocked(deletePurchase).mockRejectedValueOnce(new Error("Network down"));
    const user = userEvent.setup();
    render(
      <ProjectCosts
        projectId="proj-1"
        purchases={[purchase()]}
        labour={[]}
        labourRates={[]}
        usedCategories={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(confirmButton());
    expect(await screen.findByText("Network down")).toBeInTheDocument();
  });

  it("sends only one delete when two confirm clicks land before React re-renders", async () => {
    // A real tap on a slow phone can land twice before React re-renders the
    // confirm button disabled; firing both clicks synchronously in one act()
    // reproduces that, and only the useSingleFlight ref (not the `pending`
    // state) can stop it.
    const { deletePurchase } = await import("@/lib/api-client");
    vi.mocked(deletePurchase).mockReset();
    vi.mocked(deletePurchase).mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(
      <ProjectCosts
        projectId="proj-1"
        purchases={[purchase()]}
        labour={[]}
        labourRates={[]}
        usedCategories={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));
    const button = confirmButton();
    act(() => {
      button.click();
      button.click();
    });
    expect(deletePurchase).toHaveBeenCalledTimes(1);
  });

  it("sends only one delete on a double click", async () => {
    const { deletePurchase } = await import("@/lib/api-client");
    let resolveDelete: () => void = () => {};
    vi.mocked(deletePurchase).mockImplementation(
      () => new Promise((resolve) => (resolveDelete = () => resolve())),
    );
    const user = userEvent.setup();
    render(
      <ProjectCosts
        projectId="proj-1"
        purchases={[purchase()]}
        labour={[]}
        labourRates={[]}
        usedCategories={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.dblClick(confirmButton());
    resolveDelete();

    expect(deletePurchase).toHaveBeenCalledTimes(1);
  });

  it("cancel sends nothing", async () => {
    const { deletePurchase } = await import("@/lib/api-client");
    const user = userEvent.setup();
    render(
      <ProjectCosts
        projectId="proj-1"
        purchases={[purchase({ description: "Cement" })]}
        labour={[]}
        labourRates={[]}
        usedCategories={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getAllByText(/Remove "Cement"\?/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(deletePurchase).not.toHaveBeenCalled();
  });

  it("names the item being removed in the confirm dialog", async () => {
    const user = userEvent.setup();
    render(
      <ProjectCosts
        projectId="proj-1"
        purchases={[purchase({ description: "20 bags of cement" })]}
        labour={[]}
        labourRates={[]}
        usedCategories={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getAllByText(/Remove "20 bags of cement"\?/).length).toBeGreaterThan(0);
  });
});

describe("ProjectCosts — Remove labour", () => {
  it("shows an error when the delete is rejected", async () => {
    const { deleteLabourEntry } = await import("@/lib/api-client");
    vi.mocked(deleteLabourEntry).mockRejectedValueOnce(new Error("Server error"));
    const user = userEvent.setup();
    render(
      <ProjectCosts
        projectId="proj-1"
        purchases={[]}
        labour={[labourEntry()]}
        labourRates={[]}
        usedCategories={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.click(confirmButton());
    expect(await screen.findByText("Server error")).toBeInTheDocument();
  });

  it("sends only one delete on a double click", async () => {
    const { deleteLabourEntry } = await import("@/lib/api-client");
    let resolveDelete: () => void = () => {};
    vi.mocked(deleteLabourEntry).mockImplementation(
      () => new Promise((resolve) => (resolveDelete = () => resolve())),
    );
    const user = userEvent.setup();
    render(
      <ProjectCosts
        projectId="proj-1"
        purchases={[]}
        labour={[labourEntry()]}
        labourRates={[]}
        usedCategories={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await user.dblClick(confirmButton());
    resolveDelete();

    expect(deleteLabourEntry).toHaveBeenCalledTimes(1);
  });
});

describe("ProjectCosts — Enter submits the modals", () => {
  it("logging a cost is a real form (submit button has type=submit)", async () => {
    const user = userEvent.setup();
    render(
      <ProjectCosts
        projectId="proj-1"
        purchases={[]}
        labour={[]}
        labourRates={[]}
        usedCategories={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Log a cost" }));
    const submitButton = screen.getByRole("button", { name: /log cost/i });
    expect(submitButton).toHaveAttribute("type", "submit");
  });

  it("logging time is a real form (submit button has type=submit)", async () => {
    const user = userEvent.setup();
    render(
      <ProjectCosts
        projectId="proj-1"
        purchases={[]}
        labour={[]}
        labourRates={[]}
        usedCategories={[]}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Log time" }));
    const buttons = screen.getAllByRole("button", { name: /log time/i });
    const submitButton = buttons[buttons.length - 1];
    expect(submitButton).toHaveAttribute("type", "submit");
  });
});
