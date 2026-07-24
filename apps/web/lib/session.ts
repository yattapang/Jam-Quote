/**
 * Server-only session helpers. Reads the httpOnly auth cookie and resolves the
 * current user/business from the API. Import only from Server Components /
 * route handlers — never a client component.
 */
import "server-only";
import { cookies } from "next/headers";
import { API_BASE_URL } from "./api-client";

export const TOKEN_COOKIE = "jamquote_token";

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
