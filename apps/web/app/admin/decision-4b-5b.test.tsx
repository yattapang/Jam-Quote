// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminConsole from "./AdminConsole";
import type { AdminData, AdminUser } from "@/lib/api-client";

// Rendering the whole admin console is slow under the full parallel suite —
// see tenant-destructive-confirm.test.tsx for the same allowance.
vi.setConfig({ testTimeout: 30_000 });

/**
 * Decision 4b: the admin console must visibly flag a "dual-role" admin — one
 * who still has a businessId set alongside their ADMIN role (a legacy row
 * from before promoteAdmin started clearing it, or something that slipped
 * past the refusal). Decision 5b: IMPERSONATE_TENANTS is a real, distinct
 * capability the console's capability editor must show and let a
 * super-admin grant, separate from MANAGE_TENANTS.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/auth-actions", () => ({ logout: vi.fn() }));
vi.mock("@/lib/impersonation-actions", () => ({ startImpersonation: vi.fn() }));

function adminUser(overrides: Partial<AdminUser> = {}): AdminUser {
  return {
    id: "admin-1",
    email: "admin@example.com",
    fullName: "Sam Admin",
    isSuperAdmin: false,
    capabilities: ["MANAGE_TENANTS"],
    businessId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function data(admins: AdminUser[]): AdminData {
  return {
    overview: null,
    tenants: [],
    regulatory: [],
    financials: null,
    audit: [],
    me: {
      userId: "u1",
      email: "staff@example.com",
      isSuperAdmin: true,
      capabilities: ["MANAGE_TENANTS", "MANAGE_ADMINS", "IMPERSONATE_TENANTS"],
    } as AdminData["me"],
    admins,
    rulepack: null,
    failed: [],
  } as unknown as AdminData;
}

function renderConsole(admins: AdminUser[]) {
  return render(
    <AdminConsole
      data={data(admins)}
      admin={{ name: "Staff", email: "staff@example.com" }}
      apiEnv={{ label: "LOCAL", tone: "muted", detail: "localhost:3001" }}
    />,
  );
}

async function goToAdmins() {
  await import("@testing-library/user-event").then(({ default: userEvent }) =>
    userEvent.click(screen.getByRole("button", { name: /admins/i })),
  );
}

describe("AdminConsole — decision 4b dual-role badge", () => {
  it("shows a dual-role warning for an admin whose businessId is still set", async () => {
    renderConsole([adminUser({ id: "admin-dual", businessId: "biz-1" })]);
    await goToAdmins();

    expect(await screen.findByText(/dual-role/i)).toBeInTheDocument();
  });

  it("shows no dual-role warning for a normal (businessId: null) admin", async () => {
    renderConsole([adminUser({ id: "admin-clean", businessId: null })]);
    await goToAdmins();

    await screen.findByText("Sam Admin");
    expect(screen.queryByText(/dual-role/i)).not.toBeInTheDocument();
  });
});

describe("AdminConsole — decision 5b IMPERSONATE_TENANTS capability editor", () => {
  it("renders IMPERSONATE_TENANTS as its own toggle in a regular admin's capability list", async () => {
    renderConsole([adminUser({ id: "admin-1", isSuperAdmin: false, capabilities: ["MANAGE_TENANTS"] })]);
    await goToAdmins();

    const matches = await screen.findAllByText(/impersonate tenants/i);
    expect(matches.length).toBeGreaterThan(0);
  });
});
