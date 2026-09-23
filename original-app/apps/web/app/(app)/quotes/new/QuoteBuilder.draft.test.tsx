// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { draftKey, saveDraft } from "@/lib/quote-draft-recovery";

/**
 * The unsaved-quote banner — the wiring, not the storage.
 *
 * `quote-draft-recovery.test.ts` already covers the storage rules as pure
 * functions. What those tests cannot see is whether the SCREEN honours them, and
 * that is where the defect was: the autosave was blocked until the restore offer
 * was answered, so a contractor who mentally dismissed the banner and carried on
 * typing was unprotected — able to lose a second quote to exactly the problem the
 * banner exists to solve.
 *
 * ## Why `LineItemsEditor` is stubbed
 *
 * It is the largest component in the app and pulls in the whole catalogue
 * picker. None of that is under test here, and rendering it would mean the
 * suite failing for reasons that have nothing to do with draft recovery. The
 * lines themselves are covered by their own suite; this one owns the banner.
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

// The line editor is not what this file tests - see the note above.
vi.mock("../../LineItemsEditor", () => ({
  default: () => <div data-testid="line-editor" />,
}));

import QuoteBuilder from "./QuoteBuilder";

function renderBuilder() {
  render(<QuoteBuilder clients={[{ id: "cl_1", name: "Marcia Brown" }]} projects={[]} />);
  return userEvent.setup();
}

const KEY = draftKey("new");

beforeEach(() => {
  window.localStorage.clear();
  push.mockReset();
});

afterEach(() => {
  window.localStorage.clear();
});

describe("the restore banner — when it appears", () => {
  it("does NOT appear on a form nobody has touched", () => {
    // The autosave fires on mount, so without a worth-restoring check an empty
    // draft would prompt on every visit and train the contractor to dismiss the
    // banner unread. Then the one time it matters, they dismiss that too.
    renderBuilder();
    expect(screen.queryByText(/unsaved quote/i)).not.toBeInTheDocument();
  });

  it("does not appear for a stored draft that is itself empty", () => {
    saveDraft(KEY, {
      clientId: "",
      projectId: "",
      discountPct: "0",
      depositInput: "0",
      validDays: "14",
      detailLevel: "SUMMARY",
      lines: [],
    });
    renderBuilder();
    expect(screen.queryByText(/unsaved quote/i)).not.toBeInTheDocument();
  });

  it("APPEARS when there is real work to recover", () => {
    saveDraft(KEY, {
      clientId: "cl_1",
      projectId: "",
      discountPct: "0",
      depositInput: "0",
      validDays: "14",
      detailLevel: "SUMMARY",
      lines: [],
    });
    renderBuilder();
    expect(screen.getByText(/unsaved quote/i)).toBeInTheDocument();
  });

  it("says how long ago, so it reads as THEIR quote from just now", () => {
    saveDraft(KEY, {
      clientId: "cl_1",
      projectId: "",
      discountPct: "0",
      depositInput: "0",
      validDays: "14",
      detailLevel: "SUMMARY",
      lines: [],
    });
    renderBuilder();
    expect(screen.getByText(/just now/i)).toBeInTheDocument();
  });
});

describe("the restore banner — answering it", () => {
  const draft = {
    clientId: "cl_1",
    projectId: "",
    discountPct: "7",
    depositInput: "0",
    validDays: "30",
    detailLevel: "SUMMARY",
    lines: [],
  };

  it("puts the work back when Restore is pressed", async () => {
    saveDraft(KEY, draft);
    const user = renderBuilder();

    await user.click(screen.getByRole("button", { name: /restore it/i }));

    // The banner goes, and a value from the draft is now in the form.
    expect(screen.queryByText(/unsaved quote/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/discount/i)).toHaveValue(7);
  });

  it("clears the draft on Start fresh, so it cannot be offered again", async () => {
    saveDraft(KEY, draft);
    const user = renderBuilder();

    await user.click(screen.getByRole("button", { name: /start fresh/i }));

    expect(screen.queryByText(/unsaved quote/i)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});

describe("the banner cannot switch autosave off", () => {
  it("starts saving as soon as the contractor types, banner or no banner", async () => {
    // THE defect. Autosave was gated on the offer being answered, so ignoring
    // the banner and carrying on left the new work unprotected - losing a
    // second quote to the very problem the banner exists to solve. Typing
    // instead of answering IS the answer.
    saveDraft(KEY, {
      clientId: "cl_1",
      projectId: "",
      discountPct: "0",
      depositInput: "0",
      validDays: "14",
      detailLevel: "SUMMARY",
      lines: [],
    });
    const user = renderBuilder();
    expect(screen.getByText(/unsaved quote/i)).toBeInTheDocument();

    // Ignore the banner entirely and edit the form.
    await user.clear(screen.getByLabelText(/discount/i));
    await user.type(screen.getByLabelText(/discount/i), "12");

    // The banner has stood down, and what is stored is the NEW work.
    expect(screen.queryByText(/unsaved quote/i)).not.toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    expect(stored.values.discountPct).toBe("12");
  });
});
