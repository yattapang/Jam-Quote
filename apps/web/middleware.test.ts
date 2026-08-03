import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";

function makeRequest(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `jamquote_token=${cookie}`);
  return new NextRequest(new URL(path, "http://localhost:3000"), { headers });
}

describe("middleware", () => {
  it("redirects a signed-out request for a protected (app) route to /login with a return path", () => {
    const res = middleware(makeRequest("/dashboard"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirect")).toBe("/dashboard");
  });

  it("preserves the query string of the originally requested protected path", () => {
    const res = middleware(makeRequest("/quotes/new?jobId=job-0142"));
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("redirect")).toBe("/quotes/new?jobId=job-0142");
  });

  it("lets a signed-out request through for every non-protected page", () => {
    for (const path of ["/", "/login", "/forgot-password", "/reset-password", "/admin", "/admin-login", "/account-required"]) {
      const res = middleware(makeRequest(path));
      expect(res.status).toBe(200); // NextResponse.next()
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("lets a request with the auth cookie present through to a protected route", () => {
    const res = middleware(makeRequest("/dashboard", "some-jwt"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("matches nested protected paths (e.g. /quotes/:id/edit), not just the bare prefix", () => {
    const res = middleware(makeRequest("/quotes/qt-0142/edit"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.searchParams.get("redirect")).toBe("/quotes/qt-0142/edit");
  });

  it("does not treat a route that merely starts with a protected word as protected (no false-positive prefix match)", () => {
    // "/jobsomething" must not be caught by the "/jobs" prefix.
    const res = middleware(makeRequest("/jobsomething"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
