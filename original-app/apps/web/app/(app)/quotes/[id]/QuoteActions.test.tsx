// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QuoteStatus } from "@jamquote/core";
import buttonStyles from "@/components/ui/Button.module.css";

/**
 * Screen-hierarchy suite for the quote header actions (2026-09-18 owner
 * decision, PLANNING.md "Quote screen actions"): exactly ONE primary action
 * per QuoteStatus, everything else secondary/ghost, and Delete never counted
 * among the primary group.
 *
 * A test only asserting a button is "defined" proves almost nothing (see
 * .claude/agents/README.md's guard doctrine) — these assert the actual
 * `Button.module.css` variant class rendered, which is what a contractor's
 * eye reads as "the important one".
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/api-client", () => ({
  createInvoiceFromQuote: vi.fn(),
  reviseQuote: vi.fn(),
  setQuoteStatus: vi.fn(),
  shareQuote: vi.fn(),
  deleteClient: vi.fn(),
  deleteProject: vi.fn(),
  deleteQuote: vi.fn(),
  deleteMaterialFavourite: vi.fn(),
  deleteLabourRate: vi.fn(),
  deleteEquipmentItem: vi.fn(),
  deleteJob: vi.fn(),
  deleteInvoice: vi.fn(),
  ApiError: class ApiError extends Error {},
}));

import { createInvoiceFromQuote } from "@/lib/api-client";
import QuoteActions from "./QuoteActions";

function renderFor(status: QuoteStatus) {
  render(
    <QuoteActions
      id="q1"
      status={status}
      quoteNum="Q-001"
      clientName="Marcia"
      clientPhone="8761234567"
      clientEmail="marcia@example.com"
      totalCents={100000}
    />,
  );
}

/** All the controls a contractor could press to move the quote forward or
 * back, EXCLUDING the delete control (asserted separately). Edit is a Link
 * styled like a Button (an <a>, role "link"), so both roles are scanned —
 * a primary-styled link is exactly as much a second "primary" as a button. */
function actionButtons() {
  return [...screen.getAllByRole("button"), ...screen.queryAllByRole("link")].filter(
    (b) => !/^delete$/i.test(b.textContent ?? ""),
  );
}

const PRIMARY_CLASS = buttonStyles.primary ?? "primary";
const SECONDARY_CLASS = buttonStyles.secondary ?? "secondary";
const BASE_CLASS = buttonStyles.base ?? "base";

function primaryButtons() {
  return actionButtons().filter((b) => b.className.includes(PRIMARY_CLASS));
}

const EXPECTED_PRIMARY: Record<QuoteStatus, RegExp | null> = {
  [QuoteStatus.DRAFT]: /^send$/i,
  [QuoteStatus.SENT]: /mark accepted/i,
  [QuoteStatus.VIEWED]: /mark accepted/i,
  [QuoteStatus.ACCEPTED]: /convert to invoice/i,
  [QuoteStatus.DECLINED]: null,
  [QuoteStatus.EXPIRED]: null,
  [QuoteStatus.INVOICED]: null,
};

describe("QuoteActions — one primary action per status", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  for (const status of Object.values(QuoteStatus)) {
    const expected = EXPECTED_PRIMARY[status];

    it(`${status}: ${expected ? `primary is "${expected}"` : "no primary action"}`, () => {
      renderFor(status);
      const primaries = primaryButtons();

      if (expected === null) {
        expect(primaries).toHaveLength(0);
        return;
      }

      expect(primaries).toHaveLength(1);
      expect(primaries[0]?.textContent ?? "").toMatch(expected);
    });
  }

  it("never renders more than one primary button, for any status", () => {
    for (const status of Object.values(QuoteStatus)) {
      renderFor(status);
      expect(primaryButtons().length).toBeLessThanOrEqual(1);
      cleanup();
    }
  });
});

describe("QuoteActions — Delete is set apart from the primary/secondary group", () => {
  it("is not styled as a Button (primary/secondary/ghost) at all — it's DeleteRowButton's own trigger", () => {
    renderFor(QuoteStatus.DRAFT);
    const del = screen.getByRole("button", { name: /^delete$/i });
    expect(del.className).not.toContain(BASE_CLASS);
    expect(del.className).not.toContain(PRIMARY_CLASS);
    expect(del.className).not.toContain(SECONDARY_CLASS);
  });

  it("only appears for DRAFT quotes (the API rejects deleting any other status)", () => {
    renderFor(QuoteStatus.SENT);
    expect(screen.queryByRole("button", { name: /^delete$/i })).not.toBeInTheDocument();
  });
});

describe("QuoteActions — Convert to invoice stays disabled through navigation (item 4)", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it("a further click after a successful convert sends no second createInvoiceFromQuote call", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    vi.mocked(createInvoiceFromQuote).mockResolvedValue({ id: "inv-new" } as never);
    renderFor(QuoteStatus.ACCEPTED);
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: /convert to invoice/i });

    await user.click(button);
    // The convert has resolved (createInvoiceFromQuote's promise settled and
    // router.push was called), but this component has not unmounted — a real
    // app would still be mid-navigation here. Before the fix, useSingleFlight's
    // `pending` had already flipped back to false at this point, re-enabling
    // the button.
    expect(button).toBeDisabled();

    await user.click(button);
    expect(createInvoiceFromQuote).toHaveBeenCalledTimes(1);
  });
});

describe("QuoteActions — Send chooser (DRAFT)", () => {
  it("offers WhatsApp, Email, and Mark as sent", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    renderFor(QuoteStatus.DRAFT);
    await userEvent.click(screen.getByRole("button", { name: /^send$/i }));
    const dialog = screen.getByRole("dialog");
    expect(screen.getByRole("button", { name: /^whatsapp$/i })).toBeInTheDocument();
    expect(
      Array.from(dialog.querySelectorAll("button")).some((b) => /^email$/i.test(b.textContent ?? "")),
    ).toBe(true);
    expect(screen.getByRole("button", { name: /mark as sent \(/i })).toBeInTheDocument();
  });
});
