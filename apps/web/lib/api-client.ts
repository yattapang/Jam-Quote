/**
 * Client-safe API layer. Client components import the write functions here;
 * in the browser every call goes to the same-origin Next proxy
 * (/api/proxy/*, see app/api/proxy/[...path]/route.ts), which attaches the
 * logged-in user's JWT from the httpOnly cookie server-side. There is no
 * tenant fallback — a signed-out browser gets a 401 back from the proxy, and
 * `request()` below sends it to /login rather than letting the caller treat
 * the failure as "no data" (see the res.status === 401 branch). Server-side
 * READS live in ./api-server.ts, which reads the cookie directly via
 * next/headers — that file must never be imported from a client component.
 *
 * Mappers and API shapes are declared here (framework-free) and reused by
 * api-server.ts.
 */
import type { Assembly, AssemblyComponent, Business, Client, LabourRate, MaterialFavourite, Quote, QuoteLine, QuoteLineAssemblyComponent } from "./types";
import type { AssemblyComponentKind, InvoiceStatus, QuoteDetailLevel, QuoteLineItemInput, QuoteStatus, RateUnit } from "@jamquote/core";

// Server-side (RSC/route handlers) reach the API directly; the browser goes
// through the same-origin proxy so the httpOnly auth cookie is applied. Override
// the server target with API_BASE_URL / NEXT_PUBLIC_API_BASE_URL in deploy.
export const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:3001/api";

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
    // The browser's cookie expired/was cleared mid-session, or this account
    // has no business (an admin signed into the tenant app). Either way, the
    // caller's local error handling (e.g. re-enabling a submit button) is
    // about to fire, but the page underneath it is stale — send the user
    // somewhere that explains why, instead of leaving them on a screen that
    // just failed to save silently.
    if (!isServer && typeof window !== "undefined") {
      if (res.status === 401) {
        window.location.assign(`/login?expired=1&redirect=${encodeURIComponent(window.location.pathname)}`);
      } else if (res.status === 403) {
        window.location.assign("/account-required");
      }
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
  town?: string | null;
  parish?: string | null;
  addressLine?: string | null;
}
export interface ApiJob {
  id: string;
  clientId?: string | null;
  name: string;
  addressLine?: string | null;
  town?: string | null;
  parish?: string | null;
  stage: string;
  progressPct: number;
}
export interface ApiLineAssemblyComponent {
  kind: AssemblyComponentKind;
  description: string;
  // Prisma Decimal / JSON snapshot — may come over as a numeric string.
  quantityPerUnit: number | string;
  unitPriceCents: number;
}
export interface ApiLineItem {
  id: string;
  category: QuoteLineItemInput["category"];
  description: string;
  quantity: number | string;
  rateUnit: QuoteLineItemInput["rateUnit"];
  /** Display unit snapshot for how the material is sold ("bag", "sheet").
   * Falls back to rateUnit's label when unset — see QuotePdf. */
  unitLabel?: string | null;
  unitPriceCents: number;
  priceSource: QuoteLineItemInput["priceSource"];
  gctTreatment: QuoteLineItemInput["gctTreatment"];
  markupPct?: number | string | null;
  // Assembly ("job type") provenance — present only on lines built from an
  // assembly. assemblyComponents is a display-only snapshot (see
  // quotes.dto.ts quoteLineAssemblyComponentSchema).
  assemblyId?: string | null;
  assemblyName?: string | null;
  assemblyUnit?: string | null;
  assemblyComponents?: ApiLineAssemblyComponent[] | null;
}
export interface ApiMaterialFavourite {
  id: string;
  name: string;
  /** True when the contractor pinned the name rather than letting the server
   * compose it from the category's attributes (#26 Phase 2a). */
  nameCustom?: boolean | null;
  /** LEGACY free-text unit, superseded by unitId. */
  unit?: string | null;
  unitId?: string | null;
  /** The resolved MaterialUnit, included by the API on reads so the unit can
   * be rendered without a second lookup against the schema endpoint. */
  unitRef?: { id: string; key: string; label: string } | null;
  priceCents: number;
  supplierId?: string | null;
  /** LEGACY free-text category, superseded by categoryDefId. */
  category?: string | null;
  categoryDefId?: string | null;
  /** Keyed by MaterialAttributeDef.key as of 2a (was keyed by display label). */
  specs?: Record<string, string> | null;
  description?: string | null;
  measureUnit?: string | null;
  // Prisma Decimal arrives as a numeric string over JSON.
  coveragePerSellUnit?: number | string | null;
  wastePct?: number | string | null;
}

