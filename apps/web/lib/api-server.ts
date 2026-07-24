/**
 * Server-only API reads. Server Components and route handlers import their data
 * from here. Each request carries the logged-in user's JWT, read from the
 * httpOnly cookie via next/headers, so the API resolves the caller's own
 * business; when there's no cookie it falls back to the demo business so the
 * open demo keeps working (additive auth rollout).
 *
 * IMPORTANT: this module imports next/headers and is marked server-only — it
 * must never be imported from a client component. Client components use the
 * write functions in ./api-client.ts (which route through the /api/proxy).
 */
import "server-only";
import { cookies } from "next/headers";
import {
  API_BASE_URL,
  ApiError,
  mapBusiness,
  mapClient,
  mapMaterialFavourite,
  mapQuote,
  type ApiBusiness,
  type ApiClientRow,
  type ApiJob,
  type ApiMaterialFavourite,
  type ApiQuote,
  type AdminData,
  type AdminOverview,
  type AdminTenant,
  type AdminSupplier,
  type AdminReg,
} from "./api-client";
import type { Business, Client, MaterialFavourite, Quote } from "./types";
import type { JobSummary, JobDetail } from "./mock-data";

const TOKEN_COOKIE = "jamquote_token";
const DEMO_BUSINESS_ID = process.env.NEXT_PUBLIC_BUSINESS_ID ?? "seed-business-blackwood";

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
  parish: "" as Business["parish"],
  tradeType: "",
  addressLine: "",
  defaultGctRatePct: 15,
  countryCode: "JM",
  currency: "JMD",
};

/** Server-side GET with the caller's JWT (or the demo business fallback). */
async function serverRequest<T>(path: string): Promise<T> {
  const token = cookies().get(TOKEN_COOKIE)?.value;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["authorization"] = `Bearer ${token}`;
  else headers["x-business-id"] = DEMO_BUSINESS_ID;

  const res = await fetch(`${API_BASE_URL}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new ApiError(`Request to ${path} failed`, res.status);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function getClients(): Promise<Client[]> {
  try {
    return (await serverRequest<ApiClientRow[]>("/clients")).map(mapClient);
  } catch {
    console.warn("[api-server] getClients: API unreachable, returning empty list");
    return [];
  }
}

export async function getClient(id: string): Promise<Client | undefined> {
  try {
    return mapClient(await serverRequest<ApiClientRow>(`/clients/${id}`));
  } catch {
    console.warn(`[api-server] getClient(${id}): API unreachable, returning undefined`);
    return undefined;
  }
}

/** GET /api/business/current — the caller's own business (resolved from the JWT
 * / x-business-id fallback; see BusinessController.current). */
export async function getBusiness(): Promise<Business> {
  try {
    return mapBusiness(await serverRequest<ApiBusiness>("/business/current"));
  } catch {
    console.warn("[api-server] getBusiness: API unreachable, returning empty business");
    return EMPTY_BUSINESS;
  }
}

/** GET /api/catalogs/material-favourites — saved materials with their last
 * price. No fixture backs these, so an unreachable API returns an empty list. */
export async function getMaterialFavourites(): Promise<MaterialFavourite[]> {
  try {
    return (await serverRequest<ApiMaterialFavourite[]>("/catalogs/material-favourites")).map(
      mapMaterialFavourite,
    );
  } catch {
    console.warn("[api-server] getMaterialFavourites: API unreachable, using empty list");
    return [];
  }
}

export async function getJobs(): Promise<JobSummary[]> {
  try {
    const [jobs, quotes, clients] = await Promise.all([
      serverRequest<ApiJob[]>("/jobs"),
      serverRequest<ApiQuote[]>("/quotes"),
      serverRequest<ApiClientRow[]>("/clients"),
    ]);
    const clientName = new Map(clients.map((c) => [c.id, `${c.firstName} ${c.lastName}`.trim()]));
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
    console.warn("[api-server] getJobs: API unreachable, returning empty list");
    return [];
  }
}

export async function getJob(id: string): Promise<JobDetail | undefined> {
  try {
    const [job, clients] = await Promise.all([
      serverRequest<ApiJob>(`/jobs/${id}`),
      serverRequest<ApiClientRow[]>("/clients"),
    ]);
    const client = clients.find((c) => c.id === job.clientId);
    return {
      id: job.id,
      name: job.name,
      clientId: job.clientId ?? "",
      clientName: client ? `${client.firstName} ${client.lastName}`.trim() : "Unknown",
      addressLine: job.addressLine ?? "",
      parish: job.parish ?? "",
      stage: job.stage,
      progressPct: job.progressPct,
    };
  } catch {
    console.warn(`[api-server] getJob(${id}): API unreachable, returning undefined`);
    return undefined;
  }
}

export async function getQuotes(): Promise<Quote[]> {
  try {
    const [quotes, jobs] = await Promise.all([
      serverRequest<ApiQuote[]>("/quotes"),
      serverRequest<ApiJob[]>("/jobs"),
    ]);
    const jobName = new Map(jobs.map((j) => [j.id, j.name]));
    return quotes
      .map((q) => mapQuote(q, jobName.get(q.jobId ?? "") ?? ""))
      .sort((a, b) => b.num.localeCompare(a.num));
  } catch {
    console.warn("[api-server] getQuotes: API unreachable, returning empty list");
    return [];
  }
}

export async function getQuote(id: string): Promise<Quote | undefined> {
  try {
    const q = await serverRequest<ApiQuote>(`/quotes/${id}`);
    let jobLabel = "";
    if (q.jobId) {
      try {
        jobLabel = (await serverRequest<ApiJob>(`/jobs/${q.jobId}`)).name;
      } catch {
        /* job label is best-effort */
      }
    }
    return mapQuote(q, jobLabel);
  } catch {
    console.warn(`[api-server] getQuote(${id}): API unreachable, returning undefined`);
    return undefined;
  }
}

/** Fetch everything the staff console shows, from the platform admin API. On
 * failure each section returns empty/null independently, so the console keeps
 * rendering with whichever sections did load. */
export async function getAdminData(): Promise<AdminData> {
  const safe = async <T>(path: string, empty: T): Promise<T> => {
    try {
      return await serverRequest<T>(path);
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
