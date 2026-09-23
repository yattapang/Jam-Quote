import { cache as reactCache } from "react";
import { checkApiReachable } from "./api-client";

/**
 * One reachability answer per server request, shared by every caller in that
 * request — the app shell layout (app/(app)/layout.tsx, for DemoDataBanner)
 * and emptyOnlyIfUnreachable (api-server.ts, on every getter's failure path).
 *
 * Before this, `checkApiReachable` was called fresh every time: the layout
 * probed once for the banner, and a page with several failing getters probed
 * once more per getter for the SAME page load. Two consequences: the layout
 * and the page could disagree (two independent probes racing a flaky window
 * differently) and say "asleep" in one place and "server is up but failed" in
 * the other, and a genuinely asleep API — each probe waiting up to 4s to time
 * out — made a page with several failing getters wait several times 4s
 * instead of once.
 *
 * How `cache()` behaves here, confirmed against this app's actual dependency
 * tree (Next 14.2.15 / React 18.3.1):
 *
 * - In Server Components (the layout) `cache()` memoises correctly, and the
 *   memoisation is genuinely per REQUEST, not per process: Next's app-render
 *   wraps each incoming request in its own React "cache scope" (see
 *   `node_modules/next/dist/compiled/react/cjs/react.development.js`,
 *   `cache$1` — it reads `ReactCurrentCache.current`, a dispatcher Next
 *   installs and tears down around each request's render), so two different
 *   requests never share a memoised answer, and two calls within the same
 *   request do.
 * - In Route Handlers (the quote/invoice email and PDF routes, which call
 *   getBusiness()/getQuote() etc. directly, never through a render) there is
 *   no such dispatcher installed. The SAME `cache$1` source above handles
 *   that explicitly: "If there is no dispatcher, then we treat this as not
 *   being cached" and just calls the wrapped function directly. So inside a
 *   route handler this still WORKS — it returns a correct, fresh answer — it
 *   just does not memoise across the (normally one-shot, within a single
 *   handler) calls that happen to run there. That matches this codebase: no
 *   route handler currently calls getApiReachable's underlying getters more
 *   than once per invocation, so there is nothing to dedupe there in
 *   practice, and there is no risk of a stale answer leaking across separate
 *   requests either.
 *
 * The one place `cache` does NOT come from is this repo's plain `node_modules
 * /react` package (18.3.1): that package exports no `cache` at all — it is
 * only exported by Next's own compiled React build, which Next's webpack
 * substitutes for every "react" import while bundling anything under `app/`
 * (pages, layouts, and route handlers alike). Vitest does not go through that
 * bundling step, so under test `reactCache` below is `undefined`, and this
 * falls back to a plain call-once memo so the module still loads and its
 * request-scoped-dedup behaviour stays testable. The real app always has
 * `reactCache` defined.
 */
type Cache = <T extends (...args: never[]) => unknown>(fn: T) => T;

// Without React's per-request `cache` (plain React 18, as vitest resolves it) we
// deliberately do NOT memoise. A process-lifetime memo here would freeze the first
// answer forever: an API asleep at boot would show the "can't reach the server"
// banner until the server restarted. Calling through only costs a repeated probe;
// the tests that assert one probe per request inject a real per-test `cache`.
function fallbackCache<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}

const memo: Cache = (reactCache as Cache | undefined) ?? fallbackCache;

const underlying = (): Promise<boolean> => checkApiReachable();
let memoised = memo(underlying);

export function getApiReachable(): Promise<boolean> {
  return memoised();
}

/**
 * TEST ONLY. Production never calls this: in real Next.js each incoming
 * request gets its own fresh React cache() scope for free (see the header
 * comment above), so nothing needs to be reset between requests. Under
 * Vitest, `getApiReachable`'s fallback memo lives for the whole test FILE
 * rather than per request — tests that stub a fresh reachability answer per
 * `it()` (lib/api-server.load-failure.test.ts, lib/api-server.catalog-
 * failure.test.ts) call this in beforeEach to get that same one-scope-per-
 * request behaviour between cases.
 */
export function resetApiReachableCacheForTests(): void {
  memoised = memo(underlying);
}
