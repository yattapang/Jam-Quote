// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminConsole from "./AdminConsole";
import { ApiError, type AdminData, type AdminReg } from "@/lib/api-client";

vi.setConfig({ testTimeout: 30_000 });

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/impersonation-actions", () => ({ startImpersonation: vi.fn() }));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    updateRegulatory: vi.fn(),
  };
});

function reg(overrides: Partial<AdminReg> = {}): AdminReg {
  return {
    id: "r1",
    title: "GCT rate change",
    category: "GCT",
    summary: "The standard rate moves.",
    effectiveDate: null,
    sourceUrl: null,
    actionNeeded: null,
    publishedAt: "2026-01-01T00:00:00.000Z",
    reviewedAt: null,
    reviewedByUserId: null,
    ...overrides,
  };
}

function data(regulatory: AdminReg[]): AdminData {
  return {
    overview: null,
    tenants: [],
    regulatory,
    financials: null,
    audit: [],
    me: {
      userId: "u1",
      email: "staff@example.com",
      isSuperAdmin: true,
      capabilities: ["MANAGE_RULEPACK"],
    } as AdminData["me"],
    admins: [],
    rulepack: null,
    failed: [],
  } as unknown as AdminData;
}

function renderConsole(regulatory: AdminReg[]) {
  return render(
    <AdminConsole
      data={data(regulatory)}
      admin={{ name: "Staff", email: "staff@example.com" }}
      apiEnv={{ label: "LOCAL", tone: "muted", detail: "localhost:3001" }}
    />,
  );
}

/**
 * `regError` in AdminConsole.tsx was only cleared when a save STARTED
 * (`runReg`), not on Cancel and not when opening an editor for a different
 * entry. Repro: fail a save on entry 1 -> Cancel -> open the editor on
 * entry 2 -> the stale error from entry 1's failed save was still shown.
 */
describe("regulatory editor error clears on cancel / re-open", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("does not carry a failed save's error into a later edit of a different entry", async () => {
    const { updateRegulatory } = await import("@/lib/api-client");
    (updateRegulatory as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new ApiError("Server rejected the update", 400),
    );

    const user = userEvent.setup();
    renderConsole([reg({ id: "r1", title: "Entry one" }), reg({ id: "r2", title: "Entry two" })]);

    await user.click(await screen.findByRole("button", { name: /regulatory queue/i }));

    // Edit entry one and fail the save.
    const editButtons = await screen.findAllByRole("button", { name: /^edit$/i });
    await user.click(editButtons[0]!);
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText(/server rejected the update/i)).toBeInTheDocument();

    // Cancel out of the failed edit.
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/server rejected the update/i)).not.toBeInTheDocument();

    // Open the editor on the OTHER entry — the stale error must not reappear.
    const editButtonsAgain = await screen.findAllByRole("button", { name: /^edit$/i });
    await user.click(editButtonsAgain[1]!);

    expect(screen.queryByText(/server rejected the update/i)).not.toBeInTheDocument();
  });
});
