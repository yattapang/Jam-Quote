/**
 * Server-only API reads. Server Components and route handlers import their data
 * from here. Each request carries the logged-in user's JWT, read from the
 * httpOnly cookie via next/headers, so the API resolves the caller's own
 * business. There is no tenant fallback anymore: a missing/expired/invalid
 * token gets a 401 from the API, and a valid token with no business (an admin
 * account) or a suspended business gets a 403 — both are handled explicitly
 * below by redirecting rather than letting the page render as an empty list
 * (see redirectOnAuthError).
 *
 * IMPORTANT: this module imports next/headers and is marked server-only — it
 * must never be imported from a client component. Client components use the
 * write functions in ./api-client.ts (which route through the /api/proxy).
 */
import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  API_BASE_URL,
  ApiError,
  mapJob,
  mapBusiness,
  mapClient,
  mapInvoice,
  mapLabourRate,
  mapEquipmentItem,
  mapMaterialFavourite,
  mapQuote,
  type ApiJob,
  type ApiBusiness,
  type ApiClientRow,
  type ApiInvoice,
  type ApiProject,
  type ApiLabourRate,
  type ApiEquipmentItem,
  type ApiMaterialFavourite,
  type ApiQuote,
  type Invoice,
  type AdminData,
  type AdminOverview,
  type AdminTenant,
  type AdminSupplier,
  type AdminReg,
  type AdminFinancials,
  type AdminAuditEntry,
  type AdminMe,
  type AdminUser,
  type EffectiveRulePack,
  type BillingStatus,
  type PricingConfig,
  type ApiRegulatoryUpdate,
  type Trade,
  type ApiMaterialSchema,
  type ApiHiddenCatalogEntry,
} from "./api-client";
import type { Job, Business, Client, EquipmentItem, LabourRate, MaterialFavourite, Quote } from "./types";
import type { ProjectSummary, ProjectDetail } from "./mock-data";
import type { InvoiceStatus, ReportsSummary } from "@jamquote/core";
import { IMPERSONATION_COOKIE } from "./session";

const TOKEN_COOKIE = "jamquote_token";

/**
 * getBusiness()'s failure fallback. NOT a data fixture — it carries no
 * identity a user could mistake for a real business (blank name/TRN/address),
 * it just keeps pages that read `business.*` (dashboard header, quote GCT
 * rate, settings) rendering instead of throwing when the API is briefly
 * unreachable. See DemoDataBanner for the user-facing "can't reach the
 * server" notice.
 */
const EMPTY_BUSINESS: Business = {
  id: "",
  name: "",
  trn: "",
  town: "",
  parish: "" as Business["parish"],
  tradeType: "",
  addressLine: "",
  defaultGctRatePct: 15,
  countryCode: "JM",
  currency: "JMD",
};

/** Server-side GET with the caller's JWT. No token means no auth header at
 * all — the API's TenantAuthGuard rejects that with 401, same as an
 * expired/invalid token, which redirectOnAuthError below turns into a
 * redirect to /login rather than an empty page.
 *
 * When an impersonation cookie is present (an admin is "viewing as" a
 * tenant), it's preferred over the admin's own token — EXCEPT for `/admin`
 * paths, which always use the admin's own token. The API deliberately
 * refuses impersonation tokens on admin routes, so without this carve-out
 * the admin console would 403 the moment someone started a view-as session,
 * including the console page holding the button they'd use to get out.
 * Both identities being live at once (the admin's own cookie AND the
 * impersonation cookie) is intentional and safe: the impersonation token is
 * read-only and scoped to that one tenant. */
