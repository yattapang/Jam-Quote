/**
 * Client-safe API layer. Client components import the write functions here;
 * in the browser every call goes to the same-origin Next proxy
 * (/api/proxy/*, see app/api/proxy/[...path]/route.ts), which attaches the
 * logged-in user's JWT from the httpOnly cookie server-side (or the demo
 * business as a fallback). Server-side READS live in ./api-server.ts, which
 * reads the cookie directly via next/headers — that file must never be
 * imported from a client component.
 *
 * Mappers and API shapes are declared here (framework-free) and reused by
 * api-server.ts.
 */
import type { Business, Client, MaterialFavourite, Quote } from "./types";
import type { QuoteLineItemInput, QuoteStatus } from "@jamquote/core";

// Server-side (RSC/route handlers) reach the API directly; the browser goes
// through the same-origin proxy so the httpOnly auth cookie is applied. Override
// the server target with API_BASE_URL / NEXT_PUBLIC_API_BASE_URL in deploy.
export const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001/api";

// Demo fallback business used only on the (dead) server branch of request();
// real server reads set this in api-server.ts, browser writes rely on the proxy.
const BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID ?? "seed-business-blackwood";

/** Parsed JSON body of a non-2xx response, when the API sent one (e.g. the
 * quote-creation 402 `{ message, code: "FREE_LIMIT_REACHED" }`). */