/**
 * GET /catalogs/material-schema — the attribute tree this business may use:
 * platform-curated rows plus its own additions (`custom: true`).
 */
export interface ApiMaterialAttributeOption {
  id: string;
  value: string;
  label: string;
  custom: boolean;
}
export interface ApiMaterialAttribute {
  id: string;
  key: string;
  label: string;
  kind: "ENUM" | "TEXT" | "NUMBER";
  unit?: string | null;
  required: boolean;
  includeInName: boolean;
  nameOrder: number | null;
  sort: number;
  custom: boolean;
  options: ApiMaterialAttributeOption[];
}
export interface ApiMaterialCategory {
  id: string;
  key: string;
  label: string;
  sort: number;
  custom: boolean;
  attributes: ApiMaterialAttribute[];
}
export interface ApiMaterialUnit {
  id: string;
  key: string;
  label: string;
  sort: number;
  custom: boolean;
}
export interface ApiMaterialSchema {
  categories: ApiMaterialCategory[];
  units: ApiMaterialUnit[];
}
export interface ApiLabourRate {
  id: string;
  trade: string;
  skillTier?: string | null;
  rateCents: number;
  rateUnit: RateUnit;
}
export interface ApiAssemblyComponent {
  id: string;
  kind: AssemblyComponentKind;
  materialFavouriteId?: string | null;
  labourRateId?: string | null;
  description: string;
  // Prisma Decimal comes over JSON as a numeric string for quantityPerUnit.
  quantityPerUnit: number | string;
  unitPriceCents: number;
  sort: number;
}
export interface ApiAssembly {
  id: string;
  name: string;
  unit: string;
  // Prisma Decimal comes over JSON as a numeric string, e.g. "20.00".
  markupPct: number | string;
  // Attached server-side by AssembliesService.withUnitCost via
  // computeAssemblyUnitCostCents — never computed here from stale data.
  unitCostCents: number;
  components: ApiAssemblyComponent[];
}
export interface ApiBusiness {
  id: string;
  name: string;
  countryCode?: string;
  currency?: string;
  trn?: string | null;
  addressLine?: string | null;
  town?: string | null;
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
  // Per-quote presentation setting; absent on older quotes (mapQuote defaults
  // to SUMMARY).
  detailLevel?: QuoteDetailLevel | null;
  lineItems?: ApiLineItem[];
  sections?: { title: string; lineItems: ApiLineItem[] }[];
}

/** Invoice line items share the exact persistence shape as quote line items
 * (both come from the same `quoteLineItemSchema`-shaped table columns). */
export type ApiInvoiceLineItem = ApiLineItem;
export interface ApiInvoiceSection {
  title: string;
  lineItems: ApiInvoiceLineItem[];
}
export interface ApiInvoice {
  id: string;
  businessId: string;
  clientId?: string | null;
  quoteId?: string | null;
  number: string;
  status: InvoiceStatus;
  // Prisma Decimal fields — may come over JSON as numeric strings.
  gctRate: number | string;
  discountPct: number | string;
  depositCents: number;
  terms?: string | null;
  dueDate?: string | null;
  subtotalCents: number;
  gctCents: number;
  totalCents: number;
  paidCents: number;
  createdAt: string;
  updatedAt: string;
  detailLevel?: QuoteDetailLevel | null;
  lineItems?: ApiInvoiceLineItem[];
  sections?: ApiInvoiceSection[];
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
    town: c.town ?? "",
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
    // categoryDefId + nameCustom decide whether `name` already contains the
    // spec values (see materialVariantName) — without them the quote line
    // would render them twice.
    nameCustom: m.nameCustom ?? false,
    categoryDefId: m.categoryDefId ?? undefined,
    // unitRef wins: it is the controlled-vocabulary label for 2a materials,
    // whose legacy `unit` string is null. Falling back to `unit` keeps pre-2a
    // rows rendering exactly as before.
    unit: m.unitRef?.label ?? m.unit ?? undefined,
    unitId: m.unitId ?? undefined,
    priceCents: m.priceCents,
    priceDollars: m.priceCents / 100,
    supplierId: m.supplierId ?? undefined,
    category: m.category ?? undefined,
    specs: m.specs ?? undefined,
    description: m.description ?? undefined,
  };
}

