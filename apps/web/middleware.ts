/**
 * Gate on the tenant app's protected route group. There is no more
 * `x-business-id` fallback anywhere in this app (see app/api/proxy,
 * lib/api-server.ts, lib/api-client.ts) — a signed-out request now gets a
 * silent 401 from the API on every fetch, and without this middleware every
 * page under (app) would just render empty with no explanation. This
 * middleware is the first line of defense: it only checks that the auth
 * cookie is *present* (a cheap, Edge-safe check — no fetch to the API), so a
 * present-but-expired/invalid token still reaches the page and gets caught
 * there instead (see redirectOnAuthError in lib/api-server.ts, and the
 * res.status === 401 branch in lib/api-client.ts's request(), both of which
 * redirect to /login when the API actually rejects the token).
 *
 * Protected: every route under app/(app)/* — dashboard, quotes, invoices,
 * clients, jobs, assemblies, labour, materials, reports, settings (route
 * groups don't appear in the URL, so these are matched by their real paths).
 *
 * Deliberately left alone (never redirected to /login by this file):
 * - "/", "/login", "/forgot-password", "/reset-password" — the public/auth
 *   pages themselves.
 * - "/admin" and "/admin-login" — the staff console has its own separate gate
 *   (app/admin/layout.tsx redirects to /admin-login on a missing/non-ADMIN
 *   session); forcing the tenant redirect here would send staff to the wrong
 *   login page.
 * - "/account-required" — must stay reachable by a signed-in user who just
 *   got redirected here (they *have* a cookie, so an allowlist gate would let
 *   them through anyway, but it's excluded explicitly for clarity).
 * - "/api/*" (incl. /api/proxy) — API routes handle their own status codes;
 *   the proxy forwards the API's 401 as-is rather than being redirected.
 * - Next internals and static assets, via the matcher below.
 */
import { NextRequest, NextResponse } from "next/server";

const TOKEN_COOKIE = "jamquote_token";

// Real URL prefixes for everything under app/(app)/*.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/quotes",
  "/invoices",
  "/clients",
  "/projects",
  "/assemblies",
  "/labour",
  "/materials",
  "/reports",
  "/settings",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

  if (!isProtected(pathname)) return NextResponse.next();
  if (req.cookies.get(TOKEN_COOKIE)?.value) return NextResponse.next();

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("redirect", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Skip Next internals, static assets, and favicon — everything else runs
    // through middleware() above, which itself only acts on PROTECTED_PREFIXES.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
