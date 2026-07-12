/**
 * Single chokepoint for talking to apps/api. Screens call the typed data
 * functions here (getClients, getQuotes, getQuote, getJobs) instead of
 * importing mock data. Each fetches from the live NestJS API and maps the
 * persistence shape to the view types; if the API is unreachable it falls back
 * to the shared @jamquote/core fixtures (same data) so the preview never breaks.
 */
import type { Business, Client, Quote } from "./types";
import type { QuoteLineItemInput, QuoteStatus } from "@jamquote/core";
import { getQuoteTotals } from "./quote-totals";
import {
  clients as fixtureClients,
  quotes as fixtureQuotes,
  jobs as fixtureJobs,
  fixtureBusiness,
  findJobDetail,
  type JobSummary,
  type JobDetail,
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
  firstName: string;
  lastName: string;
  // API also echoes a computed `name` (apps/mobile still reads it); mapClient
  // derives its own `name` from firstName/lastName rather than trusting this.
  name?: string;
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
interface ApiBusiness {
  id: string;
  name: string;
  countryCode?: string;
  currency?: string;
  trn?: string | null;
  addressLine?: string | null;
  parish?: string | null;
  tradeType?: string | null;
  // Prisma Decimal comes over JSON as a numeric string, e.g. "15.00".
  defaultGctRate: number | string;
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
  sections?: { title: string; lineItems: ApiLineItem[] }[];
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
  const name = `${c.firstName} ${c.lastName}`.trim();
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    name,
    initials: initialsOf(name),
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

/** Map an API quote to the view Quote. `lines`/`sections` are populated only for detail. */
export function mapQuote(q: ApiQuote, jobLabel: string): Quote {
  const lines = [
    ...(q.lineItems ?? []),
    ...(q.sections ?? []).flatMap((s) => s.lineItems),
  ].map(mapLine);
  const sections = (q.sections ?? []).map((s) => ({
    title: s.title,
    lines: s.lineItems.map(mapLine),
  }));
  return {
    id: q.id,
    num: q.number,
    clientId: q.clientId ?? "",
    jobId: q.jobId ?? undefined,
    jobLabel,
    status: q.status,
    lines,
    sections,
    gctRatePct: Number(q.gctRate),
    discountPct: Number(q.discountPct),
    depositCents: q.depositCents,
    totalCents: q.totalCents, // denormalized; API computed it via computeTotals
    createdAt: q.createdAt,
    createdLabel: dateLabel(q.createdAt, "Created "),
    validUntil: q.validUntil ?? undefined,
    validUntilLabel: q.validUntil ? dateLabel(q.validUntil, "Valid until ") : "",
  };
}

export function mapBusiness(b: ApiBusiness): Business {
  return {
    id: b.id,
    name: b.name,
    trn: b.trn ?? "",
    parish: (b.parish ?? "") as Business["parish"],
    tradeType: b.tradeType ?? "",
    addressLine: b.addressLine ?? "",
    // Business.defaultGctRate is a Decimal already stored as a PERCENTAGE
    // (e.g. 15 means 15%, validated 0-100 by updateBusinessSchema and used
    // directly as gctRatePct in quotes.service) — so this is a plain
    // Number() cast, no *100/÷100 conversion.
    defaultGctRatePct: Number(b.defaultGctRate),
    countryCode: b.countryCode ?? "JM",
    currency: b.currency ?? "JMD",
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

export async function getClient(id: string): Promise<Client | undefined> {
  try {
    return mapClient(await request<ApiClientRow>(`/clients/${id}`));
  } catch {
    console.warn(`[api-client] getClient(${id}): API unreachable, using fixtures`);
    return fixtureClients.find((c) => c.id === id);
  }
}

/** GET /api/business/current — the caller's own business (resolved from the
 * x-business-id header; see BusinessController.current). */
export async function getBusiness(): Promise<Business> {
  try {
    return mapBusiness(await request<ApiBusiness>("/business/current"));
  } catch {
    console.warn("[api-client] getBusiness: API unreachable, using fixture");
    return fixtureBusiness;
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

export async function getJob(id: string): Promise<JobDetail | undefined> {
  try {
    const [job, clients] = await Promise.all([
      request<ApiJob>(`/jobs/${id}`),
      request<ApiClientRow[]>("/clients"),
    ]);
    return {
      id: job.id,
      name: job.name,
      clientId: job.clientId ?? "",
      clientName: clients.find((c) => c.id === job.clientId)?.name ?? "Unknown",
      addressLine: job.addressLine ?? "",
      parish: job.parish ?? "",
      stage: job.stage,
      progressPct: job.progressPct,
    };
  } catch {
    console.warn(`[api-client] getJob(${id}): API unreachable, using fixtures`);
    return findJobDetail(id);
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
  firstName: string;
  lastName?: string;
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
  /** ISO date the quote stops being valid; the API auto-expires SENT/VIEWED
   * quotes past this date (see quote-expiry.service.ts). */
  validUntil?: string;
  lineItems: NewQuoteLineInput[];
  /** Named groupings of line items rendered under their own heading. `sort`
   * is the section's position — the quote builder sets it to the heading's
   * first-appearance order across the line list. */
  sections?: { title: string; sort?: number; lineItems: NewQuoteLineInput[] }[];
}
export async function createQuote(input: NewQuoteInput): Promise<{ id: string }> {
  return apiClient.post<{ id: string }>("/quotes", input);
}

// --- Update (write path) -----------------------------------------------------

/** PATCH /api/clients/:id — same shape as create, all fields optional. */
export type UpdateClientInput = Partial<NewClientInput>;
export async function updateClient(id: string, input: UpdateClientInput): Promise<Client> {
  return mapClient(await apiClient.patch<ApiClientRow>(`/clients/${id}`, input));
}

/** PATCH /api/jobs/:id — same shape as create, all fields optional. */
export type UpdateJobInput = Partial<NewJobInput>;
export async function updateJob(id: string, input: UpdateJobInput): Promise<{ id: string }> {
  return apiClient.patch<{ id: string }>(`/jobs/${id}`, input);
}

/** PATCH /api/business/:id — editable fields mirror updateBusinessSchema
 * (business.dto.ts). `defaultGctRatePct` is renamed to the API's
 * `defaultGctRate` on the way out — both are the same percentage unit (see
 * mapBusiness), so no numeric conversion, just a field-name translation. */
export interface UpdateBusinessInput {
  name?: string;
  trn?: string;
  addressLine?: string;
  parish?: string;
  tradeType?: string;
  defaultGctRatePct?: number;
}
export async function updateBusiness(id: string, input: UpdateBusinessInput): Promise<{ id: string }> {
  const { defaultGctRatePct, ...rest } = input;
  const body = defaultGctRatePct === undefined ? rest : { ...rest, defaultGctRate: defaultGctRatePct };
  return apiClient.patch<{ id: string }>(`/business/${id}`, body);
}

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