export function mapLabourRate(r: ApiLabourRate): LabourRate {
  return {
    id: r.id,
    trade: r.trade,
    skillTier: r.skillTier ?? undefined,
    rateCents: r.rateCents,
    rateDollars: r.rateCents / 100,
    rateUnit: r.rateUnit,
  };
}

export function mapAssemblyComponent(c: ApiAssemblyComponent): AssemblyComponent {
  return {
    id: c.id,
    kind: c.kind,
    materialFavouriteId: c.materialFavouriteId ?? undefined,
    labourRateId: c.labourRateId ?? undefined,
    description: c.description,
    quantityPerUnit: Number(c.quantityPerUnit),
    unitPriceCents: c.unitPriceCents,
    sort: c.sort,
  };
}

export function mapAssembly(a: ApiAssembly): Assembly {
  return {
    id: a.id,
    name: a.name,
    unit: a.unit,
    markupPct: Number(a.markupPct),
    unitCostCents: a.unitCostCents,
    components: a.components.map(mapAssemblyComponent),
  };
}

function mapLineAssemblyComponent(c: ApiLineAssemblyComponent): QuoteLineAssemblyComponent {
  return {
    kind: c.kind,
    description: c.description,
    quantityPerUnit: Number(c.quantityPerUnit),
    unitPriceCents: c.unitPriceCents,
  };
}

function mapLine(l: ApiLineItem): Quote["lines"][number] {
  return {
    id: l.id,
    category: l.category,
    description: l.description,
    quantity: Number(l.quantity),
    rateUnit: l.rateUnit,
    unitLabel: l.unitLabel ?? undefined,
    unitPriceCents: l.unitPriceCents,
    priceSource: l.priceSource,
    gctTreatment: l.gctTreatment,
    markupPct: l.markupPct == null ? undefined : Number(l.markupPct),
    assemblyId: l.assemblyId ?? undefined,
    assemblyName: l.assemblyName ?? undefined,
    assemblyUnit: l.assemblyUnit ?? undefined,
    assemblyComponents: l.assemblyComponents?.map(mapLineAssemblyComponent) ?? undefined,
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
    detailLevel: q.detailLevel ?? undefined,
    createdAt: q.createdAt,
    createdLabel: dateLabel(q.createdAt, "Created "),
    validUntil: q.validUntil ?? undefined,
    validUntilLabel: q.validUntil ? dateLabel(q.validUntil, "Valid until ") : "",
  };
}

// --- Invoices ----------------------------------------------------------------

/** Invoice line items are persisted identically to quote line items, so the
 * view shape is the same `QuoteLine` (mapped via the same `mapLine`). */
export type InvoiceLineItem = QuoteLine;
export interface InvoiceSection {
  title: string;
  lines: InvoiceLineItem[];
}
export interface Invoice {
  id: string;
  businessId: string;
  clientId?: string;
  quoteId?: string;
  num: string;
  status: InvoiceStatus;
  lines: InvoiceLineItem[];
  /** Named groupings, title preserved — `lines` above already includes every
   * section's lines flattened in (mirrors Quote.sections). */
  sections?: InvoiceSection[];
  gctRatePct: number;
  discountPct: number;
  depositCents: number;
  terms?: string;
  dueDate?: string;
  dueDateLabel: string;
  subtotalCents: number;
  gctCents: number;
  totalCents: number;
  /** Sum of recorded payments against this invoice. */
  paidCents: number;
  /** Per-invoice presentation setting, carried from the source quote. */
  detailLevel?: QuoteDetailLevel;
  createdAt: string;
  createdLabel: string;
  updatedAt: string;
}