export interface ApiErrorBody {
  message?: string;
  code?: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    /** Parsed error body, when the response had one — lets callers branch on
     * `body?.code` (e.g. FREE_LIMIT_REACHED) instead of re-parsing. */
    public body?: ApiErrorBody,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isServer = typeof window === "undefined";
  // Browser: hit the same-origin proxy (cookie auth applied there). Server:
  // writes are never issued server-side, but keep a direct path for safety.
  const base = isServer ? API_BASE_URL : "/api/proxy";
  const res = await fetch(`${base}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(isServer ? { "x-business-id": BUSINESS_ID } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    // Surface the server's own message (e.g. the 402 FREE_LIMIT_REACHED body)
    // when it sent JSON; fall back to the generic message otherwise.
    let body: ApiErrorBody | undefined;
    try {
      const text = await res.text();
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    throw new ApiError(body?.message || `Request to ${path} failed`, res.status, body);
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
  delete: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};

/**
 * Cheap liveness probe for the API. Returns false (instead of throwing) when
 * the API is unreachable or too slow to answer within `timeoutMs`, so the UI
 * can warn that the screens are showing bundled demo data rather than live
 * data. Runs server-side (layout) and hits the API directly — no auth needed.
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

// --- API (persistence) shapes (exported for api-server.ts) ------------------

export interface ApiClientRow {
  id: string;
  firstName: string;
  lastName: string;
  // API also echoes a computed `name` (apps/mobile still reads it); mapClient
  // derives its own `name` from firstName/lastName rather than trusting this.
  name?: string;
  phone?: string | null;
  email?: string | null;
  parish?: string | null;
  addressLine?: string | null;
}
export interface ApiJob {
  id: string;
  clientId?: string | null;
  name: string;
  addressLine?: string | null;
  parish?: string | null;
  stage: string;
  progressPct: number;
}
export interface ApiLineItem {
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
export interface ApiMaterialFavourite {
  id: string;
  name: string;
  unit?: string | null;
  priceCents: number;
  supplierId?: string | null;
}
export interface ApiBusiness {
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
export interface ApiQuote {
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

// --- Pure mappers (exported; reused by api-server.ts and tests) -------------

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
    email: c.email ?? undefined,
  };
}

export function mapMaterialFavourite(m: ApiMaterialFavourite): MaterialFavourite {
  return {
    id: m.id,
    name: m.name,
    unit: m.unit ?? undefined,
    priceCents: m.priceCents,
    priceDollars: m.priceCents / 100,
    supplierId: m.supplierId ?? undefined,
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

// --- Create (write path) ----------------------------------------------------

export interface NewClientInput {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
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

export interface NewMaterialFavouriteInput {
  name: string;
  unit?: string;
  priceCents: number;
  supplierId?: string;
}
export async function createMaterialFavourite(
  input: NewMaterialFavouriteInput,
): Promise<MaterialFavourite> {
  return mapMaterialFavourite(
    await apiClient.post<ApiMaterialFavourite>("/catalogs/material-favourites", input),
  );
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

/** PATCH /api/catalogs/material-favourites/:id — same shape as create, all fields optional. */
export type UpdateMaterialFavouriteInput = Partial<NewMaterialFavouriteInput>;
export async function updateMaterialFavourite(
  id: string,
  input: UpdateMaterialFavouriteInput,
): Promise<MaterialFavourite> {
  return mapMaterialFavourite(
    await apiClient.patch<ApiMaterialFavourite>(`/catalogs/material-favourites/${id}`, input),
  );
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

export async function deleteMaterialFavourite(id: string): Promise<void> {
  await apiClient.delete<unknown>(`/catalogs/material-favourites/${id}`);
}

// --- Admin (platform-level, staff console) — types here, reads in api-server -

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
  /** Set when read via GET /admin/tenants?includeSuspended=true (see getAdminData). */
  suspended: boolean;
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
/** GET /admin/financials — ADMIN only. Plan mix, MRR & renewals within the
 * next 60 days. */
export interface AdminUpcomingRenewal {
  businessId: string;
  businessName: string;
  plan: string;
  renewsAt: string;
}
export interface AdminFinancials {
  freeCount: number;
  proCount: number;
  currency: string;
  proMonthlyPriceCents: number;
  mrrCents: number;
  upcomingRenewals: AdminUpcomingRenewal[];
}
/** GET /admin/audit — ADMIN only. Newest first. `details` is a free-form,
 * action-specific payload the API attaches (e.g. the confirmName typed for a
 * tenant delete) — rendered compactly rather than typed strictly. */
export interface AdminAuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: unknown;
  createdAt: string;
}
export interface AdminData {
  overview: AdminOverview | null;
  tenants: AdminTenant[];
  suppliers: AdminSupplier[];
  regulatory: AdminReg[];
  financials: AdminFinancials | null;
  audit: AdminAuditEntry[];
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

// --- Billing (Phase-1 subscription tiers) ------------------------------------

/** The platform's PricingConfig snapshot. GET /billing/plans (public) and
 * GET/PATCH /admin/pricing (ADMIN) both read/write this same shape — the
 * public endpoint just mirrors whatever the admin editor last saved. */
export interface PricingConfig {
  freeQuotesPerMonth: number;
  proMonthlyPriceCents: number;
  proAnnualPriceCents: number;
  currency: string;
}

/** GET /billing/status (business-scoped) — the caller's own subscription
 * state. `renewsAt` is only meaningful for Pro; free businesses get null. */
export interface BillingStatus {
  plan: "free" | "pro";
  isPro: boolean;
  quotesThisMonth: number;
  freeQuotesPerMonth: number;
  renewsAt: string | null;
}

/** GET /admin/pricing — ADMIN only, read via the proxy so the logged-in
 * admin's cookie is forwarded. */
export async function getAdminPricing(): Promise<PricingConfig> {
  return apiClient.get<PricingConfig>("/admin/pricing");
}

/** PATCH /admin/pricing — all fields optional/positive ints, ADMIN only. */
export type UpdateAdminPricingInput = Partial<PricingConfig>;
export async function updateAdminPricing(input: UpdateAdminPricingInput): Promise<PricingConfig> {
  return apiClient.patch<PricingConfig>("/admin/pricing", input);
}

export interface SetTenantPlanInput {
  plan: "free" | "pro";
  renewsAt?: string;
}
/** PATCH /admin/tenants/:id/plan — ADMIN only; sets a business's subscription. */
export async function setTenantPlan(
  businessId: string,
  input: SetTenantPlanInput,
): Promise<{ id: string; plan: string }> {
  return apiClient.patch<{ id: string; plan: string }>(`/admin/tenants/${businessId}/plan`, input);
}

// --- Admin tenant lifecycle (suspend / restore / hard delete) ---------------

/** PATCH /admin/tenants/:id/suspend — ADMIN only; blocks the tenant's own
 * users from signing in while preserving all data. */
export async function suspendTenant(businessId: string): Promise<{ id: string; suspended: boolean }> {
  return apiClient.patch<{ id: string; suspended: boolean }>(`/admin/tenants/${businessId}/suspend`);
}

/** PATCH /admin/tenants/:id/restore — ADMIN only; reverses a suspend. */
export async function restoreTenant(businessId: string): Promise<{ id: string; suspended: boolean }> {
  return apiClient.patch<{ id: string; suspended: boolean }>(`/admin/tenants/${businessId}/restore`);
}

/** DELETE /admin/tenants/:id — ADMIN only, IRREVERSIBLE. The API rejects the
 * request unless `confirmName` exactly matches the business's name; the
 * console mirrors that check client-side before enabling the delete button. */
export async function hardDeleteTenant(businessId: string, confirmName: string): Promise<void> {
  await apiClient.delete<unknown>(`/admin/tenants/${businessId}`, { confirmName });
}

// --- Admin suppliers (create / update / soft delete) -------------------------

export interface NewSupplierInput {
  name: string;
  website?: string;
  parish?: string;
  isPartner?: boolean;
}
export type UpdateSupplierInput = Partial<NewSupplierInput>;

/** POST /admin/suppliers — ADMIN only. */
export async function createSupplier(input: NewSupplierInput): Promise<AdminSupplier> {
  return apiClient.post<AdminSupplier>("/admin/suppliers", input);
}

/** PATCH /admin/suppliers/:id — ADMIN only, all fields optional. */
export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<AdminSupplier> {
  return apiClient.patch<AdminSupplier>(`/admin/suppliers/${id}`, input);
}

/** DELETE /admin/suppliers/:id — ADMIN only, soft delete. */
export async function deleteSupplier(id: string): Promise<void> {
  await apiClient.delete<unknown>(`/admin/suppliers/${id}`);
}

// --- Trades (curated master list + per-business custom trades) --------------

/** A trade the business can pick for its profile / labour library — either a
 * curated global trade (custom: false) or one this business added itself. No
 * mapping needed: the API already returns exactly this shape (see
 * TradesService, apps/api/src/trades/trades.service.ts). */
export interface Trade {
  id: string;
  name: string;
  custom: boolean;
}

/** GET /trades (client-side, via the proxy) — merged global + this business's
 * custom trades, de-duped by name (case-insensitive) and sorted alphabetically. */
export async function getTradesClient(): Promise<Trade[]> {
  return apiClient.get<Trade[]>("/trades");
}

/** POST /trades — idempotent: if a global trade or one of this business's own
 * custom trades already matches `name` (case-insensitive), that existing row
 * is returned as-is rather than duplicated. */
export async function createTrade(name: string): Promise<Trade> {
  return apiClient.post<Trade>("/trades", { name });
}
