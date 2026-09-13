import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_GROUP_DIR = path.join(__dirname, "app", "(app)");

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
  /** The top-level segment under (app), e.g. "invoices" — used to prove root coverage. */
  root: string;
}

const ROUTE_FILE_BASENAMES = new Set(
  ["page", "route"].flatMap((base) => [".tsx", ".ts", ".jsx", ".js"].map((ext) => `${base}${ext}`)),
);

function walkForRoutes(dir: string, segments: string[], root: string, out: DiscoveredRoute[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  const hasRouteFile = entries.some((e) => e.isFile() && ROUTE_FILE_BASENAMES.has(e.name));
  if (hasRouteFile) {
    out.push({ urlPath: segmentsToUrlPath(segments), root });
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const routing = classifyFolder(entry.name);
    if (routing.kind === "private") continue; // opts the whole subtree out of routing

    // Groups and slots recurse but don't establish a new "root" — only an
    // ordinary segment directly under (app) (segments.length === 0 here)
    // does, and that's what's used below to prove top-level coverage.
    const nextRoot = segments.length === 0 && routing.kind === "segment" ? entry.name : root;
    walkForRoutes(path.join(dir, entry.name), [...segments, entry.name], nextRoot, out);
  }
}

function discoverAppRoutes(): DiscoveredRoute[] {
  const out: DiscoveredRoute[] = [];
  walkForRoutes(APP_GROUP_DIR, [], "", out);
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

describe("middleware", () => {
  it("discovery actually found routes under app/(app), including today's known roots", () => {
    // Guards against a rename/move of app/(app) silently emptying the walk and every
    // assertion below passing vacuously over zero cases.
    expect(discovered.length).toBeGreaterThan(0);

    const roots = new Set(discovered.map((r) => r.root));
    expect(roots.size).toBeGreaterThanOrEqual(11);
    expect(roots).toContain("dashboard");

    const urlPaths = new Set(discovered.map((r) => r.urlPath));
    expect(urlPaths).toContain("/dashboard");
  });

  it("redirects every discovered (app) route to /login when signed out — behaviour, not the array", () => {
    expect(discovered.length).toBeGreaterThan(0);
    for (const { urlPath } of discovered) {
      const res = middleware(makeRequest(urlPath));
      expect(res.status, `expected ${urlPath} to redirect when signed out`).toBe(307);
      const location = new URL(res.headers.get("location")!);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirect")).toBe(urlPath);
    }
  });

  it("lets a signed-in request through for every discovered (app) route", () => {
    expect(discovered.length).toBeGreaterThan(0);
    for (const { urlPath } of discovered) {
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
    for (const path of [
      "/",
      "/login",
      "/forgot-password",
      "/reset-password",
      "/admin",
      "/admin-login",
      "/account-required",
      "/q/some-quote-token",
      "/i/some-invoice-token",
    ]) {
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