/** Map an API invoice to the view Invoice. `lines`/`sections` are populated
 * only for detail (list rows may omit them). */
export function mapInvoice(i: ApiInvoice): Invoice {
  const lines = [
    ...(i.lineItems ?? []),
    ...(i.sections ?? []).flatMap((s) => s.lineItems),
  ].map(mapLine);
  const sections = (i.sections ?? []).map((s) => ({
    title: s.title,
    lines: s.lineItems.map(mapLine),
  }));
  return {
    id: i.id,
    businessId: i.businessId,
    clientId: i.clientId ?? undefined,
    quoteId: i.quoteId ?? undefined,
    num: i.number,
    status: i.status,
    lines,
    sections,
    gctRatePct: Number(i.gctRate),
    discountPct: Number(i.discountPct),
    depositCents: i.depositCents,
    terms: i.terms ?? undefined,
    dueDate: i.dueDate ?? undefined,
    dueDateLabel: i.dueDate ? dateLabel(i.dueDate, "Due ") : "",
    subtotalCents: i.subtotalCents,
    gctCents: i.gctCents,
    totalCents: i.totalCents,
    paidCents: i.paidCents,
    detailLevel: i.detailLevel ?? undefined,
    createdAt: i.createdAt,
    createdLabel: dateLabel(i.createdAt, "Created "),
    updatedAt: i.updatedAt,
  };
}

export function mapBusiness(b: ApiBusiness): Business {
  return {
    id: b.id,
    name: b.name,
    trn: b.trn ?? "",
    town: b.town ?? "",
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
  town?: string;
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
  town?: string;
  parish?: string;
}
export async function createJob(input: NewJobInput): Promise<{ id: string }> {
  return apiClient.post<{ id: string }>("/jobs", input);
}

export interface NewMaterialFavouriteInput {
  /** Optional as of 2a: the server composes it from the category's attributes
   * unless nameCustom is set. Only send it to pin a name. */
  name?: string;
  nameCustom?: boolean;
  unitId?: string;
  priceCents: number;
  supplierId?: string;
  categoryDefId?: string;
  /** Keyed by MaterialAttributeDef.key. */
  specs?: Record<string, string>;
  description?: string;
  measureUnit?: string;
  coveragePerSellUnit?: number;
  wastePct?: number;
  /** LEGACY free-text fields, still accepted by the API. Prefer
   * categoryDefId/unitId, which win when both are sent. */
  unit?: string;
  category?: string;
}

/** The attribute tree for the current business (curated + own additions). */
export async function fetchMaterialSchema(): Promise<ApiMaterialSchema> {
  return apiClient.get<ApiMaterialSchema>("/catalogs/material-schema");
}

/** POST /catalogs/material-schema/categories — idempotent, like createTrade:
 * a label already matching one of the curated categories or this business's
 * own returns that row (so the response can come back `custom: false`) rather
 * than creating a second one. Callers must invalidateMaterialSchema() after,
 * or the new row is missing from the picker until a page reload. */
export async function createMaterialCategory(label: string): Promise<ApiMaterialCategory> {
  return apiClient.post<ApiMaterialCategory>("/catalogs/material-schema/categories", { label });
}

/** POST /catalogs/material-schema/units — same idempotency as
 * createMaterialCategory. */
export async function createMaterialUnit(label: string): Promise<ApiMaterialUnit> {
  return apiClient.post<ApiMaterialUnit>("/catalogs/material-schema/units", { label });
}

export async function createMaterialFavourite(
  input: NewMaterialFavouriteInput,
): Promise<MaterialFavourite> {
  return mapMaterialFavourite(
    await apiClient.post<ApiMaterialFavourite>("/catalogs/material-favourites", input),
  );
}

/** GET /api/catalogs/material-favourites (client-side, via the proxy) — same
 * data as getMaterialFavourites (api-server.ts) but callable from a client
 * component, and filterable: `q` matches case-insensitively across name,
 * description and specs values (server-side — see the API contract), narrows
 * further by `category`, and `limit` caps the result count. Powers the quote
 * builder's type-ahead material picker (MaterialPickerField) and the
 * materials-page search box, both of which query as the contractor types
 * rather than filtering an already-loaded array — the point of a type-ahead
 * once there are hundreds of saved variants. The response is still a plain
 * array, just filtered. */
export async function getMaterialFavouritesClient(params?: {
  q?: string;
  /** LEGACY free-text category filter, for pre-2a rows. */
  category?: string;
  categoryDefId?: string;
  limit?: number;
}): Promise<MaterialFavourite[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.category) qs.set("category", params.category);
  if (params?.categoryDefId) qs.set("categoryDefId", params.categoryDefId);
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return (
    await apiClient.get<ApiMaterialFavourite[]>(`/catalogs/material-favourites${suffix}`)
  ).map(mapMaterialFavourite);
}

