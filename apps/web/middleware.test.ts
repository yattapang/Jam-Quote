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
 * Discover every real route under app/(app) by walking the filesystem, the same way
 * Next's own router does — not by re-typing a second hand-maintained list next to the
 * one in middleware.ts. Conventions honoured:
 *  - A directory produces a route only if it contains a `page.tsx` or a `route.ts`
 *    (co-located components, `*.module.css`, and other files are not routes).
 *  - `(app)` is a route GROUP: it is stripped from the URL entirely.
 *  - A dynamic segment `[id]` / `[file]` becomes a concrete placeholder segment in the
 *    derived URL (Next itself would substitute a real value here).
 *  - `_`-prefixed folders are private and are skipped (none exist under (app) today,
 *    but the walk still honours the rule).
 *  - `layout.tsx`, `loading.tsx`, `error.tsx`, `template.tsx`, `not-found.tsx` are
 *    conventions, not routes, and are ignored.
 */
interface DiscoveredRoute {
  /** The URL path Next would route this to, e.g. "/invoices/test-id/edit". */
  urlPath: string;
  /** The top-level segment under (app), e.g. "invoices" — used to prove root coverage. */
  root: string;
}

function segmentToUrlPart(segment: string): string {
  if (segment.startsWith("[") && segment.endsWith("]")) {
    // Dynamic segment (including catch-all [...slug] / optional [[...slug]]) — Next
    // would substitute a real value; a placeholder exercises the same routing shape.
    return "test-id";
  }
  return segment;
}

function walkForRoutes(dir: string, segments: string[], root: string, out: DiscoveredRoute[]): void {
  const entries = readdirSync(dir, { withFileTypes: true });
  const hasRouteFile = entries.some(
    (e) => e.isFile() && (e.name === "page.tsx" || e.name === "route.ts"),
  );
  if (hasRouteFile) {
    const urlPath = "/" + segments.map(segmentToUrlPart).join("/");
    out.push({ urlPath, root });
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue; // private folder, not a route
    if (entry.name.startsWith("(") && entry.name.endsWith(")")) continue; // nested route group
    const nextRoot = segments.length === 0 ? entry.name : root;
    walkForRoutes(path.join(dir, entry.name), [...segments, entry.name], nextRoot, out);
  }
}

function discoverAppRoutes(): DiscoveredRoute[] {
  const out: DiscoveredRoute[] = [];
  const entries = readdirSync(APP_GROUP_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue;
    walkForRoutes(path.join(APP_GROUP_DIR, entry.name), [entry.name], entry.name, out);
  }
  return out;
}

const discovered = discoverAppRoutes();

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
 */
