/**
 * Validates a user-supplied post-login redirect target (from middleware's
 * `?redirect=` or the login form's hidden `redirectTo` field) before handing
 * it to next/navigation's redirect(). Only a same-origin relative path is
 * ever allowed — this guards against an open redirect via a crafted value
 * like "https://evil.example" or "//evil.example", and against bouncing back
 * into the login/admin-login pages themselves.
 */
const DISALLOWED_PREFIXES = ["/login", "/admin-login", "/api"];

export function safeRedirectPath(path: string | null | undefined, fallback = "/dashboard"): string {
  if (!path) return fallback;
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (DISALLOWED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return path;
}