export interface NewLabourRateInput {
  trade: string;
  skillTier?: string;
  rateCents: number;
  rateUnit: RateUnit;
}
export async function createLabourRate(input: NewLabourRateInput): Promise<LabourRate> {
  return mapLabourRate(
    await apiClient.post<ApiLabourRate>("/catalogs/labour-rates", input),
  );
}

export interface NewAssemblyComponentInput {
  kind: AssemblyComponentKind;
  materialFavouriteId?: string;
  labourRateId?: string;
  description: string;
  quantityPerUnit: number;
  unitPriceCents: number;
}
export interface NewAssemblyInput {
  name: string;
  unit: string;
  markupPct?: number;
  components: NewAssemblyComponentInput[];
}
/** GET /api/assemblies (client-side, via the proxy) — this business's job
 * types, each with its components and server-computed unitCostCents. */
export async function getAssembliesClient(): Promise<Assembly[]> {
  return (await apiClient.get<ApiAssembly[]>("/assemblies")).map(mapAssembly);
}
export async function createAssembly(input: NewAssemblyInput): Promise<Assembly> {
  return mapAssembly(await apiClient.post<ApiAssembly>("/assemblies", input));
}

/** Display-only assembly component snapshot sent with an assembly-backed line
 * (mirrors the API's quoteLineAssemblyComponentSchema). */