async function serverRequest<T>(path: string): Promise<T> {
  const jar = cookies();
  const ownToken = jar.get(TOKEN_COOKIE)?.value;
  const impersonationToken = jar.get(IMPERSONATION_COOKIE)?.value;
  const token = impersonationToken && !path.startsWith("/admin") ? impersonationToken : ownToken;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { headers, cache: "no-store" });
  if (!res.ok) {
    // Surface the API's own message (e.g. "requires a business account")
    // when it sent JSON, so redirectOnAuthError can pass it along.
    let body: { message?: string } | undefined;
    try {
      const text = await res.text();
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }
    throw new ApiError(body?.message || `Request to ${path} failed`, res.status, body);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * Central handling for a caught serverRequest() error, called at the top of
 * every getX() catch block (except the admin-console reads, which have their
 * own per-section fallback and their own auth gate on /admin's layout).
 *
 * - 401 (no/expired/invalid token): the cookie is gone or stale — send the
 *   user to sign in again rather than letting the page render as "no data."
 * - 403 (valid token, no usable business — always an admin account per the
 *   API's TenantAuthGuard, or a suspended business): send them to a page that
 *   explains it, instead of a blank screen that looks broken.
 * - anything else (network error, 5xx, timeout): not an auth problem: leave
 *   it to the caller's existing empty-list/undefined fallback, which is
 *   surfaced separately by DemoDataBanner ("can't reach the server").
 *
 * Calling redirect() here (inside the caller's catch block, not nested inside
 * another try) is safe: Next's redirect() throws a special NEXT_REDIRECT
 * error that must propagate uncaught, and this function isn't wrapped in a
 * try of its own, so it does.
 */
function redirectOnAuthError(err: unknown): void {
  if (!(err instanceof ApiError)) return;
  if (err.status === 401) {
    redirect("/login?expired=1");
  }
  if (err.status === 403) {
    redirect(`/account-required?reason=${encodeURIComponent(err.message)}`);
  }
}

export async function getClients(): Promise<Client[]> {
  try {
    return (await serverRequest<ApiClientRow[]>("/clients")).map(mapClient);
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getClients: API unreachable, returning empty list");
    return [];
  }
}

export async function getClient(id: string): Promise<Client | undefined> {
  try {
    return mapClient(await serverRequest<ApiClientRow>(`/clients/${id}`));
  } catch (err) {
    redirectOnAuthError(err);
    console.warn(`[api-server] getClient(${id}): API unreachable, returning undefined`);
    return undefined;
  }
}

/** GET /api/business/current — the caller's own business (resolved from the
 * caller's JWT; see BusinessController.current). */
export async function getBusiness(): Promise<Business> {
  try {
    return mapBusiness(await serverRequest<ApiBusiness>("/business/current"));
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getBusiness: API unreachable, returning empty business");
    return EMPTY_BUSINESS;
  }
}

/** GET /api/catalogs/material-favourites — saved materials with their last
 * price. Optional `q`/`category`/`limit` mirror the API's filter params (`q`
 * matches case-insensitively across name, description and specs values) —
 * omit them for the unfiltered full list, which is what every current page
 * (materials, quote builder, jobs) passes server-side; client
 * components that need to filter as the user types use
 * getMaterialFavouritesClient (api-client.ts) instead, since a browser must
 * go through the same-origin proxy. No fixture backs these, so an
 * unreachable API returns an empty list. */
export async function getMaterialFavourites(params?: {
  q?: string;
  category?: string;
  limit?: number;
  /** Settings only — a hidden material must still be listed there to be
   * restored. Everywhere else hidden means absent from the pickers. */
  includeHidden?: boolean;
}): Promise<MaterialFavourite[]> {
  try {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.category) qs.set("category", params.category);
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.includeHidden) qs.set("includeHidden", "true");
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return (
      await serverRequest<ApiMaterialFavourite[]>(`/catalogs/material-favourites${suffix}`)
    ).map(mapMaterialFavourite);
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getMaterialFavourites: API unreachable, using empty list");
    return [];
  }
}

/** GET /api/catalogs/labour-rates — the business's labour rate book. No
 * fixture backs these, so an unreachable API returns an empty list (same
 * convention as getMaterialFavourites). */
export async function getLabourRates(includeHidden = false): Promise<LabourRate[]> {
  try {
    const suffix = includeHidden ? "?includeHidden=true" : "";
    return (await serverRequest<ApiLabourRate[]>(`/catalogs/labour-rates${suffix}`)).map(mapLabourRate);
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getLabourRates: API unreachable, using empty list");
    return [];
  }
}

/** GET /api/catalogs/equipment — the business's equipment library (owned plant
 * and hire items). Same unreachable-API convention as its siblings: an empty
 * list rather than a thrown page. */
export async function getEquipment(includeHidden = false): Promise<EquipmentItem[]> {
  try {
    const suffix = includeHidden ? "?includeHidden=true" : "";
    return (await serverRequest<ApiEquipmentItem[]>(`/catalogs/equipment${suffix}`)).map(mapEquipmentItem);
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getEquipment: API unreachable, using empty list");
    return [];
  }
}

/** GET /api/jobs — the business's job-type library (each with its
 * components and server-computed unitCostCents). No fixture backs these, so
 * an unreachable API returns an empty list (same convention as
 * getMaterialFavourites/getLabourRates). */
export async function getJobs(): Promise<Job[]> {
  try {
    return (await serverRequest<ApiJob[]>("/jobs")).map(mapJob);
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getJobs: API unreachable, using empty list");
    return [];
  }
}

export async function getProjects(): Promise<ProjectSummary[]> {
  try {
    const [projects, quotes, clients] = await Promise.all([
      serverRequest<ApiProject[]>("/projects"),
      serverRequest<ApiQuote[]>("/quotes"),
      serverRequest<ApiClientRow[]>("/clients"),
    ]);
    const clientName = new Map(clients.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));
    return projects.map((j) => {
      const projectQuotes = quotes.filter((q) => q.projectId === j.id);
      return {
        id: j.id,
        name: j.name,
        clientName: clientName.get(j.clientId ?? "") ?? "Unknown",
        addressLine: j.addressLine ?? "",
        parish: j.parish ?? "",
        stage: j.stage,
        progressPct: j.progressPct,
        quoteCount: projectQuotes.length,
        valueCents: projectQuotes.reduce((sum, q) => sum + q.totalCents, 0),
      };
    });
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getProjects: API unreachable, returning empty list");
    return [];
  }
}

