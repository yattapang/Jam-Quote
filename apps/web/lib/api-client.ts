/**
 * Single chokepoint for talking to apps/api. Screens call the typed data
 * functions here (getClients, getQuotes, getQuote, getJobs) instead of
 * importing mock data. Each fetches from the live NestJS API and maps the
 * persistence shape to the view types; if the API is unreachable it falls back
 * to the shared @jamquote/core fixtures (same data) so the preview never breaks.
 */
import type { Client, Quote } from "./types";
import type { QuoteLineItemInput, QuoteStatus } from "@jamquote/core";
import { getQuoteTotals } from "./quote-totals";
import {
  clients as fixtureClients,
  quotes as fixtureQuotes,
  jobs as fixtureJobs,
  type JobSummary,
} from "./mock-data";

// Server components fetch server-side; default to the dev API. Override with
// API_BASE_URL (server) or NEXT_PUBLIC_API_BASE_URL (build) in deploy.
export const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001/api";

// Temporary auth stand-in — matches the seeded business until JWT auth lands.
const BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID ?? "seed-business-blackwood";

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", "x-business-id": BUSINESS_ID, ...init?.headers },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(`Request to ${path} failed`, res.status);
  }
  // DELETE (and any Promise<void> handler) comes back with a 200 and no body.
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/**
 * Cheap liveness probe for the API. Returns false (instead of throwing) when
 * the API is unreachable or too slow to answer within `timeoutMs`, so the UI
 * can warn that the screens are showing bundled demo data rather than live
 * data. This is deliberately short-timeout: on the free tier a cold API can
 * take ~40s to wake, during which the page's own fetches fall back to fixtures
 * anyway, so a fast "not reachable" answer matches what actually rendered.
 */
export async function checkApiReachable(timeoutMs = 4000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE_URL}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// --- API (persistence) shapes we read ---------------------------------------

interface ApiClientRow {
  id: string;
  name: string;
  phone?: string | null;
  parish?: string | null;
  addressLine?: string | null;
}
interface ApiJob {
  id: string;
  clientId?: string | null;
  name: string;
  addressLine?: string | null;
  parish?: string | null;
  stage: string;
  progressPct: number;
}
interface ApiLineItem {
  id: string;
  category: QuoteLineItemInput["category"];
  description: string;
  quantity: number | string;
  rateUnit: QuoteLineItemInput["rateUnit"];
  unitPriceCents: number;
  priceSource: QuoteLineItemInput["priceSource"];
  gctTreatment: QuoteLineItemInput["gctTreatment"];
  markupPct?: number | string | null;
}
interface ApiQuote {
  id: string;
  clientId?: string | null;
  jobId?: string | null;
  number: string;
  status: QuoteStatus;
  gctRate: number | string;
  discountPct: number | string;
  depositCents: number;
  subtotalCents: number;
  gctCents: number;
  totalCents: number;
  validUntil?: string | null;
  createdAt: string;
  lineItems?: ApiLineItem[];
  sections?: { lineItems: ApiLineItem[] }[];
}

