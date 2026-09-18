import { expect, it, vi } from "vitest";

/**
 * Confirms api-server.ts's failing getters share ONE reachability probe
 * (lib/api-reachable.ts) rather than each running their own — the fix for
 * "the reachability probe is uncached, so answers can disagree and probes
 * repeat." Before the fix, six failing getters on one page made six separate
 * `GET /health` calls; now they make one, and the layout's own probe
 * (app/(app)/layout.tsx, not exercised directly here since it needs a DOM
 * render — see lib/api-reachable.test.ts for the layout/getter-agreement
 * case at the module level) draws from the same memoised function.
 */

vi.mock("react", async (importOriginal) => {
  // Stand in for Next's per-request React `cache`: memoise per wrapped function,
  // so one test's "request" probes once. Real React 18 has no `cache` export.
  const actual = await importOriginal<typeof import("react")>();
  const cache = <T extends (...args: never[]) => unknown>(fn: T): T => {
    let done = false;
    let value: unknown;
    return ((...args: never[]) => (done ? value : ((done = true), (value = fn(...args))))) as T;
  };
  return { ...actual, cache };
});
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); } }));

import { getMaterialFavourites, getLabourRates, getEquipment, getJobs, getClients, getQuotes } from "./api-server";

it("six failing getters in one request probe reachability only once", async () => {
  const spy = vi.fn(async (url: string | URL) => {
    const s = String(url);
    if (s.includes("/health")) {
      return { ok: false, status: 503, text: async () => "" } as unknown as Response;
    }
    // Every main request fails too (network down) so each getter falls
    // through to the reachability check.
    throw new Error("network down");
  });
  vi.stubGlobal("fetch", spy);

  await Promise.all([
    getMaterialFavourites(),
    getLabourRates(),
    getEquipment(),
    getJobs(),
    getClients(),
    getQuotes(),
  ]);

  const healthCalls = spy.mock.calls.filter(([url]) => String(url).includes("/health"));
  expect(healthCalls).toHaveLength(1);

  vi.unstubAllGlobals();
});