export async function getProject(id: string): Promise<ProjectDetail | undefined> {
  try {
    const [project, clients] = await Promise.all([
      serverRequest<ApiProject>(`/projects/${id}`),
      serverRequest<ApiClientRow[]>("/clients"),
    ]);
    const client = clients.find((c) => c.id === project.clientId);
    return {
      id: project.id,
      name: project.name,
      clientId: project.clientId ?? "",
      clientName: client ? `${client.firstName} ${client.lastName}`.trim() : "Unknown",
      town: project.town ?? "",
      addressLine: project.addressLine ?? "",
      parish: project.parish ?? "",
      stage: project.stage,
      progressPct: project.progressPct,
    };
  } catch (err) {
    redirectOnAuthError(err);
    console.warn(`[api-server] getProject(${id}): API unreachable, returning undefined`);
    return undefined;
  }
}

export async function getQuotes(): Promise<Quote[]> {
  try {
    const [quotes, projects] = await Promise.all([
      serverRequest<ApiQuote[]>("/quotes"),
      serverRequest<ApiProject[]>("/projects"),
    ]);
    const jobName = new Map(projects.map((j) => [j.id, j.name]));
    return quotes
      .map((q) => mapQuote(q, jobName.get(q.projectId ?? "") ?? ""))
      .sort((a, b) => b.num.localeCompare(a.num));
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getQuotes: API unreachable, returning empty list");
    return [];
  }
}

export async function getQuote(id: string): Promise<Quote | undefined> {
  try {
    const q = await serverRequest<ApiQuote>(`/quotes/${id}`);
    let projectLabel = "";
    if (q.projectId) {
      try {
        projectLabel = (await serverRequest<ApiProject>(`/projects/${q.projectId}`)).name;
      } catch {
        /* job label is best-effort */
      }
    }
    return mapQuote(q, projectLabel);
  } catch (err) {
    redirectOnAuthError(err);
    console.warn(`[api-server] getQuote(${id}): API unreachable, returning undefined`);
    return undefined;
  }
}

/** GET /api/invoices (server-side read) — this business's invoices, newest
 * first. Optional filters mirror the API's query params. */
export async function getInvoices(params?: { status?: InvoiceStatus; clientId?: string }): Promise<Invoice[]> {
  try {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.clientId) qs.set("clientId", params.clientId);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return (await serverRequest<ApiInvoice[]>(`/invoices${suffix}`)).map(mapInvoice);
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getInvoices: API unreachable, returning empty list");
    return [];
  }
}

/** GET /api/invoices/:id (server-side read) — invoice detail incl. sections
 * + lineItems ordered by sort. */
