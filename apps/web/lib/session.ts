/**
 * Server-only session helpers. Reads the httpOnly auth cookie and resolves the
 * current user/business from the API. Import only from Server Components /
 * route handlers — never a client component.
 */
import "server-only";
import { cookies } from "next/headers";
import { API_BASE_URL } from "./api-client";

export const TOKEN_COOKIE = "jamquote_token";

/**
 * Holds the read-only, single-tenant JWT returned by
 * POST /admin/tenants/:id/impersonate while an admin is "viewing as" a
 * tenant. Deliberately a SEPARATE cookie from TOKEN_COOKIE: the admin's own
 * session must never be overwritten or restored, so exiting is just deleting
 * this cookie (see lib/impersonation-actions.ts's stopImpersonation).
 */
export const IMPERSONATION_COOKIE = "jamquote_impersonation";
/** The impersonated tenant's display name, cached alongside the token so the
 * banner (components/layout/ImpersonationBanner.tsx) can name it without an
 * extra API round trip. */
export const IMPERSONATION_NAME_COOKIE = "jamquote_impersonation_name";

export interface SessionUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: string;
}
export interface SessionBusiness {
  id: string;
  name: string;
}
export interface Session {
  user: SessionUser;
  business: SessionBusiness | null;
}

export function getToken(): string | undefined {
  return cookies().get(TOKEN_COOKIE)?.value;
}

export interface ImpersonationInfo {
  tenantName: string;
}

/** Non-null whenever an admin's "view as tenant" session is active — the
 * (app) layout uses this to decide whether to render ImpersonationBanner.
 * Reads only the cookies set by startImpersonation; never calls the API. */
export function getImpersonation(): ImpersonationInfo | null {
  const jar = cookies();
  const token = jar.get(IMPERSONATION_COOKIE)?.value;
  if (!token) return null;
  return { tenantName: jar.get(IMPERSONATION_NAME_COOKIE)?.value ?? "this tenant" };
}

/** Resolve the logged-in user via GET /auth/me, or null when signed out. */
export async function getSession(): Promise<Session | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as Session;
  } catch {
    return null;
  }
}
