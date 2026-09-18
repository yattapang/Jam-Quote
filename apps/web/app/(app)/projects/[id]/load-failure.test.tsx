// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApiError } from "@/lib/api-client";

/**
 * The project page's Quotes card is secondary to the job itself: a failed
 * quotes request must not take the job page down, but must say it couldn't
 * load rather than "No quotes for this project yet" and a $0 "Total quoted".
 */

const api = vi.hoisted(() => ({
  getProject: vi.fn(),
  getClients: vi.fn(),
  getQuotes: vi.fn(),
  getPurchases: vi.fn(),
  getPurchaseCategories: vi.fn(),
  getLabourEntries: vi.fn(),
  getLabourRates: vi.fn(),
  getProjectProfit: vi.fn(),
}));
vi.mock("@/lib/api-server", () => api);
vi.mock("./EditProjectButton", () => ({ default: () => null }));
vi.mock("./ProjectCosts", () => ({ default: () => null }));
vi.mock("@/components/ui/DeleteRowButton", () => ({ default: () => null }));

import JobDetailPage from "./page";

beforeEach(() => {
  api.getProject.mockResolvedValue({
    id: "p1",
    name: "Roof job",
    clientName: "Marcia Brown",
    stage: "IN_PROGRESS",
    progressPct: 10,
    addressLine: "",
    town: "",
    parish: "",
  });
  api.getClients.mockResolvedValue([]);
  api.getPurchases.mockResolvedValue([]);
  api.getLabourEntries.mockResolvedValue([]);
  api.getLabourRates.mockResolvedValue([]);
  api.getProjectProfit.mockResolvedValue(null);
  api.getPurchaseCategories.mockResolvedValue([]);
});

describe("project detail: quotes card", () => {
  it("shows 'couldn't load' instead of 'No quotes for this project yet'", async () => {
    api.getQuotes.mockRejectedValue(new ApiError("500", 500));
    render(await JobDetailPage({ params: { id: "p1" } }));
    expect(screen.getByRole("heading", { name: "Roof job" })).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load this job's quotes/i)).toBeInTheDocument();
    expect(screen.queryByText(/No quotes for this project yet/i)).not.toBeInTheDocument();
  });

  it("the job's costs (primary data) failing still throws to the error boundary", async () => {
    api.getQuotes.mockResolvedValue([]);
    api.getPurchases.mockRejectedValue(new ApiError("500", 500));
    await expect(JobDetailPage({ params: { id: "p1" } })).rejects.toThrow("500");
  });
});
