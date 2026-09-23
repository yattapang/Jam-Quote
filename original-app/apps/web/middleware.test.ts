import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT_DIR = path.join(__dirname, "app");

function makeRequest(pathname: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `jamquote_token=${cookie}`);
  return new NextRequest(new URL(pathname, "http://localhost:3000"), { headers });
}

/**
 * ---------------------------------------------------------------------------
 * The URL-mapping function.
 * ---------------------------------------------------------------------------
 *
 * This is the ONE place that turns a chain of app-router folder names into the
 * URL Next would actually route to it. Discovery below calls it; nothing else
 * re-derives this mapping. Conventions honoured, per
 * https://nextjs.org/docs/app/building-your-application/routing:
 *
 *  - `(group)` — a route GROUP. Never a URL segment, at any depth. Its
 *    children are still part of the route tree and are recursed into.
 *  - `@slot` — a parallel-route SLOT. Also never a URL segment (it renders in
 *    parallel with its siblings inside the shared layout); its children are
 *    recursed into the same way a group's are.
 *  - `_folder` — a PRIVATE folder. This opts the folder, and everything under
 *    it, out of routing entirely — it is not walked at all, not just
 *    stripped from the URL.
 *  - `(.)x`, `(..)x`, `(..)(..)x`, `(...)x` — an INTERCEPTING route marker
 *    prefixed onto a segment name. The marker only changes which component
 *    Next swaps in on a client-side (soft) navigation; it is never part of
 *    the actual request path — a hard navigation/reload to that path (which
 *    is what `middleware()` sees, since it runs on the raw request) resolves
 *    to the plain, non-intercepted segment. So the marker is stripped and the
 *    remaining name is treated as an ordinary segment.
 *  - `[id]`, `[...slug]`, `[[...slug]]` — dynamic/catch-all segments become a
 *    concrete placeholder ("test-id"), which exercises the same routing shape
 *    a real request would.
 *
 * What this does NOT prove: it is a static mapping over folder-name strings,
 * not a live comparison against Next's own router internals. If Next ever
 * changes what a routing convention means, this table goes stale until
 * someone updates it to match — nothing here would catch that drift.
 */

export type FolderRouting =
  | { kind: "private" }
  | { kind: "group" }
  | { kind: "slot" }
  | { kind: "segment"; urlPart: string };

const INTERCEPT_MARKER = /^(\(\.\.\.\)|\(\.\.\)\(\.\.\)|\(\.\.\)|\(\.\))(.+)$/;

export function classifyFolder(name: string): FolderRouting {
  if (name.startsWith("_")) return { kind: "private" };
  if (name.startsWith("(") && name.endsWith(")")) return { kind: "group" };
  if (name.startsWith("@")) return { kind: "slot" };

  const intercept = name.match(INTERCEPT_MARKER);
  // `?.[2] ?? name`: the capture group is typed possibly-undefined, and a folder that
  // matched the marker but somehow captured nothing should fall back to its own name.
  const bareName = intercept?.[2] ?? name;
  return { kind: "segment", urlPart: dynamicToUrlPart(bareName) };
}

function dynamicToUrlPart(segment: string): string {
  // Covers [id], [...slug] and [[...slug]] alike — all three are wrapped in a
  // leading "[" / trailing "]" once the optional-catch-all's extra brackets
  // are accounted for.
  if (segment.startsWith("[") && segment.endsWith("]")) return "test-id";
  return segment;
}

/**
 * Turn a chain of folder names — from directly under app/(app), down to the
 * directory holding the page/route file — into the URL Next would route to
 * it. Groups and slots never contribute a literal URL segment. (A private
 * folder should never reach here at all — discovery below stops descending
 * into one before it can appear in a segment chain; `classifyFolder`'s
 * "private" case is exercised directly in this file's own table test rather
 * than silently swallowed here.)
 */
export function segmentsToUrlPath(segments: string[]): string {
  const parts: string[] = [];
  for (const segment of segments) {
    const routing = classifyFolder(segment);
    if (routing.kind === "segment") parts.push(routing.urlPart);
  }
  return "/" + parts.join("/");
}