export async function getInvoice(id: string): Promise<Invoice | undefined> {
  try {
    return mapInvoice(await serverRequest<ApiInvoice>(`/invoices/${id}`));
  } catch (err) {
    redirectOnAuthError(err);
    console.warn(`[api-server] getInvoice(${id}): API unreachable, returning undefined`);
    return undefined;
  }
}

/**
 * getReports()'s failure fallback — same rationale as EMPTY_BUSINESS: every
 * count/cents field is zero and every list is empty rather than throwing, so
 * the Reports page renders its normal empty state instead of crashing when
 * the API is briefly unreachable. `range` still reflects what was requested
 * so the page's period label stays consistent with the (empty) data shown.
 */
function emptyReportsSummary(fromIso: string, toIso: string): ReportsSummary {
  return {
    range: { fromIso, toIso },
    quotes: { sentCount: 0, sentValueCents: 0, acceptedCount: 0, acceptedValueCents: 0, winRatePct: 0 },
    revenue: { invoicedCents: 0, collectedCents: 0 },
    receivables: { totalOutstandingCents: 0, totalOverdueCents: 0, outstandingByClient: [] },
    salesByMonth: [],
    projects: {
      projectsCreated: 0,
      projectsByStage: { QUOTED: 0, WON: 0, IN_PROGRESS: 0, COMPLETE: 0, CANCELLED: 0 },
      topClientsByProjects: [],
    },
  };
}

/** GET /reports?from=&to= (server-side read) — the Reports page's single data
 * source, computed by @jamquote/core's computeReportsSummary from raw rows.
 * `from`/`to` are optional ISO instants; omit both to let the API default to
 * the current Jamaica-local calendar month. */
export async function getReports(from?: string, to?: string): Promise<ReportsSummary> {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  try {
    return await serverRequest<ReportsSummary>(`/reports${suffix}`);
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getReports: API unreachable, returning empty summary");
    const now = new Date().toISOString();
    return emptyReportsSummary(from ?? now, to ?? now);
  }
}

/** GET /trades (server-side read) — merged global + this business's custom
 * trades, for populating TradeSelectField from a server component (e.g. the
 * settings page passing the list into EditBusinessButton). Returns an empty
 * list (rather than throwing) when the API is unreachable — the picker still
 * works as a plain free-text field in that case.
 *
 * `includeHidden` also returns trades this business has hidden (Phase 3) —
 * omit it (or pass false) for every normal picker; the "Catalog &
 * vocabulary" settings screen is the one caller that passes true, since a
 * hidden trade must stay visible THERE to be restorable. */
export async function getTrades(includeHidden = false): Promise<Trade[]> {
  try {
    const suffix = includeHidden ? "?includeHidden=true" : "";
    return await serverRequest<Trade[]>(`/trades${suffix}`);
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getTrades: API unreachable, returning empty list");
    return [];
  }
}

/** GET /catalogs/material-schema (server-side read) — the category/unit tree
 * for the "Catalog & vocabulary" settings screen. `includeHidden=true`
 * returns rows this business has hidden as well, so they can be shown
 * (muted) and restored — without it a hidden entry would vanish from the
 * list with no way back. Returns empty categories/units (rather than
 * throwing) when the API is unreachable, same convention as getTrades. */
export async function getMaterialSchema(includeHidden = false): Promise<ApiMaterialSchema> {
  try {
    const suffix = includeHidden ? "?includeHidden=true" : "";
    return await serverRequest<ApiMaterialSchema>(`/catalogs/material-schema${suffix}`);
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getMaterialSchema: API unreachable, returning empty schema");
    return { categories: [], units: [] };
  }
}

/** GET /catalogs/hidden (server-side read) — the flat list of catalog rows
 * (material categories, material units, trades) this business has hidden,
 * for the "Catalog & vocabulary" settings screen to mark which rows in the
 * includeHidden=true lists above are currently off. Returns an empty list
 * (rather than throwing) when the API is unreachable — the screen then shows
 * every row as visible, which is a safe under-approximation. */
export async function getHiddenCatalog(): Promise<ApiHiddenCatalogEntry[]> {
  try {
    return await serverRequest<ApiHiddenCatalogEntry[]>("/catalogs/hidden");
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getHiddenCatalog: API unreachable, returning empty list");
    return [];
  }
}

