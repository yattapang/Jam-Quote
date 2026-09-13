// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * "Valid for (days)" used to turn a typed `0` into 30 via
 * `Number(validDays) || DEFAULT_VALID_DAYS`, and a negative value like `-5`
 * saved a `validUntil` already in the past — silently, with no error and no
 * indication the typed value was ignored. This renders the real builder
 * (mocked API + a stubbed LineItemsEditor, same as QuoteBuilder.draft.test.tsx)
 * and asserts the save is refused for both, keeping the typed value on screen.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {},
  createQuote: vi.fn().mockResolvedValue({ id: "q_new" }),
  updateQuote: vi.fn().mockResolvedValue({ id: "q_new" }),
  createClient: vi.fn(),
  createProject: vi.fn(),
  createMaterialUnit: vi.fn(),
  createTrade: vi.fn(),
  invalidateMaterialSchema: vi.fn(),
}));

vi.mock("../../LineItemsEditor", () => ({
  default: () => <div data-testid="line-editor" />,
}));

import QuoteBuilder from "./QuoteBuilder";
import { createQuote } from "@/lib/api-client";

function renderBuilder() {
  render(
    <QuoteBuilder
      clients={[{ id: "cl_1", name: "Marcia Brown" }]}
      projects={[]}
      initial={{
        discountPct: 0,
        depositCents: 0,
        lines: [
          {
            key: "l1",
            kind: "MATERIAL" as never,
            description: "Cement",
            quantity: "2",
            unitPriceDollars: "10",
            gctTreatment: "STANDARD" as never,
            heading: { kind: "default" } as never,
            rateUnit: "UNIT" as never,
          } as never,
        ],
      }}
    />,
  );
  return userEvent.setup();
}

beforeEach(() => {
  window.localStorage.clear();
  push.mockReset();
  vi.mocked(createQuote).mockClear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("Valid for (days) — refuses a bad save rather than coercing it", () => {
  it("refuses 0 and keeps the typed value", async () => {
    const user = renderBuilder();
    const field = screen.getByLabelText(/valid for/i);
    await user.clear(field);
    await user.type(field, "0");
    await user.click(screen.getByRole("button", { name: /create quote/i }));

    expect(await screen.findByText("Valid for (days) must be at least 1.")).toBeInTheDocument();
    expect(field).toHaveValue(0);
    expect(createQuote).not.toHaveBeenCalled();
  });

  it("refuses a negative value", async () => {
    const user = renderBuilder();
    const field = screen.getByLabelText(/valid for/i);
    await user.clear(field);
    await user.type(field, "-5");
    await user.click(screen.getByRole("button", { name: /create quote/i }));

    expect(await screen.findByText("Valid for (days) must be at least 1.")).toBeInTheDocument();
    expect(createQuote).not.toHaveBeenCalled();
  });

  it("saves normally for a valid whole number", async () => {
    const user = renderBuilder();
    const field = screen.getByLabelText(/valid for/i);
    await user.clear(field);
    await user.type(field, "14");
    await user.click(screen.getByRole("button", { name: /create quote/i }));

    expect(createQuote).toHaveBeenCalledTimes(1);
  });
});
