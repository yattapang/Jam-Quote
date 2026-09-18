import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Failure handling for every non-catalog server getter (the four catalog
 * getters are covered by api-server.catalog-failure.test.ts).
 *
 * The distinction under test is the one the catalog fix drew: an API that is
 * ASLEEP (the /health probe fails too) returns empty data, which the layout's
 * DemoDataBanner explains; an API that is UP but this one request failed must
 * NOT be turned into "you have none" / "not found". Each group below pins one
 * of the rules applied per getter (see the table in lib/api-server.ts).
 */

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

const redirectSpy = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectSpy(url),
}));

import {
  getClients,
  getClient,
  getBusiness,
  getPurchases,
  getPurchaseCategories,
  getLabourEntries,
  getProjectProfit,
  getProjects,
  getProject,
  getQuotes,
  getQuote,
  getInvoices,
  getInvoice,
  getReports,
  getTrades,
  getMaterialSchema,
  getHiddenCatalog,
  getRegulatoryUpdates,
  getBillingPlans,
  getBillingStatus,
} from "./api-server";

type Reply = { status: number; body?: unknown } | "network";

/**
 * `/health` answers `health`; every other path is answered by `route(path)`.
 * A route returning "network" simulates the request itself failing to connect.
 */
function stubFetch(health: boolean, route: (path: string) => Reply) {
  const spy = vi.fn(async (url: string | URL) => {
    const s = String(url);
    if (s.endsWith("/health")) {
      if (!health) throw new Error("connect ECONNREFUSED");
      return { ok: true, status: 200, text: async () => "" } as unknown as Response;
    }
    const r = route(new URL(s).pathname);
    if (r === "network") throw new Error("connect ECONNREFUSED");
    return {
      ok: r.status < 400,
      status: r.status,
      text: async () => JSON.stringify(r.body ?? { message: "boom" }),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const all500 = () => ({ status: 500 }) as const;
const allNetwork = () => "network" as const;

beforeEach(() => {
  redirectSpy.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

// ---------------------------------------------------------------------------
// Rule 1: the page's primary data. Reachable failure rethrows; asleep = empty.
// ---------------------------------------------------------------------------
const rule1: Array<{ name: string; run: () => Promise<unknown>; empty: (v: unknown) => void }> = [
  { name: "getClients", run: () => getClients(), empty: (v) => expect(v).toEqual([]) },
  { name: "getBusiness", run: () => getBusiness(), empty: (v) => expect((v as { id: string }).id).toBe("") },
  { name: "getPurchases", run: () => getPurchases({ projectId: "p1" }), empty: (v) => expect(v).toEqual([]) },
  { name: "getLabourEntries", run: () => getLabourEntries({ projectId: "p1" }), empty: (v) => expect(v).toEqual([]) },
  { name: "getProjects", run: () => getProjects(), empty: (v) => expect(v).toEqual([]) },
  { name: "getQuotes", run: () => getQuotes(), empty: (v) => expect(v).toEqual([]) },
  { name: "getInvoices", run: () => getInvoices(), empty: (v) => expect(v).toEqual([]) },
  {
    name: "getReports",
    run: () => getReports("2026-09-01T05:00:00.000Z", "2026-10-01T05:00:00.000Z"),
    empty: (v) => {
      const r = v as { quotes: { sentCount: number }; range: { fromIso: string } };
      expect(r.quotes.sentCount).toBe(0);
      expect(r.range.fromIso).toBe("2026-09-01T05:00:00.000Z");
    },
  },
  { name: "getTrades", run: () => getTrades(true), empty: (v) => expect(v).toEqual([]) },
  {
    name: "getMaterialSchema",
    run: () => getMaterialSchema(true),
    empty: (v) => expect(v).toEqual({ categories: [], units: [] }),
  },
  { name: "getHiddenCatalog", run: () => getHiddenCatalog(), empty: (v) => expect(v).toEqual([]) },
  { name: "getRegulatoryUpdates", run: () => getRegulatoryUpdates(), empty: (v) => expect(v).toEqual([]) },
];

describe.each(rule1)("$name (rule 1: primary data)", ({ run, empty }) => {
  it("rethrows when the API is reachable but the request returned 500", async () => {
    stubFetch(true, all500);
    await expect(run()).rejects.toThrow();
  });

  it("returns its empty value when the API is unreachable (DemoDataBanner case)", async () => {
    stubFetch(false, allNetwork);
    empty(await run());
  });

  it("redirects to /login on a 401 without probing reachability", async () => {
    const spy = stubFetch(true, () => ({ status: 401, body: { message: "expired" } }));
    await expect(run()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(redirectSpy).toHaveBeenCalledWith("/login?expired=1");
    expect(spy.mock.calls.some(([u]) => String(u).endsWith("/health"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Rule 2: detail getters. A real 404 is "not found"; anything else while
// reachable rethrows so the page shows an error, never a 404.
// ---------------------------------------------------------------------------
const okList = { status: 200, body: [] };
const rule2: Array<{ name: string; run: () => Promise<unknown>; detailPath: string }> = [
  { name: "getClient", run: () => getClient("c1"), detailPath: "/clients/c1" },
  { name: "getQuote", run: () => getQuote("q1"), detailPath: "/quotes/q1" },
  { name: "getInvoice", run: () => getInvoice("i1"), detailPath: "/invoices/i1" },
  { name: "getProject", run: () => getProject("p1"), detailPath: "/projects/p1" },
];

describe.each(rule2)("$name (rule 2: detail getter)", ({ run, detailPath }) => {
  it("returns undefined for a genuine 404, even though the API is reachable", async () => {
    stubFetch(true, (p) => (p.endsWith(detailPath) ? { status: 404, body: { message: "Not found" } } : okList));
    await expect(run()).resolves.toBeUndefined();
  });

  it("rethrows (not undefined, so no 404 page) on a 500 while the API is reachable", async () => {
    stubFetch(true, (p) => (p.endsWith(detailPath) ? { status: 500 } : okList));
    await expect(run()).rejects.toThrow();
  });

  it("returns undefined when the API is unreachable (unchanged asleep behaviour)", async () => {
    stubFetch(false, allNetwork);
    await expect(run()).resolves.toBeUndefined();
  });

  it("redirects on a 403", async () => {
    stubFetch(true, () => ({ status: 403, body: { message: "suspended" } }));
    await expect(run()).rejects.toThrow(/NEXT_REDIRECT:\/account-required/);
  });
});

// ---------------------------------------------------------------------------
// Rule 3, deliberately left swallowing: the widget that reads each one already
// renders a visible "couldn't load" state for null, or the empty value is a
// harmless degradation (suggestions only). Pinned so a change is deliberate.
// ---------------------------------------------------------------------------
describe("secondary getters that keep their soft fallback", () => {
  it("getProjectProfit returns null on a reachable 500 (card says 'Couldn't load the figures')", async () => {
    stubFetch(true, all500);
    await expect(getProjectProfit("p1")).resolves.toBeNull();
  });
  it("getBillingStatus returns null on a reachable 500 (BillingCard says it couldn't load)", async () => {
    stubFetch(true, all500);
    await expect(getBillingStatus()).resolves.toBeNull();
  });
  it("getBillingPlans returns null on a reachable 500 (price hint omitted)", async () => {
    stubFetch(true, all500);
    await expect(getBillingPlans()).resolves.toBeNull();
  });
  it("getPurchaseCategories returns [] on a reachable 500 (form falls back to built-in suggestions)", async () => {
    stubFetch(true, all500);
    await expect(getPurchaseCategories()).resolves.toEqual([]);
  });
  it("getBillingStatus still redirects on a 401", async () => {
    stubFetch(true, () => ({ status: 401 }));
    await expect(getBillingStatus()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
  });
});
