/**
 * Mobile data access — the single place the app talks to apps/api. Fetches from
 * the live NestJS API and maps to the on-screen row types.
 *
 * Auth: every tenant route (/quotes, /clients, /jobs, ...) requires a Bearer
 * token; there is no more header-based fallback. With no token, requests carry
 * no auth at all and the API will (correctly) answer 401 — see ApiAuthError.
 *
 * Fixtures: this app has no offline persistence/outbox (no local db, no sync
 * queue — see src/state/) — the bundled fixtures are dev/demo scaffolding for
 * "API unreachable" (no dev server, LAN hiccup), not a real offline mode. They
 * are used ONLY for genuine network failures, never to paper over an
 * authentication/authorization failure — see ApiAuthError handling below and
 * in fetchQuoteRows/fetchClientRows/fetchProjectRows.
 *
 * Base URL: on Expo web use the browser host; on a device derive the dev
 * machine's LAN IP from the Metro packager host (expo-constants) — a phone
 * can't reach the PC's "localhost". Override with EXPO_PUBLIC_API_BASE_URL.
 */
import Constants from "expo-constants";
import { QuoteStatus } from "@jamquote/core";
import type { ProjectStage } from "@jamquote/core";
import {
  STAGE_KIND,
  STATUS_PILL,
  clientRows as fixtureClientRows,
  projectRows as fixtureProjectRows,
  quoteListRows as fixtureQuoteRows,
  type ClientRow,
  type ProjectRow,
  type QuoteListRow,
} from "./mockData";

const API_PORT = 3001;

// Set by AuthProvider (src/state/AuthContext) on login/logout.
let authToken: string | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}
function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

/**
 * Thrown when the API rejects a request as unauthenticated (401) or
 * unauthorized for this tenant (403 — valid token, but no usable business:
 * an admin account, or a suspended business). Never caught-and-masked with
 * fixture data; callers/screens must treat it as "sign-in required".
 */
export class ApiAuthError extends Error {
  status: 401 | 403;
  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "ApiAuthError";
    this.status = status;
  }
}

type UnauthorizedHandler = (status: 401 | 403) => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
/**
 * Registered once by AuthProvider so a 401/403 from ANY request is handled in
 * one place (clear the session, prompt sign-in) instead of every screen
 * coping individually. apiClient itself stays navigation-agnostic (and stays
 * importable in plain vitest/node tests) — AuthProvider owns clearing the
 * token / redirecting to the login screen.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

/** Inspects a response for 401/403 and routes it through the central handler. Throws ApiAuthError; returns normally otherwise (caller still checks res.ok for other failures). */
function checkAuth(res: Response): void {
  if (res.status === 401 || res.status === 403) {
    unauthorizedHandler?.(res.status);
    throw new ApiAuthError(res.status, `${res.status}`);
  }
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
  checkAuth(res); // throws ApiAuthError on 401/403 — never falls through to !res.ok below
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  checkAuth(res);
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
  projectId?: string | null;
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
interface ApiProject {
  id: string;
  clientId?: string | null;
  name: string;
  addressLine?: string | null;
  stage: ProjectStage;
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

export function mapProjectRow(j: ApiProject, clientName: string, valueCents: number): ProjectRow {
  return {
    id: j.id,
    name: j.name,
    clientName,
    address: j.addressLine ?? "",
    stage: j.stage,
    pct: j.progressPct,
    valueCents,
    // Still coalesced: STAGE_KIND is exhaustive over ProjectStage, but this row
    // comes off the wire, so a server that learns a sixth stage before this
    // build does renders grey rather than crashing the list.
    kind: STAGE_KIND[j.stage] ?? "neutral",
  };
}

export async function fetchQuoteRows(): Promise<QuoteListRow[]> {
  try {
    const [quotes, clients, jobs] = await Promise.all([
      get<ApiQuote[]>("/quotes"),
      get<ApiClientRow[]>("/clients"),
      get<ApiProject[]>("/jobs"),
    ]);
    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    const jobName = new Map(jobs.map((j) => [j.id, j.name]));
    return quotes
      .map((q) => mapQuoteRow(q, clientName.get(q.clientId ?? "") ?? "Unknown", jobName.get(q.projectId ?? "") ?? ""))
      .sort((a, b) => b.num.localeCompare(a.num));
  } catch (err) {
    // Auth failures are never masked as data — let the caller/central handler deal with it.
    if (err instanceof ApiAuthError) throw err;
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
  } catch (err) {
    if (err instanceof ApiAuthError) throw err;
    return fixtureClientRows;
  }
}

export async function fetchProjectRows(): Promise<ProjectRow[]> {
  try {
    const [jobs, clients, quotes] = await Promise.all([
      get<ApiProject[]>("/jobs"),
      get<ApiClientRow[]>("/clients"),
      get<ApiQuote[]>("/quotes"),
    ]);
    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    return jobs.map((j) => {
      const theirs = quotes.filter((q) => q.projectId === j.id);
      return mapProjectRow(
        j,
        clientName.get(j.clientId ?? "") ?? "Unknown",
        theirs.reduce((sum, q) => sum + q.totalCents, 0),
      );
    });
  } catch (err) {
    if (err instanceof ApiAuthError) throw err;
    return fixtureProjectRows;
  }
}

export function deleteClient(id: string): Promise<void> {
  return del(`/clients/${id}`);
}

export function deleteProject(id: string): Promise<void> {
  return del(`/jobs/${id}`);
}

export function deleteQuote(id: string): Promise<void> {
  return del(`/quotes/${id}`);
}