export interface NewQuoteLineAssemblyComponentInput {
  kind: AssemblyComponentKind;
  description: string;
  quantityPerUnit: number;
  unitPriceCents: number;
}
export interface NewQuoteLineInput {
  category: QuoteLineItemInput["category"];
  description: string;
  quantity: number;
  rateUnit: QuoteLineItemInput["rateUnit"];
  unitPriceCents: number;
  gctTreatment: QuoteLineItemInput["gctTreatment"];
  /** Assembly ("job type") provenance — set only when this line was built
   * from an assembly. The snapshot keeps historical quotes stable. */
  assemblyId?: string;
  assemblyName?: string;
  assemblyUnit?: string;
  assemblyComponents?: NewQuoteLineAssemblyComponentInput[];
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
  /** Per-quote presentation setting (SUMMARY/DETAILED). Omitted → API defaults
   * to SUMMARY. Display only — never affects totals. */
  detailLevel?: QuoteDetailLevel;
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

/** PATCH /api/catalogs/labour-rates/:id — same shape as create, all fields optional. */
export type UpdateLabourRateInput = Partial<NewLabourRateInput>;
export async function updateLabourRate(
  id: string,
  input: UpdateLabourRateInput,
): Promise<LabourRate> {
  return mapLabourRate(
    await apiClient.patch<ApiLabourRate>(`/catalogs/labour-rates/${id}`, input),
  );
}

/** PATCH /api/assemblies/:id — same shape as create, all fields optional;
 * sending `components` replaces the assembly's full recipe (see
 * AssembliesService.update). */
export type UpdateAssemblyInput = Partial<NewAssemblyInput>;
export async function updateAssembly(id: string, input: UpdateAssemblyInput): Promise<Assembly> {
  return mapAssembly(await apiClient.patch<ApiAssembly>(`/assemblies/${id}`, input));
}

/** PATCH /api/business/:id — editable fields mirror updateBusinessSchema
 * (business.dto.ts). `defaultGctRatePct` is renamed to the API's
 * `defaultGctRate` on the way out — both are the same percentage unit (see
 * mapBusiness), so no numeric conversion, just a field-name translation. */
export interface UpdateBusinessInput {
  name?: string;
  trn?: string;
  addressLine?: string;
  town?: string;
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

// --- Invoices ------------------------------------------------------------

/** GET /api/invoices (client-side, via the proxy) — this business's invoices,
 * newest first. Optional filters mirror the API's query params. */
export async function getInvoices(params?: { status?: InvoiceStatus; clientId?: string }): Promise<Invoice[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.clientId) qs.set("clientId", params.clientId);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return (await apiClient.get<ApiInvoice[]>(`/invoices${suffix}`)).map(mapInvoice);
}

/** GET /api/invoices/:id (client-side, via the proxy) — invoice detail incl.
 * sections + lineItems ordered by sort. */
export async function getInvoice(id: string): Promise<Invoice> {
  return mapInvoice(await apiClient.get<ApiInvoice>(`/invoices/${id}`));
}

/** POST /api/invoices/from-quote/:quoteId — no body. Converts an ACCEPTED
 * quote into a DRAFT invoice; errors if the quote isn't ACCEPTED or has
 * already been converted (see the API's InvoicesService). */
export async function createInvoiceFromQuote(quoteId: string): Promise<{ id: string }> {
  return apiClient.post<{ id: string }>(`/invoices/from-quote/${quoteId}`);
}

/** Same line-item/section shape as quotes (see NewQuoteLineInput), plus an
 * explicit `sort` — the invoice editor sends sections/lineItems in order but
 * the API preserves them by this field rather than array position alone. */
export interface InvoiceLineItemInput extends NewQuoteLineInput {
  sort?: number;
}
/** PATCH /api/invoices/:id body — all fields optional, DRAFT only. Note the
 * API names this field `gctRatePct` on the way in even though the read side
 * returns it as `gctRate` (see ApiInvoice) — no client-side renaming needed
 * here, unlike updateBusiness. Providing `sections`/`lineItems` replaces the
 * invoice's lines in full. */
export interface UpdateInvoiceInput {
  clientId?: string;
  dueDate?: string;
  terms?: string;
  gctRatePct?: number;
  discountPct?: number;
  depositCents?: number;
  detailLevel?: QuoteDetailLevel;
  lineItems?: InvoiceLineItemInput[];
  sections?: { title: string; sort?: number; lineItems: InvoiceLineItemInput[] }[];
}
export async function updateInvoice(id: string, input: UpdateInvoiceInput): Promise<{ id: string }> {
  return apiClient.patch<{ id: string }>(`/invoices/${id}`, input);
}

/** POST /api/invoices/:id/finalize — DRAFT -> INVOICED (also flips the
 * source quote to INVOICED); irreversible, locks the invoice from editing. */
export async function finalizeInvoice(id: string): Promise<void> {
  await apiClient.post<unknown>(`/invoices/${id}/finalize`);
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

/** DELETE /api/invoices/:id — soft delete, DRAFT only. */
export async function deleteInvoice(id: string): Promise<void> {
  await apiClient.delete<unknown>(`/invoices/${id}`);
}

export async function deleteMaterialFavourite(id: string): Promise<void> {
  await apiClient.delete<unknown>(`/catalogs/material-favourites/${id}`);
}

/** DELETE /api/catalogs/labour-rates/:id — soft delete (API sets deletedAt). */
export async function deleteLabourRate(id: string): Promise<void> {
  await apiClient.delete<unknown>(`/catalogs/labour-rates/${id}`);
}

/** DELETE /api/assemblies/:id — soft delete (API sets deletedAt). */
export async function deleteAssembly(id: string): Promise<void> {
  await apiClient.delete<unknown>(`/assemblies/${id}`);
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
/** GET /admin/me — the signed-in admin's own authorization, used to gate the
 * console UI. A super-admin implicitly has every capability. */
export interface AdminMe {
  isSuperAdmin: boolean;
  capabilities: string[];
}
/** One internal staff admin (GET /admin/admins). */
export interface AdminUser {
  id: string;
  email: string | null;
  fullName: string | null;
  isSuperAdmin: boolean;
  capabilities: string[];
  createdAt: string;
}
/** One statutory payroll contribution in the effective rule-pack. Split rates
 * are null until an admin sources them. */
export interface EffectiveStatutory {
  code: string;
  label: string;
  appliesTo: string;
  employeePct: number | null;
  employerPct: number | null;
  verified: boolean;
  asOf: string | null;
}
/** GET /admin/rulepack — the effective jurisdiction pack (static core baseline
 * merged with any stored override). `overridden` is true when a DB override is
 * layered on top; code-owned values (currency, taxpayer id, regions, payment
 * rails) are always the baseline's. */
export interface EffectiveRulePack {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  taxLabel: string;
  taxLongName: string;
  defaultTaxRatePct: number;
  taxpayerIdLabel: string;
  regionLabel: string;
  regions: string[];
  paymentProviders: { code: string; label: string }[];
  statutory: EffectiveStatutory[];
  verifiedAsOf: string | null;
  sourceUrl: string | null;
  sources: string[];
  rulePackVersion: string;
  overridden: boolean;
  updatedAt: string | null;
}
export interface AdminData {
  overview: AdminOverview | null;
  tenants: AdminTenant[];
  suppliers: AdminSupplier[];
  regulatory: AdminReg[];
  financials: AdminFinancials | null;
  audit: AdminAuditEntry[];
  /** The viewing admin's own capabilities (drives which screens/actions show).
   * Defaults to no access when the API is unreachable. */
  me: AdminMe;
  /** All staff admins — only populated for admins with MANAGE_ADMINS. */
  admins: AdminUser[];
  /** The effective jurisdiction rule-pack (baseline + override); null if the
   * API was unreachable. */
  rulepack: EffectiveRulePack | null;
}

// --- Admin management writes (MANAGE_ADMINS) ---------------------------------

/** POST /admin/admins — promote an existing user (by email) to admin. Throws
 * ApiError (404) with a "must sign up first" message when no user matches. */
export async function promoteAdmin(input: {
  email: string;
  capabilities: string[];
  isSuperAdmin?: boolean;
}): Promise<AdminUser> {
  return apiClient.post<AdminUser>("/admin/admins", input);
}

/** PATCH /admin/admins/:id — update an admin's capabilities and/or super-admin. */
export async function updateAdmin(
  id: string,
  input: { capabilities?: string[]; isSuperAdmin?: boolean },
): Promise<AdminUser> {
  return apiClient.patch<AdminUser>(`/admin/admins/${id}`, input);
}

/** DELETE /admin/admins/:id — revoke a user's admin access. */
export async function revokeAdmin(id: string): Promise<{ revoked: true; userId: string }> {
  return apiClient.delete<{ revoked: true; userId: string }>(`/admin/admins/${id}`);
}

// --- Rule-pack write (MANAGE_RULEPACK) ---------------------------------------

/** The editable slice of a rule-pack. Any omitted field keeps its stored value;
 * a statutory entry may set either side to null to mean "not sourced yet". */
export interface UpdateRulePackInput {
  taxLabel?: string;
  defaultTaxRatePct?: number;
  verifiedAsOf?: string | null;
  sourceUrl?: string | null;
  statutoryRates?: Record<string, { employeePct?: number | null; employerPct?: number | null }>;
}

/** PATCH /admin/rulepack — edit the jurisdiction pack's editable slice. */
export async function updateAdminRulePack(
  input: UpdateRulePackInput,
  country = "JM",
): Promise<EffectiveRulePack> {
  return apiClient.patch<EffectiveRulePack>(`/admin/rulepack?country=${country}`, input);
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

// --- Supplier price comparison (#26 Phase 2b) --------------------------------

/** A row of this business's supplier directory (GET /catalogs/suppliers) —
 * just enough to fill a picker. Suppliers are tenant-owned: a contractor's
 * merchants are their own list, not a platform-curated one. */
export interface ApiSupplier {
  id: string;
  name: string;
  parish: string | null;
  website: string | null;
  isPartner: boolean;
}

/** One supplier's most recent observed price for a material (the API's
 * SupplierPriceView). No mapper: cents stay integer cents and `fetchedAt` stays
 * ISO precisely so the client can render it relative to now — see
 * lib/relative-time.ts. */
export interface ApiSupplierPrice {
  id: string;
  supplierId: string;
  supplierName: string;
  /** The supplier's parish. */
  location: string | null;
  priceCents: number;
  note: string | null;
  fetchedAt: string;
}

export interface NewMaterialPriceInput {
  supplierId: string;
  materialFavouriteId: string;
  priceCents: number;
  note?: string;
  /** ISO. Omit for now; send it to back-date a price quoted earlier. */
  fetchedAt?: string;
}

export interface NewSupplierInput {
  name: string;
  parish?: string;
  website?: string;
}

/** GET /catalogs/suppliers (client-side, via the proxy) — this business's
 * supplier directory, alphabetical. */
export async function getSuppliersClient(): Promise<ApiSupplier[]> {
  return apiClient.get<ApiSupplier[]>("/catalogs/suppliers");
}

/** POST /catalogs/suppliers — idempotent, like createTrade: a name already in
 * this business's directory returns that row rather than a second copy. */
export async function createSupplier(input: NewSupplierInput): Promise<ApiSupplier> {
  return apiClient.post<ApiSupplier>("/catalogs/suppliers", input);
}

/** GET /catalogs/material-prices — one row per supplier (their latest
 * observation), already sorted cheapest-first by the API. */
export async function getMaterialPrices(materialFavouriteId: string): Promise<ApiSupplierPrice[]> {
  const qs = new URLSearchParams({ materialFavouriteId });
  return apiClient.get<ApiSupplierPrice[]>(`/catalogs/material-prices?${qs.toString()}`);
}

/** POST /catalogs/material-prices — always an insert, never an upsert: this is
 * price history. The response is the raw entry row rather than a comparison
 * row, so callers re-read the comparison instead of splicing the result in. */
export async function createMaterialPrice(input: NewMaterialPriceInput): Promise<{ id: string }> {
  return apiClient.post<{ id: string }>("/catalogs/material-prices", input);
}

/** DELETE /catalogs/material-prices/:id — only your own observations; the API
 * answers 403 for a platform-curated row. */
export async function deleteMaterialPrice(id: string): Promise<void> {
  await apiClient.delete<unknown>(`/catalogs/material-prices/${id}`);
}

// --- Tenant logo (#27) ------------------------------------------------------

export interface ApiLogoMeta {
  contentType: string;
  width: number;
  height: number;
  updatedAt: string;
}

/** Metadata only, or null when no logo is set — deliberately does not pull the
 * image bytes just to answer "is there one?". */
export async function getLogoMeta(): Promise<ApiLogoMeta | null> {
  return apiClient.get<ApiLogoMeta | null>("/business/logo/meta");
}

/**
 * Uploads a logo as base64. The server sniffs the real format from the bytes
 * and rejects anything that is not PNG or JPEG, so no content-type is sent —
 * a client-declared type is exactly what an SVG would abuse.
 */
export async function uploadLogo(base64: string): Promise<ApiLogoMeta> {
  return apiClient.post<ApiLogoMeta>("/business/logo", { base64 });
}

export async function deleteLogo(): Promise<void> {
  await apiClient.delete<void>("/business/logo");
}

/** Same-origin proxy URL for rendering the logo in the browser. `v` busts the
 * 5-minute private cache after a replace, so the contractor sees the new logo
 * immediately rather than the old one. */
export function logoUrl(version?: string): string {
  return `/api/proxy/business/logo${version ? `?v=${encodeURIComponent(version)}` : ""}`;
}

/**
 * Create an invoice from scratch (no source quote).
 *
 * Deliberately has no `quoteId`: that field records that an invoice CAME FROM
 * a quote and is what `finalize` uses to flip the source quote to INVOICED.
 * Use createInvoiceFromQuote for that path — asserting the link here would
 * claim a provenance the data does not have.
 */
export interface NewInvoiceInput {
  clientId?: string;
  /** ISO date (yyyy-mm-dd is accepted; the API coerces). */
  dueDate?: string;
  terms?: string;
  gctRatePct?: number;
  discountPct?: number;
  depositCents?: number;
}
export async function createInvoice(input: NewInvoiceInput): Promise<Invoice> {
  return mapInvoice(await apiClient.post<ApiInvoice>("/invoices", input));
}