/** GET /billing/plans (public) — the platform's current PricingConfig, used
 * by the settings page to show the Pro price. Returns null (rather than
 * throwing) when the API is unreachable, same convention as getAdminData. */
export async function getBillingPlans(): Promise<PricingConfig | null> {
  try {
    return await serverRequest<PricingConfig>("/billing/plans");
  } catch {
    console.warn("[api-server] getBillingPlans: API unreachable, returning null");
    return null;
  }
}

/** GET /billing/status (business-scoped) — the caller's own plan, usage and
 * renewal date. Returns null when the API is unreachable. */
export async function getBillingStatus(): Promise<BillingStatus | null> {
  try {
    return await serverRequest<BillingStatus>("/billing/status");
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getBillingStatus: API unreachable, returning null");
    return null;
  }
}

/** GET /regulatory — the published regulatory feed the dashboard card shows.
 * No fixture backs these, so an unreachable API returns an empty list and the
 * card renders its empty state (same convention as getLabourRates). */
export async function getRegulatoryUpdates(): Promise<ApiRegulatoryUpdate[]> {
  try {
    return await serverRequest<ApiRegulatoryUpdate[]>("/regulatory");
  } catch (err) {
    redirectOnAuthError(err);
    console.warn("[api-server] getRegulatoryUpdates: API unreachable, returning empty list");
    return [];
  }
}

/** Fetch everything the staff console shows, from the platform admin API. On
 * failure each section returns empty/null independently, so the console keeps
 * rendering with whichever sections did load. */
export async function getAdminData(): Promise<AdminData> {
  // Which sections failed to load. The console used to be unable to tell a
  // section that returned NOTHING from one that FAILED, and papered over both
  // with design-mock rows. With the mocks gone the ambiguity would be just as
  // misleading in the other direction — a failed tenant fetch would render
  // "No tenants yet" — so failures are now recorded and surfaced.
  const failed: string[] = [];
  const safe = async <T>(path: string, empty: T): Promise<T> => {
    try {
      return await serverRequest<T>(path);
    } catch {
      failed.push(path);
      return empty;
    }
  };
  const [overview, tenants, suppliers, regulatory, financials, audit, me, admins, rulepack] = await Promise.all([
    safe<AdminOverview | null>("/admin/overview", null),
    // includeSuspended=true so suspended tenants still show (with their
    // `suspended` flag) rather than disappearing from the tenants table.
    safe<AdminTenant[]>("/admin/tenants?includeSuspended=true", []),
    safe<AdminSupplier[]>("/admin/suppliers", []),
    safe<AdminReg[]>("/admin/regulatory", []),
    // Capability-gated on the API: a non-VIEW_FINANCIALS admin gets 403, which
    // safe() turns into null — the console simply hides the Financials screen.
    safe<AdminFinancials | null>("/admin/financials", null),
    safe<AdminAuditEntry[]>("/admin/audit", []),
    // The viewer's own authorization — drives which screens/actions render.
    safe<AdminMe>("/admin/me", { isSuperAdmin: false, capabilities: [] }),
    // Only admins with MANAGE_ADMINS get a list here (others get 403 → []).
    safe<AdminUser[]>("/admin/admins", []),
    // Effective jurisdiction rule-pack (any admin can read); null if unreachable.
    safe<EffectiveRulePack | null>("/admin/rulepack", null),
  ]);
  // Cap the audit feed the console renders, even if the API ever returns more.
  return { overview, tenants, suppliers, regulatory, financials, audit: audit.slice(0, 100), me, admins, rulepack, failed };
}

/**
 * Fetches the tenant's logo as raw bytes for embedding in a PDF (#27).
 *
 * Separate from serverRequest because that one assumes a JSON body. Returns
 * null on ANY failure — a missing or unreachable logo must never stop a quote
 * from rendering, so the document falls back to the business name as text.
 */
export async function getLogoBytes(): Promise<{ data: Buffer; contentType: string } | null> {
  try {
    const token = cookies().get(TOKEN_COOKIE)?.value;
    if (!token) return null;
    const res = await fetch(`${API_BASE_URL}/business/logo`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    // 404 is the normal "no logo set" case, not an error worth logging.
    if (!res.ok) return null;
    return {
      data: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "image/png",
    };
  } catch {
    return null;
  }
}
