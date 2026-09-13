// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ApiLabourEntry, ApiPurchase } from "@/lib/api-client";

/**
 * Remove (purchases and labour) had no try/catch and no busy state: a
 * rejected delete left no error on screen, and a double click could send two
 * delete requests. This renders the real component with mocked API calls and
 * asserts both behaviourally.
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
  window.confirm = vi.fn().mockReturnValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

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
    expect(await screen.findByText("Network down")).toBeInTheDocument();
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

    await user.dblClick(screen.getByRole("button", { name: "Remove" }));
    resolveDelete();

    expect(deletePurchase).toHaveBeenCalledTimes(1);
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

    await user.dblClick(screen.getByRole("button", { name: "Remove" }));
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
