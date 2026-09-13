// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminConsole from "./AdminConsole";
import type { AdminData, AdminTenant } from "@/lib/api-client";

/**
 * Suspend fired on one click, and the plan `<select>` saved on every change
 * (choosing "Free" downgrades a paying tenant immediately) — neither
 * confirmed, unlike void-payment and delete-regulatory-entry which both use
 * `window.confirm`. This renders the real tenants table and drives it with
 * `userEvent`, asserting: cancelling the browser confirm fires no API call
 * and (for the select) leaves the displayed value unchanged; confirming
 * fires it.
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

  it("cancelling restores the select's displayed value and fires no request", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { setTenantPlan } = await import("@/lib/api-client");
    renderConsole([tenant({ plan: "pro", interval: "monthly" })]);
    await goToTenants();

    const select = (await screen.findByLabelText(/Plan for Blackwood Construction/i)) as HTMLSelectElement;
    expect(select.value).toBe("pro-monthly");

    await userEvent.selectOptions(select, "free");

    expect(window.confirm).toHaveBeenCalled();
    expect(setTenantPlan).not.toHaveBeenCalled();
    expect(select.value).toBe("pro-monthly");
  });

  it("confirming fires the plan-change request", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { setTenantPlan } = await import("@/lib/api-client");
    renderConsole([tenant({ plan: "pro", interval: "monthly" })]);
    await goToTenants();

    const select = (await screen.findByLabelText(/Plan for Blackwood Construction/i)) as HTMLSelectElement;
    await userEvent.selectOptions(select, "free");

    expect(setTenantPlan).toHaveBeenCalledWith("biz-1", { plan: "free", interval: "monthly" });
  });
});
