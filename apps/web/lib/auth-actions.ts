"use server";
/**
 * Auth server actions. Called from the login/register form and the logout
 * control. On success they set/clear the httpOnly JWT cookie and redirect.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_BASE_URL } from "./api-client";
import { TOKEN_COOKIE } from "./session";

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
  redirect("/dashboard");
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

export async function logout(): Promise<void> {
  cookies().delete(TOKEN_COOKIE);
  redirect("/login");
}