// --- Pure mappers (exported for testing) ------------------------------------

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function dateLabel(iso: string, prefix = ""): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${prefix}${d.toLocaleDateString("en-JM", { month: "short", day: "numeric" })}`;
}

export function mapClient(c: ApiClientRow): Client {
  return {
    id: c.id,
    name: c.name,
    initials: initialsOf(c.name),
    parish: (c.parish ?? "") as Client["parish"],
    phone: c.phone ?? "",
    address: c.addressLine ?? "",
  };
}

function mapLine(l: ApiLineItem): Quote["lines"][number] {
  return {
    id: l.id,
    category: l.category,
    description: l.description,
    quantity: Number(l.quantity),
    rateUnit: l.rateUnit,
    unitPriceCents: l.unitPriceCents,
    priceSource: l.priceSource,
    gctTreatment: l.gctTreatment,
    markupPct: l.markupPct == null ? undefined : Number(l.markupPct),
  };
}

/** Map an API quote to the view Quote. `lines` is populated only for detail. */
export function mapQuote(q: ApiQuote, jobLabel: string): Quote {
  const lines = [
    ...(q.lineItems ?? []),
    ...(q.sections ?? []).flatMap((s) => s.lineItems),
  ].map(mapLine);
  return {
    id: q.id,
    num: q.number,
    clientId: q.clientId ?? "",
    jobId: q.jobId ?? undefined,
    jobLabel,
    status: q.status,
    lines,
    gctRatePct: Number(q.gctRate),
    discountPct: Number(q.discountPct),
    depositCents: q.depositCents,
    totalCents: q.totalCents, // denormalized; API computed it via computeTotals
    createdAt: q.createdAt,
    createdLabel: dateLabel(q.createdAt, "Created "),
    validUntilLabel: q.validUntil ? dateLabel(q.validUntil, "Valid until ") : "",
  };
}

// --- Typed data functions (live API, fixture fallback) ----------------------

export async function getClients(): Promise<Client[]> {
  try {
    return (await request<ApiClientRow[]>("/clients")).map(mapClient);
  } catch {
    console.warn("[api-client] getClients: API unreachable, using fixtures");
    return fixtureClients;
  }
}

export async function getJobs(): Promise<JobSummary[]> {
  try {
    const [jobs, quotes, clients] = await Promise.all([
      request<ApiJob[]>("/jobs"),
      request<ApiQuote[]>("/quotes"),
      request<ApiClientRow[]>("/clients"),
    ]);
    const clientName = new Map(clients.map((c) => [c.id, c.name]));
    return jobs.map((j) => {
      const jobQuotes = quotes.filter((q) => q.jobId === j.id);
      return {
        id: j.id,
        name: j.name,
        clientName: clientName.get(j.clientId ?? "") ?? "Unknown",
        addressLine: j.addressLine ?? "",
        parish: j.parish ?? "",
        stage: j.stage,
        progressPct: j.progressPct,
        quoteCount: jobQuotes.length,
        valueCents: jobQuotes.reduce((sum, q) => sum + q.totalCents, 0),
      };
    });
  } catch {
    console.warn("[api-client] getJobs: API unreachable, using fixtures");
    return fixtureJobs;
  }
}

export async function getQuotes(): Promise<Quote[]> {
  try {
    const [quotes, jobs] = await Promise.all([
      request<ApiQuote[]>("/quotes"),
      request<ApiJob[]>("/jobs"),
    ]);
    const jobName = new Map(jobs.map((j) => [j.id, j.name]));
    return quotes
      .map((q) => mapQuote(q, jobName.get(q.jobId ?? "") ?? ""))
      .sort((a, b) => b.num.localeCompare(a.num));
  } catch {
    console.warn("[api-client] getQuotes: API unreachable, using fixtures");
    return fixtureQuotes.map((q) => ({ ...q, totalCents: getQuoteTotals(q).totalCents }));
  }
}

export async function getQuote(id: string): Promise<Quote | undefined> {
  try {
    const q = await request<ApiQuote>(`/quotes/${id}`);
    let jobLabel = "";
    if (q.jobId) {
      try {
        jobLabel = (await request<ApiJob>(`/jobs/${q.jobId}`)).name;
      } catch {
        /* job label is best-effort */
      }
    }
    return mapQuote(q, jobLabel);
  } catch {
    console.warn(`[api-client] getQuote(${id}): API unreachable, using fixtures`);
    const q = fixtureQuotes.find((x) => x.id === id);
    return q ? { ...q, totalCents: getQuoteTotals(q).totalCents } : undefined;
  }
}

// --- Create (write path) ----------------------------------------------------

export interface NewClientInput {
  name: string;
  phone?: string;
  parish?: string;
  addressLine?: string;
}
export async function createClient(input: NewClientInput): Promise<Client> {
  return mapClient(await apiClient.post<ApiClientRow>("/clients", input));
}

export interface NewJobInput {
  name: string;
  clientId?: string;
  addressLine?: string;
  parish?: string;
}
export async function createJob(input: NewJobInput): Promise<{ id: string }> {
  return apiClient.post<{ id: string }>("/jobs", input);
}

export interface NewQuoteLineInput {
  category: QuoteLineItemInput["category"];
  description: string;
  quantity: number;
  rateUnit: QuoteLineItemInput["rateUnit"];
  unitPriceCents: number;
  gctTreatment: QuoteLineItemInput["gctTreatment"];
}
export interface NewQuoteInput {
  clientId?: string;
  jobId?: string;
  gctRatePct: number;
  discountPct: number;
  depositCents: number;
  lineItems: NewQuoteLineInput[];
}
export async function createQuote(input: NewQuoteInput): Promise<{ id: string }> {
  return apiClient.post<{ id: string }>("/quotes", input);
}

// --- Update (write path) -----------------------------------------------------

/** PATCH /api/quotes/:id — same shape as create; providing lineItems replaces all lines. */
export type UpdateQuoteInput = NewQuoteInput;
export async function updateQuote(id: string, input: UpdateQuoteInput): Promise<{ id: string }> {
  return apiClient.patch<{ id: string }>(`/quotes/${id}`, input);
}

/** POST /api/quotes/:id/revise — creates a new DRAFT version (bumped `version`, same `number`). */
export async function reviseQuote(id: string): Promise<{ id: string }> {
  return apiClient.post<{ id: string }>(`/quotes/${id}/revise`);
}

/** POST /api/quotes/:id/status — validated status transition (see ALLOWED_TRANSITIONS). */
export async function setQuoteStatus(id: string, status: QuoteStatus): Promise<void> {
  await apiClient.post<unknown>(`/quotes/${id}/status`, { status });
}

// --- Delete (write path) -----------------------------------------------------

export async function deleteClient(id: string): Promise<void> {
  await apiClient.delete<unknown>(`/clients/${id}`);
}

export async function deleteJob(id: string): Promise<void> {
  await apiClient.delete<unknown>(`/jobs/${id}`);
}

export async function deleteQuote(id: string): Promise<void> {
  await apiClient.delete<unknown>(`/quotes/${id}`);
}

// --- Admin (platform-level, staff console) ----------------------------------

export interface AdminOverview {
  businesses: number;
  activeSubscriptions: number;
  suppliersTracked: number;
  jurisdictionsLive: number;
}
export interface AdminTenant {
  id: string;
  name: string;
  parish: string | null;
  plan: string;
  trn: string | null;
  status: string;
  createdAt: string;
  quoteCount: number;
}
export interface AdminSupplier {
  id: string;
  name: string;
  parish: string | null;
  isPartner: boolean;
  skuCount: number;
  lastFetch: string | null;
}
export interface AdminReg {
  id: string;
  title: string;
  category: string;
  summary: string;
  effectiveDate: string | null;
  sourceUrl: string | null;
  actionNeeded: string | null;
}
export interface AdminData {
  overview: AdminOverview | null;
  tenants: AdminTenant[];
  suppliers: AdminSupplier[];
  regulatory: AdminReg[];
}

/** Fetch everything the staff console shows, from the platform admin API. On
 * failure returns empty/null so the console falls back to its design sample. */
export async function getAdminData(): Promise<AdminData> {
  const safe = async <T>(path: string, empty: T): Promise<T> => {
    try {
      return await request<T>(path);
    } catch {
      return empty;
    }
  };
  const [overview, tenants, suppliers, regulatory] = await Promise.all([
    safe<AdminOverview | null>("/admin/overview", null),
    safe<AdminTenant[]>("/admin/tenants", []),
    safe<AdminSupplier[]>("/admin/suppliers", []),
    safe<AdminReg[]>("/admin/regulatory", []),
  ]);
  return { overview, tenants, suppliers, regulatory };
}

export interface CardPaymentResponse {
  checkoutUrl: string;
  reference: string;
}

/** POST /api/payments/invoices/:id/card — WiPay hosted-checkout handoff. */
export async function payInvoiceByCard(invoiceId: string): Promise<CardPaymentResponse> {
  try {
    return await apiClient.post<CardPaymentResponse>(`/payments/invoices/${invoiceId}/card`);
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 700));
    return {
      checkoutUrl: `https://checkout.wipayfinancial.com/mock/${invoiceId}`,
      reference: `WPY-MOCK-${invoiceId}`,
    };
  }
}
