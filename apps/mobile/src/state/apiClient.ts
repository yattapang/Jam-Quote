/**
 * Mobile data access — the single place the app talks to apps/api. Fetches from
 * the live NestJS API and maps to the on-screen row types; falls back to the
 * shared fixtures when the API is unreachable (offline / no dev server).
 *
 * Base URL: on Expo web use the browser host; on a device derive the dev
 * machine's LAN IP from the Metro packager host (expo-constants) — a phone
 * can't reach the PC's "localhost". Override with EXPO_PUBLIC_API_BASE_URL.
 */
import Constants from "expo-constants";
import { QuoteStatus } from "@jamquote/core";
import {
  STAGE_KIND,
  STATUS_PILL,
  clientRows as fixtureClientRows,
  jobRows as fixtureJobRows,
  quoteListRows as fixtureQuoteRows,
  type ClientRow,
  type JobRow,
  type QuoteListRow,
} from "./mockData";

const API_PORT = 3001;
const BUSINESS_ID = "seed-business-blackwood";

// Set by AuthProvider (src/state/AuthContext) on login/logout. When a token is
// present, requests authenticate as the signed-in user's business; otherwise we
// fall back to the demo business via x-business-id (additive auth rollout).
let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}
function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : { "x-business-id": BUSINESS_ID };
}

export function apiBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (override) return override;
  // Expo web: same host the browser used.
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `http://${window.location.hostname}:${API_PORT}/api`;
  }
  // Native device: the Metro packager host is the dev machine's LAN IP.
  const host = (Constants.expoConfig?.hostUri ?? "").split(":")[0];
  return `http://${host || "localhost"}:${API_PORT}/api`;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`DELETE ${path} -> ${res.status}`);
}

// --- Auth ------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string | null;
  fullName: string | null;
  role: string;
}
export interface AuthBusiness {
  id: string;
  name: string;
}
export interface AuthResult {
  token: string;
  user: AuthUser;
  business: AuthBusiness | null;
}
export interface RegisterInput {
  email: string;
  password: string;
  businessName: string;
  fullName?: string;
}

function authErrorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message: unknown }).message;
    if (Array.isArray(m)) return m.join(", ");
    if (typeof m === "string") return m;
  }
  return fallback;
}

async function postAuth(path: string, body: unknown): Promise<AuthResult> {
  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(authErrorMessage(data, "Authentication failed."));
  return data as AuthResult;
}

export function apiLogin(email: string, password: string): Promise<AuthResult> {
  return postAuth("/auth/login", { email, password });
}

export function apiRegister(input: RegisterInput): Promise<AuthResult> {
  return postAuth("/auth/register", input);
}

/** Verify a stored token and return the current user/business, or throw. */
export async function fetchMe(token: string): Promise<{ user: AuthUser; business: AuthBusiness | null }> {
  const res = await fetch(`${apiBaseUrl()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /auth/me -> ${res.status}`);
  return (await res.json()) as { user: AuthUser; business: AuthBusiness | null };
}

interface ApiQuote {
  id: string;
  clientId?: string | null;
  jobId?: string | null;
  number: string;
  status: QuoteStatus;
  totalCents: number;
}
interface ApiClientRow {
  id: string;
  name: string;
  phone?: string | null;
  parish?: string | null;
}
interface ApiJob {
  id: string;
  clientId?: string | null;
  name: string;
  addressLine?: string | null;
  stage: string;
  progressPct: number;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

export function mapQuoteRow(q: ApiQuote, clientName: string, jobName: string): QuoteListRow {
  const pill = STATUS_PILL[q.status] ?? { label: q.status, kind: "neutral" as const };
  return {
    id: q.id,
    num: q.number,
    client: clientName,
    job: jobName,
    amountCents: q.totalCents,
    status: pill.label,
    kind: pill.kind,
  };
}

export function mapClientRow(c: ApiClientRow, totalCents: number, quoteCount: number): ClientRow {
  return {
    id: c.id,
    initials: initialsOf(c.name),
    name: c.name,
    parish: c.parish ?? "",
    phone: c.phone ?? "",
    totalCents,
    quoteCount,
  };
}

export function mapJobRow(j: ApiJob, clientName: string, valueCents: number): JobRow {
  return {
    id: j.id,
    name: j.name,
    clientName,
    address: j.addressLine ?? "",
    stage: j.stage,
    pct: j.progressPct,
    valueCents,
    kind: STAGE_KIND[j.stage] ?? "neutral",
  };
}

export async function fetchQuoteRows(): Promise<QuoteListRow[]> {
  try {
    const [quotes, clients, jobs] = await Promise.all([
      get<ApiQuote[]>("/quotes"),
      get<ApiClientRow[]>("/clients"),
      get<ApiJob[]>("/jobs"),
    ]);
    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    const jobName = new Map(jobs.map((j) => [j.id, j.name]));
    return quotes
      .map((q) => mapQuoteRow(q, clientName.get(q.clientId ?? "") ?? "Unknown", jobName.get(q.jobId ?? "") ?? ""))
      .sort((a, b) => b.num.localeCompare(a.num));
  } catch {
    return fixtureQuoteRows;
  }
}

export async function fetchClientRows(): Promise<ClientRow[]> {
  try {
    const [clients, quotes] = await Promise.all([
      get<ApiClientRow[]>("/clients"),
      get<ApiQuote[]>("/quotes"),
    ]);
    return clients.map((c) => {
      const theirs = quotes.filter((q) => q.clientId === c.id);
      return mapClientRow(
        c,
        theirs.reduce((sum, q) => sum + q.totalCents, 0),
        theirs.length,
      );
    });
  } catch {
    return fixtureClientRows;
  }
}

export async function fetchJobRows(): Promise<JobRow[]> {
  try {
    const [jobs, clients, quotes] = await Promise.all([
      get<ApiJob[]>("/jobs"),
      get<ApiClientRow[]>("/clients"),
      get<ApiQuote[]>("/quotes"),
    ]);
    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    return jobs.map((j) => {
      const theirs = quotes.filter((q) => q.jobId === j.id);
      return mapJobRow(
        j,
        clientName.get(j.clientId ?? "") ?? "Unknown",
        theirs.reduce((sum, q) => sum + q.totalCents, 0),
      );
    });
  } catch {
    return fixtureJobRows;
  }
}

export function deleteClient(id: string): Promise<void> {
  return del(`/clients/${id}`);
}

export function deleteJob(id: string): Promise<void> {
  return del(`/jobs/${id}`);
}

export function deleteQuote(id: string): Promise<void> {
  return del(`/quotes/${id}`);
}