/**
 * ---------------------------------------------------------------------------
 * Filesystem discovery.
 * ---------------------------------------------------------------------------
 *
 * Discover every real route under app/(app) by walking the filesystem, the
 * same way Next's own router does — not by re-typing a second
 * hand-maintained list next to the one in middleware.ts. Conventions
 * honoured (delegated to `classifyFolder`/`segmentsToUrlPath` above for the
 * URL side):
 *  - A directory produces a route only if it directly contains a `page` or
 *    `route` file, in any of Next's four source extensions: `.tsx`, `.ts`,
 *    `.jsx`, `.js`.
 *  - Route groups `(x)` and parallel-route slots `@x` are recursed into at
 *    every depth, and never become part of the derived URL.
 *  - `_`-prefixed folders are private and are skipped entirely — the whole
 *    subtree is not walked, not just excluded from the URL.
 *  - Intercepting-route markers `(.)`, `(..)`, `(..)(..)`, `(...)` prefixed
 *    on a segment are stripped; the remaining name is an ordinary segment.
 *  - A dynamic segment `[id]` / `[...slug]` / `[[...slug]]` becomes a
 *    concrete placeholder segment in the derived URL.
 *  - A folder containing only `default.tsx` (the parallel-route fallback UI)
 *    and no `page`/`route` file is deliberately NOT treated as a route of
 *    its own: `default.tsx` is rendered by the parent layout when a
 *    parallel slot has no more-specific match for the current URL — it is
 *    never itself the target of a request path, so no URL exists that would
 *    make Next serve it as "the page" the way it would for `page.tsx`.
 *  - `layout`, `loading`, `error`, `template`, `not-found` (any extension)
 *    are conventions, not routes, and are ignored — same reasoning as
 *    `default.tsx` above.
 */
interface DiscoveredRoute {
  /** The URL path Next would route this to, e.g. "/invoices/test-id/edit". */
  urlPath: string;
  /** The top-level segment under app/, e.g. "invoices" or "(app)" — used to prove root coverage. */
  root: string;
  /**
   * Does this route descend from the `app/(app)` route group — the tree middleware.ts
   * protects? Tracked independently of `root`, because `root` freezes at the FIRST
   * ordinary (non-group, non-slot) segment under app/ — for anything under `(app)`,
   * that segment is itself inside the group, one level down, so `root` alone cannot
   * answer "is this protected". A route can only ever be under app/(app) or not; Next
   * has no nested top-level route groups sharing that name in this app.
   */
  underAppGroup: boolean;
}

const ROUTE_FILE_BASENAMES = new Set(
  ["page", "route"].flatMap((base) => [".tsx", ".ts", ".jsx", ".js"].map((ext) => `${base}${ext}`)),
);

function walkForRoutes(
  dir: string,
  segments: string[],
  root: string,
  underAppGroup: boolean,
  out: DiscoveredRoute[],
): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  const hasRouteFile = entries.some((e) => e.isFile() && ROUTE_FILE_BASENAMES.has(e.name));
  if (hasRouteFile) {
    out.push({ urlPath: segmentsToUrlPath(segments), root, underAppGroup });
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const routing = classifyFolder(entry.name);
    if (routing.kind === "private") continue; // opts the whole subtree out of routing

    // Groups and slots recurse but don't establish a new "root" — only an
    // ordinary segment directly under app/ (segments.length === 0 here)
    // does, and that's what's used below to prove top-level coverage.
    // `root` is the first ORDINARY segment reached on the way down, skipping through any
    // groups/slots crossed first (a route group can sit above real segments at any
    // depth, not only at segments.length === 0 — this walk starts at app/, so `(app)`
    // itself is one such group).
    const nextRoot = root === "" && routing.kind === "segment" ? entry.name : root;
    const nextUnderAppGroup = underAppGroup || (segments.length === 0 && entry.name === "(app)");
    walkForRoutes(path.join(dir, entry.name), [...segments, entry.name], nextRoot, nextUnderAppGroup, out);
  }
}

/** Walks the WHOLE app/ tree — not just app/(app) — so a new route group added anywhere
 * (e.g. app/(billing)/x/page.tsx) is discovered and forced through the checks below,
 * instead of silently going unnoticed the way a discovery scoped to app/(app) would. */
function discoverAppRoutes(): DiscoveredRoute[] {
  const out: DiscoveredRoute[] = [];
  walkForRoutes(APP_ROOT_DIR, [], "", false, out);
  return out;
}

const discovered = discoverAppRoutes();

