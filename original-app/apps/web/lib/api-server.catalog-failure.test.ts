import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers the fix in lib/api-server.ts's emptyOnlyIfUnreachable(): the four
 * catalog getters (getMaterialFavourites, getLabourRates, getEquipment,
 * getJobs) must tell "API asleep" apart from "API up, this request failed."
 *
 * Before the fix, both cases returned []  and the page rendered "No saved …
 * yet" — indistinguishable from an empty catalog, which risks a contractor
 * re-creating items they already have. Now:
 *  - API unreachable: still [] (DemoDataBanner in the layout explains it).
 *  - API reachable but this request failed: the getter rethrows, so the
 *    catalog route's error.tsx can render a Retry state instead.
 *  - Auth errors (401/403) still redirect, unaffected by either case.
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
  getMaterialFavourites,
  getLabourRates,
  getEquipment,
  getJobs,
} from "./api-server";
import { resetApiReachableCacheForTests } from "./api-reachable";

type Getter = () => Promise<unknown[]>;

const getters: Array<{ name: string; path: string; run: Getter }> = [
  { name: "getMaterialFavourites", path: "/catalogs/material-favourites", run: () => getMaterialFavourites() },
  { name: "getLabourRates", path: "/catalogs/labour-rates", run: () => getLabourRates() },
  { name: "getEquipment", path: "/catalogs/equipment", run: () => getEquipment() },
  { name: "getJobs", path: "/jobs", run: () => getJobs() },
];

/**
 * Routes fetch calls: `/health` (checkApiReachable's probe) answers
 * `healthOk`, everything else follows `mainStatus`/`mainOk`/`mainThrows`.
 */
function stubFetch(opts: { healthOk: boolean; mainOk?: boolean; mainStatus?: number; mainThrows?: boolean }) {
  const spy = vi.fn(async (url: string | URL) => {
    const s = String(url);
    if (s.includes("/health")) {
      return { ok: opts.healthOk, status: opts.healthOk ? 200 : 503, text: async () => "" } as unknown as Response;
    }
    if (opts.mainThrows) throw new Error("network down");
    return {
      ok: opts.mainOk ?? false,
      status: opts.mainStatus ?? 500,
      text: async () => (opts.mainOk ? "[]" : JSON.stringify({ message: "boom" })),
    } as unknown as Response;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe.each(getters)("$name: catalog reachability handling", ({ run }) => {
  beforeEach(() => {
    redirectSpy.mockClear();
    // See lib/api-server.load-failure.test.ts's beforeEach for why.
    resetApiReachableCacheForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns [] when the API itself is unreachable (health probe fails too)", async () => {
    stubFetch({ healthOk: false, mainThrows: true });
    await expect(run()).resolves.toEqual([]);
  });

  it("rethrows (does not silently return []) when the API is reachable but this request failed (500)", async () => {
    stubFetch({ healthOk: true, mainOk: false, mainStatus: 500 });
    await expect(run()).rejects.toThrow();
  });

  it("redirects to /login on a 401 without consulting reachability", async () => {
    const spy = vi.fn(async (url: string | URL) => {
      const s = String(url);
      if (s.includes("/health")) throw new Error("should not probe reachability for an auth error");
      return { ok: false, status: 401, text: async () => JSON.stringify({ message: "expired" }) } as unknown as Response;
    });
    vi.stubGlobal("fetch", spy);
    await expect(run()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(redirectSpy).toHaveBeenCalledWith("/login?expired=1");
  });
});
