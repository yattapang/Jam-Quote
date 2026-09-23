/**
 * Same-origin API proxy. Browser (client-component) calls go to /api/proxy/*
 * so the httpOnly auth cookie can be applied server-side here — the token is
 * never exposed to browser JS, and there are no cross-origin/CORS concerns
 * between the web app and the API.
 *
 * Attaches the logged-in user's JWT as `Authorization: Bearer` when present.
 * There is no tenant fallback anymore — the API's TenantAuthGuard requires a
 * valid token on every tenant route, so a request with no cookie is forwarded
 * with no auth at all and the API itself returns 401. Server-side reads do
 * not use this proxy — see lib/api-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { IMPERSONATION_COOKIE } from "@/lib/session";

const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001/api";

const TOKEN_COOKIE = "jamquote_token";

async function forward(req: NextRequest, path: string[]): Promise<NextResponse> {
  const target = `${API_BASE_URL}/${path.join("/")}${req.nextUrl.search}`;
  const jar = cookies();
  // Same carve-out as serverRequest in lib/api-server.ts, and it has to be the
  // same or a view-as-tenant session half-works: the server-rendered page
  // would show the tenant's data while every client-side fetch after it —
  // material search-as-you-type, any in-place editor — silently queried the
  // API as the admin's own account, which belongs to no business and 403s.
  // Admin routes keep the admin's own token because the API deliberately
  // refuses impersonation tokens there.
  const impersonationToken = jar.get(IMPERSONATION_COOKIE)?.value;
  const isAdminPath = path[0] === "admin";
  const token = impersonationToken && !isAdminPath ? impersonationToken : jar.get(TOKEN_COOKIE)?.value;

  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;
  if (token) headers["authorization"] = `Bearer ${token}`;

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const res = await fetch(target, {
    method: req.method,
    headers,
    body: hasBody ? await req.text() : undefined,
    cache: "no-store",
  });

  const body = await res.text();
  return new NextResponse(body.length ? body : null, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

type Ctx = { params: { path: string[] } };

export const GET = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path);
export const POST = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path);
export const PATCH = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path);
export const PUT = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path);
export const DELETE = (req: NextRequest, ctx: Ctx) => forward(req, ctx.params.path);
