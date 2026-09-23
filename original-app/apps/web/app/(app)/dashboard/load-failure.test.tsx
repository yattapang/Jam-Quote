// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api-client";

/**
 * The dashboard's side widgets (regulatory card, client names on quote rows,
 * the business-name eyebrow) must not take the dashboard down when their
 * request fails while the API is up - but they must SAY they couldn't load,
 * not render "No regulatory updates right now" / "Unknown client".
 */

const api = vi.hoisted(() => ({
  getQuotes: vi.fn(),
  getClients: vi.fn(),
  getBusiness: vi.fn(),
  getInvoices: vi.fn(),
  getRegulatoryUpdates: vi.fn(),
}));
vi.mock("@/lib/api-server", () => api);

import DashboardPage from "./page";

const quote = {
  id: "q1",
  num: "Q-0001",
  clientId: "c1",
  projectLabel: "Roof",
  status: "SENT",
  totalCents: 1000,
  createdAt: "2026-09-01T00:00:00.000Z",
  createdLabel: "1 Sep",
};

beforeEach(() => {
  api.getQuotes.mockResolvedValue([quote]);
  api.getInvoices.mockResolvedValue([]);
  api.getClients.mockResolvedValue([{ id: "c1", name: "Marcia Brown" }]);
  api.getBusiness.mockResolvedValue({ name: "Brown Builders" });
  api.getRegulatoryUpdates.mockResolvedValue([]);
});

describe("dashboard side widgets", () => {
  it("shows 'couldn't load' for the regulatory card instead of 'No regulatory updates'", async () => {
    api.getRegulatoryUpdates.mockRejectedValue(new ApiError("500", 500));
    render(await DashboardPage());
    expect(screen.getByText(/Couldn't load regulatory updates/i)).toBeInTheDocument();
    expect(screen.queryByText(/No regulatory updates right now/i)).not.toBeInTheDocument();
    // The rest of the page still rendered.
    expect(screen.getAllByText("Q-0001").length).toBeGreaterThan(0);
  });

  it("says client names couldn't load rather than 'Unknown client'", async () => {
    api.getClients.mockRejectedValue(new ApiError("500", 500));
    render(await DashboardPage());
    expect(screen.getAllByText(/Client name couldn't load/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Unknown client/i)).not.toBeInTheDocument();
  });

  it("says the business name couldn't load", async () => {
    api.getBusiness.mockRejectedValue(new ApiError("500", 500));
    render(await DashboardPage());
    expect(screen.getByText(/Business name couldn't load/i)).toBeInTheDocument();
  });

  it("the page's primary data (quotes) failing still throws to the error boundary", async () => {
    api.getQuotes.mockRejectedValue(new ApiError("500", 500));
    await expect(DashboardPage()).rejects.toThrow("500");
  });

  it("renders normally when everything loads", async () => {
    render(await DashboardPage());
    expect(screen.getByText("Brown Builders")).toBeInTheDocument();
    expect(screen.getByText(/No regulatory updates right now/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load/i)).not.toBeInTheDocument();
  });
});
