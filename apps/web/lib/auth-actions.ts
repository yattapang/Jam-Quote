"use server";
/**
 * Auth server actions. Called from the login/register form and the logout
 * control. On success they set/clear the httpOnly JWT cookie and redirect.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_BASE_URL } from "./api-client";
import { TOKEN_COOKIE } from "./session";
import { safeRedirectPath } from "./safe-redirect";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30d — matches the API token expiry.

export interface AuthFormState {
  error?: string;
}

function messageFrom(data: unknown): string {
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message: unknown }).message;
    if (Array.isArray(m)) return m.join(", ");
    if (typeof m === "string") return m;
  }
  return "Authentication failed. Please try again.";
}

async function authenticate(
  path: "/auth/login" | "/auth/register",
  body: Record<string, unknown>,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: messageFrom(data) };
    return { ok: true, token: (data as { token: string }).token };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Is the API running?" };
  }
}

function setToken(token: string): void {
  cookies().set(TOKEN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function login(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const result = await authenticate("/auth/login", { email, password });
  if (!result.ok) return { error: result.error };
  setToken(result.token);
  // Returns the user to the page they were trying to reach (set by
  // middleware.ts's `?redirect=` or the login page's hidden field) rather
  // than always dropping them on /dashboard.
  redirect(safeRedirectPath(String(formData.get("redirectTo") ?? "")));
}

export async function register(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const businessName = String(formData.get("businessName") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim() || undefined;
  if (!email || !password || !businessName) {
    return { error: "Business name, email, and password are required." };
  }
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const result = await authenticate("/auth/register", {
    email,
    password,
    businessName,
    fullName,
  });
  if (!result.ok) return { error: result.error };
  setToken(result.token);
  redirect("/dashboard");
}

/** Single entry point for the login/register form; dispatches on a hidden
 * `mode` field so the form can toggle between the two with one useFormState. */
export async function authenticateAction(
  prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const mode = String(formData.get("mode") ?? "login");
  return mode === "register" ? register(prev, formData) : login(prev, formData);
}

/**
 * Staff-console login (separate from the contractor login). Authenticates,
 * then only establishes a session + lands on /admin if the account actually
 * has the ADMIN role — a non-admin gets an error and NO session is set. (The
 * real boundary is still AdminGuard on the API; this just keeps the staff
 * entry point clean and lands admins in the right place.)
 */
export async function adminLogin(
  _prev: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  let data: { token?: string; user?: { role?: string } };
  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    data = (await res.json().catch(() => ({}))) as typeof data;
    if (!res.ok) return { error: messageFrom(data) };
  } catch {
    return { error: "Couldn't reach the server. Is the API running?" };
  }

  if (data.user?.role !== "ADMIN") {
    return { error: "This account doesn't have staff/admin access." };
  }
  if (!data.token) return { error: "Authentication failed. Please try again." };
  setToken(data.token);
  redirect("/admin");
}

export async function logout(): Promise<void> {
  cookies().delete(TOKEN_COOKIE);
  redirect("/login");
}

export interface ForgotPasswordState {
  submitted?: boolean;
  error?: string;
}

/**
 * Always resolves to a neutral "submitted" state on any completed request —
 * the API itself never reveals whether the email belongs to an account, and
 * neither does this form. Only a genuine network failure (API unreachable)
 * is reported differently, so the user knows to retry.
 */
export async function forgotPasswordAction(
  _prev: ForgotPasswordState | undefined,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  try {
    await fetch(`${API_BASE_URL}/auth/forgot-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });
    return { submitted: true };
  } catch {
    return { error: "Couldn't reach the server. Is the API running?" };
  }
}

export interface ResetPasswordState {
  error?: string;
}

export async function resetPasswordAction(
  _prev: ResetPasswordState | undefined,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  if (!token) return { error: "This reset link is missing its token. Request a new one." };
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };

  try {
    const res = await fetch(`${API_BASE_URL}/auth/reset-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { error: messageFrom(data) };
    }
  } catch {
    return { error: "Couldn't reach the server. Is the API running?" };
  }

  redirect("/login?reset=success");
}
