"use server";
/**
 * "View as tenant" server actions — lets a capability-gated admin see the
 * app the way a specific tenant does, via the read-only, single-tenant,
 * 30-minute token from POST /admin/tenants/:id/impersonate (apps/api; see
 * that route's AdminGuard for the real authorization check — this file is
 * purely the web-side wiring).
 *
 * The impersonation token lives in its OWN cookie (IMPERSONATION_COOKIE),
 * never in TOKEN_COOKIE. The admin's own session cookie is never read for
 * writing and never touched here beyond being read to authenticate the
 * start call — so exiting (stopImpersonation) is just deleting the
 * impersonation cookies, with no dependency on the API being reachable or
 * the token being unexpired.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_BASE_URL } from "./api-client";
import { TOKEN_COOKIE, IMPERSONATION_COOKIE, IMPERSONATION_NAME_COOKIE } from "./session";

// Matches the API's token expiry (30 minutes) so the cookie dies with the
// token instead of lingering as a dead, unusable session.
const MAX_AGE_SECONDS = 30 * 60;

interface ImpersonateResponse {
  token: string;
  expiresAt: string;
  business: { id: string; name: string };
}

/** POSTs to the impersonate endpoint with the admin's own token. Returns
 * null on any failure (network error, non-2xx — e.g. the API's 400 for a
 * suspended tenant, or a 403 if this admin lacks the capability) rather than
 * throwing, so startImpersonation can redirect back to the console cleanly
 * instead of surfacing a raw unhandled error. */
async function callImpersonate(businessId: string, adminToken: string): Promise<ImpersonateResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/tenants/${businessId}/impersonate`, {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ImpersonateResponse;
  } catch {
    return null;
  }
}

/** Starts a "view as tenant" session: calls the API with the admin's own
 * token, stashes the returned read-only token + tenant name in their own
 * cookies (never touching TOKEN_COOKIE), then lands on /dashboard where the
 * app now reads as that tenant (see api-server.ts's serverRequest and
 * ImpersonationBanner). Bind the businessId when wiring this to a
 * `<form action>` from a client component, e.g.
 * `startImpersonation.bind(null, tenantId)`. */
export async function startImpersonation(businessId: string): Promise<void> {
  const adminToken = cookies().get(TOKEN_COOKIE)?.value;
  if (!adminToken) redirect("/admin-login");

  const result = await callImpersonate(businessId, adminToken);
  if (!result) redirect("/admin");

  const cookieOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
  cookies().set(IMPERSONATION_COOKIE, result.token, cookieOpts);
  cookies().set(IMPERSONATION_NAME_COOKIE, result.business.name, cookieOpts);
  redirect("/dashboard");
}

/** Ends a "view as tenant" session by deleting both impersonation cookies
 * and returning to /admin. Deliberately does NOT call the API and does NOT
 * touch TOKEN_COOKIE — the way out must work even if the API is down or the
 * impersonation token already expired. */
export async function stopImpersonation(): Promise<void> {
  cookies().delete(IMPERSONATION_COOKIE);
  cookies().delete(IMPERSONATION_NAME_COOKIE);
  redirect("/admin");
}
