/**
 * Same-origin API proxy. Browser (client-component) calls go to /api/proxy/*
 * so the httpOnly auth cookie can be applied server-side here — the token is
 * never exposed to browser JS, and there are no cross-origin/CORS concerns
 * between the web app and the API.
 *
 * Attaches the logged-in user's JWT as `Authorization: Bearer`; when there's no
 * cookie it falls back to the demo business via x-business-id so the open demo
 * keeps working. Server-side reads do not use this proxy — see lib/api-server.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001/api";

const DEMO_BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID ?? "seed-business-blackwood";
const TOKEN_COOKIE = "jamquote_token";

async function forward(req: NextRequest, path: string[]): Promise<NextResponse> {
  const target = `${API_BASE_URL}/${path.join("/")}${req.nextUrl.search}`;
  const token = cookies().get(TOKEN_COOKIE)?.value;

  const headers: Record<string, string> = {};
  const contentType = req.headers.get("content-type");
  if (contentType) headers["content-type"] = contentType;
  if (token) headers["authorization"] = `Bearer ${token}`;
  else headers["x-business-id"] = DEMO_BUSINESS_ID;

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
