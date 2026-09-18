// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * The client page's Quotes section is secondary to the client record: a
 * failed quotes request must not 404 or blank the client, but the section and
 * its "Total quoted" must say they couldn't load rather than "No quotes" / $0.
 */

const api = vi.hoisted(() => ({ getClient: vi.fn(), getQuotes: vi.fn() }));
vi.mock("@/lib/api-server", () => api);
vi.mock("./EditClientButton", () => ({ default: () => null }));
vi.mock("@/components/ui/DeleteRowButton", () => ({ default: () => null }));

import ClientDetailPage from "./page";

beforeEach(() => {
  api.getClient.mockResolvedValue({ id: "c1", name: "Marcia Brown", parish: "", phone: "" });
});

describe("client detail: quotes section", () => {
  it("shows 'couldn't load' instead of 'No quotes for this client yet'", async () => {
    api.getQuotes.mockRejectedValue(new Error("500"));
    render(await ClientDetailPage({ params: { id: "c1" } }));
    expect(screen.getByRole("heading", { name: "Marcia Brown" })).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load this client's quotes/i)).toBeInTheDocument();
    expect(screen.queryByText(/No quotes for this client yet/i)).not.toBeInTheDocument();
  });

  it("shows the normal empty state when quotes loaded and there are none", async () => {
    api.getQuotes.mockResolvedValue([]);
    render(await ClientDetailPage({ params: { id: "c1" } }));
    expect(screen.getByText(/No quotes for this client yet/i)).toBeInTheDocument();
  });
});
