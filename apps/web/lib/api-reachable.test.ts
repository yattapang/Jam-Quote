import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Covers lib/api-reachable.ts: one reachability probe shared by every caller
 * that asks within the same module instance (in the real app, one Next.js
 * server request — see that file's header comment on how React's cache()
 * gives this true per-REQUEST scoping there, and why the fallback here
 * exercises the same "ask once, tell everyone" contract under Vitest, which
 * has no `cache` export on its plain `react` package).
 *
 * Before this module existed, the layout and every failing getter in
 * api-server.ts each called checkApiReachable() independently: six failing
 * getters on one page load meant six separate /health probes, which could
 * individually disagree (a flaky window answered differently) and, when the
 * API was genuinely asleep, meant a page waited 4s per getter instead of 4s
 * once.
 */
const checkApiReachable = vi.fn();
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
vi.mock("./api-client", () => ({ checkApiReachable: (...args: unknown[]) => checkApiReachable(...args) }));

describe("getApiReachable", () => {
  beforeEach(() => {
    vi.resetModules();
    checkApiReachable.mockReset();
  });

  it("probes the API only once no matter how many callers ask", async () => {
    checkApiReachable.mockResolvedValue(true);
    const { getApiReachable } = await import("./api-reachable");
    const [a, b, c] = await Promise.all([getApiReachable(), getApiReachable(), getApiReachable()]);
    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(c).toBe(true);
    expect(checkApiReachable).toHaveBeenCalledTimes(1);
  });

  it("gives every caller the SAME answer — the layout and a getter's failure handler cannot disagree", async () => {
    checkApiReachable.mockResolvedValueOnce(false);
    const { getApiReachable } = await import("./api-reachable");
    const layoutAnswer = await getApiReachable();
    // If this were re-probed, a second, different answer would prove the
    // layout and a getter could see different realities for the same load.
    checkApiReachable.mockResolvedValueOnce(true);
    const getterAnswer = await getApiReachable();
    expect(layoutAnswer).toBe(false);
    expect(getterAnswer).toBe(false);
    expect(checkApiReachable).toHaveBeenCalledTimes(1);
  });
});
