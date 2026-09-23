// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminConsole from "./AdminConsole";
import type { AdminData, AdminTenant } from "@/lib/api-client";

// Rendering the whole admin console and driving it with userEvent is slow under the
// full parallel suite: at vitest's 5s default this file timed out intermittently,
// which is a harness limit, not a behaviour change. Other heavy render/dynamic-import
// suites in this repo carry the same allowance.
vi.setConfig({ testTimeout: 30_000 });

/**
 * Suspend fired on one click, and the plan `<select>` used to save on every
 * `change` event (choosing "Free" downgrades a paying tenant immediately) —
 * neither confirmed, unlike void-payment and delete-regulatory-entry which
 * both use `window.confirm`. Worse, a `change` event fires once per
 * arrow-key step while a `<select>` is focused, so browsing the options with
 * the keyboard alone used to pop a confirm dialog per step.
 *
 * The plan select now only STAGES a choice; an explicit "Apply" button next
 * to it fires the single confirmed request. This renders the real tenants
 * table and drives it with `userEvent`, asserting: cancelling the browser
 * confirm (from Apply) fires no API call and reverts the displayed value;
 * confirming fires it; and a keyboard-driven change with no Apply click
 * fires neither the confirm dialog nor the request.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/impersonation-actions", () => ({ startImpersonation: vi.fn() }));

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    setTenantPlan: vi.fn().mockResolvedValue({}),
    suspendTenant: vi.fn().mockResolvedValue({}),
    restoreTenant: vi.fn().mockResolvedValue({}),
  };
});

function tenant(overrides: Partial<AdminTenant> = {}): AdminTenant {
  return {
    id: "biz-1",
    name: "Blackwood Construction",
    parish: "Kingston",
    plan: "pro",
    interval: "monthly",
    priceCents: 250_000,
    renewsAt: "2027-01-01T00:00:00.000Z",
    trn: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastActiveAt: null,
    quoteCount: 0,
    suspended: false,
    ...overrides,
  };
}

function data(tenants: AdminTenant[]): AdminData {
  return {
    overview: null,
    tenants,
    regulatory: [],
    financials: null,
    audit: [],
    me: {
      userId: "u1",
      email: "staff@example.com",
      isSuperAdmin: true,
      capabilities: ["MANAGE_TENANTS"],
    } as AdminData["me"],
    admins: [],
    rulepack: null,
    failed: [],
  } as unknown as AdminData;
}

function renderConsole(tenants: AdminTenant[]) {
  return render(
    <AdminConsole
      data={data(tenants)}
      admin={{ name: "Staff", email: "staff@example.com" }}
      apiEnv={{ label: "LOCAL", tone: "muted", detail: "localhost:3001" }}
    />,
  );
}

async function goToTenants() {
  await userEvent.click(await screen.findByRole("button", { name: /tenants/i }));
}

describe("suspend confirmation", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("cancelling the confirm fires no request", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { suspendTenant } = await import("@/lib/api-client");
    renderConsole([tenant()]);
    await goToTenants();

    await userEvent.click(await screen.findByRole("button", { name: /suspend/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(suspendTenant).not.toHaveBeenCalled();
    // Still showing "Suspend" — the row was not optimistically flipped.
    expect(screen.getByRole("button", { name: /suspend/i })).toBeInTheDocument();
  });

  it("confirming fires the suspend request", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { suspendTenant } = await import("@/lib/api-client");
    renderConsole([tenant()]);
    await goToTenants();

    await userEvent.click(await screen.findByRole("button", { name: /suspend/i }));

    expect(suspendTenant).toHaveBeenCalledWith("biz-1");
  });

  it("restoring a suspended tenant needs no confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { restoreTenant } = await import("@/lib/api-client");
    renderConsole([tenant({ suspended: true })]);
    await goToTenants();

    await userEvent.click(await screen.findByRole("button", { name: /restore/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(restoreTenant).toHaveBeenCalledWith("biz-1");
  });
});

describe("plan-change confirmation", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("changing the select alone (no Apply click) stages the choice but fires no confirm and no request — this is what a keyboard step through the options also does", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const { setTenantPlan } = await import("@/lib/api-client");
    renderConsole([tenant({ plan: "pro", interval: "monthly" })]);
    await goToTenants();

    const select = (await screen.findByLabelText(/Plan for Blackwood Construction/i)) as HTMLSelectElement;
    expect(select.value).toBe("pro-monthly");

    // userEvent.selectOptions dispatches the same `change` event a keyboard
    // arrow-step through the options produces — exactly the case that used
    // to fire one window.confirm per step.
    await userEvent.selectOptions(select, "free");

    expect(select.value).toBe("free");
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(setTenantPlan).not.toHaveBeenCalled();
  });

  it("cancelling the Apply confirmation reverts the select's displayed value and fires no request", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { setTenantPlan } = await import("@/lib/api-client");
    renderConsole([tenant({ plan: "pro", interval: "monthly" })]);
    await goToTenants();

    const select = (await screen.findByLabelText(/Plan for Blackwood Construction/i)) as HTMLSelectElement;
    await userEvent.selectOptions(select, "free");
    await userEvent.click(await screen.findByRole("button", { name: /^apply$/i }));

    expect(window.confirm).toHaveBeenCalled();
    expect(setTenantPlan).not.toHaveBeenCalled();
    expect(select.value).toBe("pro-monthly");
  });

  it("confirming the Apply click fires the plan-change request exactly once", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { setTenantPlan } = await import("@/lib/api-client");
    renderConsole([tenant({ plan: "pro", interval: "monthly" })]);
    await goToTenants();

    const select = (await screen.findByLabelText(/Plan for Blackwood Construction/i)) as HTMLSelectElement;
    await userEvent.selectOptions(select, "free");
    await userEvent.click(await screen.findByRole("button", { name: /^apply$/i }));

    expect(setTenantPlan).toHaveBeenCalledTimes(1);
    expect(setTenantPlan).toHaveBeenCalledWith("biz-1", { plan: "free", interval: "monthly" });
  });

  it("no Apply button is shown while the staged choice matches the committed plan", async () => {
    renderConsole([tenant({ plan: "pro", interval: "monthly" })]);
    await goToTenants();
    await screen.findByLabelText(/Plan for Blackwood Construction/i);

    expect(screen.queryByRole("button", { name: /^apply$/i })).not.toBeInTheDocument();
  });
});