describe("segmentsToUrlPath (the URL-mapping function, tested directly)", () => {
  const cases: Array<{ segments: string[]; expected: string; label: string }> = [
    { segments: ["dashboard"], expected: "/dashboard", label: "plain top-level route" },
    { segments: ["invoices", "[id]"], expected: "/invoices/test-id", label: "dynamic segment" },
    { segments: ["reports", "export"], expected: "/reports/export", label: "nested static segments" },
    {
      segments: ["zzpay", "(zzg)", "sub"],
      expected: "/zzpay/sub",
      label: "nested route group is descended into and stripped from the URL",
    },
    {
      segments: ["(zzgrp)", "dashboard"],
      expected: "/dashboard",
      label: "top-level route group never appears in the URL",
    },
    {
      segments: ["feed", "@modal", "sub"],
      expected: "/feed/sub",
      label: "parallel-route slot contributes no URL segment",
    },
    {
      segments: ["feed", "(.)photo", "[id]"],
      expected: "/feed/photo/test-id",
      label: "same-level intercepting marker is stripped, bare name kept",
    },
    {
      segments: ["feed", "(..)photo"],
      expected: "/feed/photo",
      label: "one-level-up intercepting marker is stripped",
    },
    {
      segments: ["feed", "(..)(..)photo"],
      expected: "/feed/photo",
      label: "two-levels-up intercepting marker is stripped",
    },
    {
      segments: ["feed", "(...)photo"],
      expected: "/feed/photo",
      label: "from-root intercepting marker is stripped",
    },
    {
      segments: ["docs", "[...slug]"],
      expected: "/docs/test-id",
      label: "catch-all segment becomes a placeholder",
    },
    {
      segments: ["docs", "[[...slug]]"],
      expected: "/docs/test-id",
      label: "optional catch-all segment becomes a placeholder",
    },
  ];

  for (const { segments, expected, label } of cases) {
    it(`${label}: [${segments.join(", ")}] -> ${expected}`, () => {
      expect(segmentsToUrlPath(segments)).toBe(expected);
    });
  }

  it("classifies a private folder as private (callers must skip its subtree, not map it)", () => {
    expect(classifyFolder("_components").kind).toBe("private");
  });
});

/**
 * Every route this app serves OUTSIDE app/(app), with the reason it must stay public (or
 * self-gated) rather than being redirected by this middleware. Derived to match what
 * exists TODAY — every one of these is a route `discoverAppRoutes()` actually finds; the
 * coverage test below fails if any entry stops existing, and, symmetrically, fails if any
 * NEWLY discovered non-(app) route is missing from this list. That is what makes this a
 * derived allow-list rather than a hand-list that rots: nothing can be added to app/ and
 * skip both middleware protection AND an entry here without one of the two tests below
 * failing loudly.
 */
const PUBLIC_ROUTES: { urlPath: string; reason: string }[] = [
  { urlPath: "/", reason: "the marketing/landing page" },
  { urlPath: "/login", reason: "the tenant sign-in page itself" },
  { urlPath: "/forgot-password", reason: "password-reset request page, reachable signed out" },
  { urlPath: "/reset-password", reason: "password-reset completion page, reachable signed out" },
  {
    urlPath: "/admin",
    reason: "the staff console has its own separate gate (app/admin/layout.tsx redirects to /admin-login)",
  },
  { urlPath: "/admin-login", reason: "the staff login page itself" },
  {
    urlPath: "/account-required",
    reason: "must stay reachable by a signed-in user who was just redirected here",
  },
  {
    urlPath: "/api/proxy/test-id",
    reason: "app/api/proxy/[...path] — API routes handle their own status codes; the proxy forwards a 401 as-is",
  },
  { urlPath: "/q/test-id", reason: "public quote share link, opened by the tenant's client with no account" },
  { urlPath: "/i/test-id", reason: "public invoice share link, opened by the tenant's client with no account" },
];

describe("middleware", () => {
  it("discovery actually found routes under app/(app), including today's known roots", () => {
    // Guards against a rename/move of app/(app) silently emptying the walk and every
    // assertion below passing vacuously over zero cases.
    const protected_ = discovered.filter((r) => r.underAppGroup);
    expect(protected_.length).toBeGreaterThan(0);

    const roots = new Set(protected_.map((r) => r.root));
    expect(roots.size).toBeGreaterThanOrEqual(11);
    expect(roots).toContain("dashboard");

    const urlPaths = new Set(protected_.map((r) => r.urlPath));
    expect(urlPaths).toContain("/dashboard");
  });

  it("every route discovered anywhere under app/ is either protected (under app/(app)) or on the explicit public list — a new route group cannot go unnoticed", () => {
    expect(discovered.length).toBeGreaterThan(0);
    const publicPaths = new Set(PUBLIC_ROUTES.map((p) => p.urlPath));
    const unaccounted = discovered.filter((r) => !r.underAppGroup && !publicPaths.has(r.urlPath));
    expect(unaccounted.map((r) => r.urlPath)).toEqual([]);
  });

  it("every PUBLIC_ROUTES entry still names a route that actually exists", () => {
    // The inverse of the check above: an entry here for a route that was removed or
    // renamed would otherwise sit unnoticed forever, silently covering nothing.
    const urlPaths = new Set(discovered.map((r) => r.urlPath));
    const stale = PUBLIC_ROUTES.filter((p) => !urlPaths.has(p.urlPath));
    expect(stale).toEqual([]);
  });

  it("redirects every discovered (app) route to /login when signed out — behaviour, not the array", () => {
    const protected_ = discovered.filter((r) => r.underAppGroup);
    expect(protected_.length).toBeGreaterThan(0);
    for (const { urlPath } of protected_) {
      const res = middleware(makeRequest(urlPath));
      expect(res.status, `expected ${urlPath} to redirect when signed out`).toBe(307);
      const location = new URL(res.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect")).toBe(urlPath);
    }
  });

  it("lets a signed-in request through for every discovered (app) route", () => {
    const protected_ = discovered.filter((r) => r.underAppGroup);
    expect(protected_.length).toBeGreaterThan(0);
    for (const { urlPath } of protected_) {
      const res = middleware(makeRequest(urlPath, "some-jwt"));
      expect(res.status, `expected ${urlPath} to pass through when signed in`).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("preserves the query string of the originally requested protected path", () => {
    const res = middleware(makeRequest("/quotes/new?projectId=job-0142"));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("redirect")).toBe("/quotes/new?projectId=job-0142");
  });

  it("does not treat a route that merely starts with a protected word as protected (no false-positive prefix match)", () => {
    // "/jobsomething" must not be caught by a "/jobs" (or similar) prefix.
    const res = middleware(makeRequest("/jobsomething"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets a signed-out request through for every non-protected page (the inverse check)", () => {
    // Public routes, including dynamic public share links — a guard that redirects
    // *everything* would pass the tests above just as well, so this must hold too.
    // Sourced from PUBLIC_ROUTES (with a real token substituted for the "test-id"
    // placeholder) rather than a second hand-typed list next to it.
    for (const { urlPath } of PUBLIC_ROUTES) {
      const path = urlPath.replace("test-id", "some-token");
      const res = middleware(makeRequest(path));
      expect(res.status, `expected ${path} to stay public`).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    }
  });
});

/*
 * What this file does NOT prove:
 *
 * - It calls `middleware()` directly, the way these tests always have. Next itself
 *   decides whether a request reaches that function at all via `config.matcher` in
 *   middleware.ts. Today that matcher only excludes `_next/static`, `_next/image` and
 *   `favicon.ico` — none of which can collide with an app/(app) route segment — so every
 *   route this file discovers does reach middleware() in the real app. But a future edit
 *   to the matcher regex could exclude an (app) path (e.g. an overly broad negative
 *   lookahead) and this suite would keep passing while that route stopped being checked
 *   at all in production. That is a gap only a matcher-aware test (or an integration test
 *   hitting the actual Next dev/prod server) can close; nothing here checks it.
 * - It does not prove every `route.ts` under (app) enforces auth itself once past
 *   middleware — only that the middleware layer redirects the request before it gets
 *   there, which is this file's only job.
 * - `segmentsToUrlPath` is a static mapping over folder-name strings, exercised above
 *   against a table that includes every convention this repo's review found missing —
 *   nested groups, top-level groups, parallel slots, all four intercepting-route marker
 *   forms, and both catch-all forms — but it does not call into Next's router itself, so
 *   a future Next version that changes what one of these conventions means would go
 *   uncaught until someone updates the table to match.
 */
