import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClient,
  createInvoiceFromQuote,
  createJob,
  createMaterialCategory,
  createMaterialFavourite,
  createMaterialPrice,
  createMaterialUnit,
  createQuote,
  createSupplier,
  deleteClient,
  deleteInvoice,
  deleteJob,
  deleteMaterialFavourite,
  deleteMaterialPrice,
  deleteQuote,
  finalizeInvoice,
  getMaterialFavouritesClient,
  getMaterialPrices,
  getSuppliersClient,
  initialsOf,
  mapBusiness,
  mapClient,
  mapInvoice,
  mapMaterialFavourite,
  mapQuote,
  reviseQuote,
  setQuoteStatus,
  updateBusiness,
  updateClient,
  updateInvoice,
  updateJob,
  updateMaterialFavourite,
  updateQuote,
} from "./api-client";
// Reads moved to the server-only module; mock its server guards so the fetch/
// mapping behaviour can still be unit-tested here (vitest runs under node, so
// the write path below still exercises request()'s isServer branch, which no
// longer attaches any auth header at all — see api-client.ts). The next/headers
// mock exposes a settable token so getX() tests can assert both the
// signed-out (no auth header) and signed-in (Authorization: Bearer <token>)
// cases against lib/api-server.ts's serverRequest().
const { getMockToken, setMockToken } = vi.hoisted(() => {
  let token: string | undefined;
  return {
    getMockToken: () => token,
    setMockToken: (t: string | undefined) => {
      token = t;
    },
  };
});
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => (getMockToken() ? { value: getMockToken() } : undefined) }),
}));
import {
  getBusiness,
  getClient,
  getClients,
  getInvoice,
  getInvoices,
  getJob,
  getJobs,
  getMaterialFavourites,
  getQuote,
  getQuotes,
} from "./api-server";
import { GctTreatment, LineCategory, QuoteStatus, RateUnit } from "@jamquote/core";

// --- fetch mock ------------------------------------------------------------

type Routes = Record<string, unknown>;

function stubFetch(routes: Routes | null) {
  const spy = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    if (routes === null) throw new Error("network down");
    const path = String(url).replace(/^.*\/api/, "");
    const exact = routes[path];
    const prefixKey = Object.keys(routes).find((k) => path.startsWith(k));
    const body = exact ?? (prefixKey ? routes[prefixKey] : undefined);
    if (body === undefined) {
      return { ok: false, status: 404, text: async () => "" } as unknown as Response;
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(body) } as unknown as Response;
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  setMockToken(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setMockToken(undefined);
});

const apiClientRow = {
  id: "cl-basil-reid",
  firstName: "Basil",
  lastName: "Reid",
  name: "Basil Reid",
  phone: "876 402 8811",
  email: "basil.reid@example.com",
  parish: "St. Catherine",
  addressLine: "Lot 14 Bloxburgh Dr, Spanish Town",
};
const apiJob = {
  id: "job-0142",
  clientId: "cl-basil-reid",
  name: "Retaining wall, Spanish Town",
  addressLine: "Lot 14 Bloxburgh Dr, Spanish Town",
  parish: "St. Catherine",
  stage: "In progress",
  progressPct: 62,
};
const apiQuote = {
  id: "qt-0142",
  clientId: "cl-basil-reid",
  jobId: "job-0142",
  number: "QT-0142",
  status: "ACCEPTED",
  gctRate: "15",
  discountPct: "5",
  depositCents: 5_000_000,
  subtotalCents: 16_800_000,
  gctCents: 2_394_000,
  totalCents: 18_354_000,
  validUntil: null,
  createdAt: "2026-07-10T00:00:00.000Z",
  lineItems: [
    {
      id: "l1",
      category: "MATERIAL",
      description: "Cement",
      quantity: "40",
      rateUnit: "UNIT",
      unitPriceCents: 115_000,
      priceSource: "LOOKUP",
      gctTreatment: "STANDARD",
      markupPct: null,
    },
  ],
  sections: [],
};

const apiInvoice = {
  id: "inv-0007",
  businessId: "seed-business-blackwood",
  clientId: "cl-basil-reid",
  quoteId: "qt-0142",
  number: "INV-0007",
  status: "DRAFT",
  gctRate: "15",
  discountPct: "5",
  depositCents: 5_000_000,
  terms: "Due on receipt",
  dueDate: "2026-08-15T00:00:00.000Z",
  subtotalCents: 16_800_000,
  gctCents: 2_394_000,
  totalCents: 18_354_000,
  paidCents: 0,
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z",
  lineItems: [
    {
      id: "l1",
      category: "MATERIAL",
      description: "Cement",
      quantity: "40",
      rateUnit: "UNIT",
      unitPriceCents: 115_000,
      priceSource: "LOOKUP",
      gctTreatment: "STANDARD",
      markupPct: null,
    },
  ],
  sections: [],
};

const apiBusiness = {
  id: "seed-business-blackwood",
  name: "Blackwood Construction & Masonry",
  countryCode: "JM",
  currency: "JMD",
  trn: "102-458-963",
  addressLine: "12 Barbican Road, Kingston 8",
  parish: "St. Catherine",
  tradeType: "General contractor & masonry",
  // Prisma Decimal serializes as a numeric string over JSON.
  defaultGctRate: "15.00",
};

const apiMaterialFavourite = {
  id: "mf-cement",
  name: "Cement (grey, 94lb)",
  unit: "bag",
  priceCents: 115_000,
  supplierId: null,
  description: "Portland type I, bagged",
};

// The API row shapes (ApiQuote/ApiClientRow/ApiBusiness) aren't exported;
// reference the mapper's own parameter type so the literals type-check
// against it.
type MapQuoteArg = Parameters<typeof mapQuote>[0];
type MapInvoiceArg = Parameters<typeof mapInvoice>[0];
type MapClientArg = Parameters<typeof mapClient>[0];
type MapBusinessArg = Parameters<typeof mapBusiness>[0];
type MapMaterialFavouriteArg = Parameters<typeof mapMaterialFavourite>[0];

describe("pure mappers", () => {
  it("initialsOf builds up to two uppercase initials", () => {
    expect(initialsOf("Basil Reid")).toBe("BR");
    expect(initialsOf("madonna")).toBe("M");
    expect(initialsOf("Owen St. John Blackwood")).toBe("OS");
  });

  it("mapClient maps persistence shape to the view Client", () => {
    expect(mapClient(apiClientRow as MapClientArg)).toEqual({
      id: "cl-basil-reid",
      firstName: "Basil",
      lastName: "Reid",
      name: "Basil Reid",
      initials: "BR",
      // Unset on this fixture — a pre-#30 row has no town, and the mapper
      // normalizes null to "" rather than leaving it undefined.
      town: "",
      parish: "St. Catherine",
      phone: "876 402 8811",
      address: "Lot 14 Bloxburgh Dr, Spanish Town",
      email: "basil.reid@example.com",
    });
  });

  it("mapClient surfaces email when present and falls back to undefined when absent", () => {
    expect(mapClient(apiClientRow as MapClientArg).email).toBe("basil.reid@example.com");
    const { email: _omit, ...withoutEmail } = apiClientRow;
    expect(mapClient(withoutEmail as MapClientArg).email).toBeUndefined();
  });

  it("mapQuote carries the denormalized total and maps lines", () => {
    const q = mapQuote(apiQuote as MapQuoteArg, "Retaining wall, Spanish Town");
    expect(q.num).toBe("QT-0142");
    expect(q.jobLabel).toBe("Retaining wall, Spanish Town");
    expect(q.totalCents).toBe(18_354_000);
    expect(q.createdAt).toBe("2026-07-10T00:00:00.000Z");
    expect(q.gctRatePct).toBe(15);
    expect(q.discountPct).toBe(5);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]?.unitPriceCents).toBe(115_000);
  });

  it("mapInvoice maps persistence shape to the view Invoice, converting Decimal fields to numbers", () => {
    const inv = mapInvoice(apiInvoice as MapInvoiceArg);
    expect(inv.num).toBe("INV-0007");
    expect(inv.status).toBe("DRAFT");
    expect(inv.quoteId).toBe("qt-0142");
    expect(inv.clientId).toBe("cl-basil-reid");
    expect(inv.gctRatePct).toBe(15);
    expect(inv.discountPct).toBe(5);
    expect(inv.paidCents).toBe(0);
    expect(inv.totalCents).toBe(18_354_000);
    expect(inv.terms).toBe("Due on receipt");
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]?.unitPriceCents).toBe(115_000);
  });

  it("mapBusiness maps the persistence shape and converts the Decimal GCT rate to a percentage number", () => {
    expect(mapBusiness(apiBusiness as MapBusinessArg)).toEqual({
      id: "seed-business-blackwood",
      name: "Blackwood Construction & Masonry",
      trn: "102-458-963",
      town: "",
      parish: "St. Catherine",
      tradeType: "General contractor & masonry",
      addressLine: "12 Barbican Road, Kingston 8",
      defaultGctRatePct: 15,
      countryCode: "JM",
      currency: "JMD",
    });
  });

  it("mapMaterialFavourite maps persistence shape to the view type, deriving priceDollars", () => {
    expect(mapMaterialFavourite(apiMaterialFavourite as MapMaterialFavouriteArg)).toEqual({
      id: "mf-cement",
      name: "Cement (grey, 94lb)",
      // A pre-2a row carries neither, so its quote line still composes a
      // description from name + specs rather than trusting the name alone
      // (see materialVariantName).
      nameCustom: false,
      categoryDefId: undefined,
      unit: "bag",
      unitId: undefined,
      priceCents: 115_000,
      priceDollars: 1150,
      supplierId: undefined,
      description: "Portland type I, bagged",
    });
  });

  it("mapMaterialFavourite carries description through as undefined when the API omits it", () => {
    const { description: _omit, ...withoutDescription } = apiMaterialFavourite;
    expect(mapMaterialFavourite(withoutDescription as MapMaterialFavouriteArg).description).toBeUndefined();
  });

  it("mapQuote preserves section titles and flattens section lines into `lines`", () => {
    const sectioned = {
      ...apiQuote,
      lineItems: [],
      sections: [
        {
          title: "Transportation",
          lineItems: [
            {
              id: "l2",
              category: "OTHER",
              description: "Delivery truck",
              quantity: "1",
              rateUnit: "JOB",
              unitPriceCents: 8_000,
              priceSource: "MANUAL",
              gctTreatment: "STANDARD",
              markupPct: null,
            },
          ],
        },
      ],
    };
    const q = mapQuote(sectioned as MapQuoteArg, "");
    expect(q.sections).toEqual([
      { title: "Transportation", lines: expect.arrayContaining([expect.objectContaining({ id: "l2" })]) },
    ]);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]?.id).toBe("l2");
  });
});

describe("getClients", () => {
  it("fetches with no auth header when signed out (no tenant fallback) and maps rows", async () => {
    const spy = stubFetch({ "/clients": [apiClientRow] });
    const clients = await getClients();
    expect(clients[0]?.initials).toBe("BR");
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-business-id"]).toBeUndefined();
    expect(headers["authorization"]).toBeUndefined();
  });

  it("sends the caller's JWT as Authorization: Bearer when signed in", async () => {
    setMockToken("jwt-test-token");
    const spy = stubFetch({ "/clients": [apiClientRow] });
    await getClients();
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer jwt-test-token");
  });

  it("returns an empty list when the API is unreachable (no fixture fallback)", async () => {
    stubFetch(null);
    const clients = await getClients();
    expect(clients).toEqual([]);
  });
});

describe("getClient", () => {
  it("fetches a single client and maps it", async () => {
    stubFetch({ "/clients/cl-basil-reid": apiClientRow });
    const c = await getClient("cl-basil-reid");
    expect(c?.name).toBe("Basil Reid");
    expect(c?.firstName).toBe("Basil");
    expect(c?.lastName).toBe("Reid");
  });

  it("returns undefined when the API is unreachable (no fixture fallback)", async () => {
    stubFetch(null);
    const c = await getClient("cl-basil-reid");
    expect(c).toBeUndefined();
  });
});

describe("getBusiness", () => {
  it("fetches /business/current and maps it", async () => {
    stubFetch({ "/business/current": apiBusiness });
    const b = await getBusiness();
    expect(b.name).toBe("Blackwood Construction & Masonry");
    expect(b.defaultGctRatePct).toBe(15);
  });

  it("returns an empty (non-identifying) business when the API is unreachable", async () => {
    stubFetch(null);
    const b = await getBusiness();
    expect(b.id).toBe("");
    expect(b.name).toBe("");
    // Pages that read defaultGctRatePct (e.g. the quote builder's GCT rate)
    // still get a sane, non-zero fallback so a quote isn't built at 0% GCT.
    expect(b.defaultGctRatePct).toBeGreaterThan(0);
  });
});

describe("getJob", () => {
  it("fetches a single job and joins the client name", async () => {
    stubFetch({ "/jobs/job-0142": apiJob, "/clients": [apiClientRow] });
    const j = await getJob("job-0142");
    expect(j?.name).toBe("Retaining wall, Spanish Town");
    expect(j?.clientId).toBe("cl-basil-reid");
    expect(j?.clientName).toBe("Basil Reid");
    expect(j?.parish).toBe("St. Catherine");
  });

  it("returns undefined when the API is unreachable (no fixture fallback)", async () => {
    stubFetch(null);
    const j = await getJob("job-0142");
    expect(j).toBeUndefined();
  });
});

describe("getQuotes", () => {
  it("maps quotes, attaches jobLabel, and sorts newest-first", async () => {
    stubFetch({
      "/quotes": [apiQuote, { ...apiQuote, id: "qt-0140", number: "QT-0140", jobId: "job-0142" }],
      "/jobs": [apiJob],
    });
    const quotes = await getQuotes();
    expect(quotes.map((q) => q.num)).toEqual(["QT-0142", "QT-0140"]); // desc
    expect(quotes[0]?.jobLabel).toBe("Retaining wall, Spanish Town");
    expect(quotes[0]?.totalCents).toBe(18_354_000);
  });

  it("returns an empty list when the API is unreachable (no fixture fallback)", async () => {
    stubFetch(null);
    const quotes = await getQuotes();
    expect(quotes).toEqual([]);
  });
});

describe("getQuote", () => {
  it("returns a detail quote with line items", async () => {
    stubFetch({ "/quotes/qt-0142": apiQuote, "/jobs/job-0142": apiJob });
    const q = await getQuote("qt-0142");
    expect(q?.num).toBe("QT-0142");
    expect(q?.jobLabel).toBe("Retaining wall, Spanish Town");
    expect(q?.lines).toHaveLength(1);
  });

  it("returns undefined when the API is unreachable (no fixture fallback)", async () => {
    stubFetch(null);
    const q = await getQuote("qt-0142");
    expect(q).toBeUndefined();
  });
});

describe("getInvoices", () => {
  it("fetches and maps invoices", async () => {
    stubFetch({ "/invoices": [apiInvoice] });
    const invoices = await getInvoices();
    expect(invoices[0]?.num).toBe("INV-0007");
    expect(invoices[0]?.status).toBe("DRAFT");
  });

  it("returns an empty list when the API is unreachable (no fixture fallback)", async () => {
    stubFetch(null);
    const invoices = await getInvoices();
    expect(invoices).toEqual([]);
  });
});

describe("getInvoice", () => {
  it("returns a detail invoice with line items", async () => {
    stubFetch({ "/invoices/inv-0007": apiInvoice });
    const inv = await getInvoice("inv-0007");
    expect(inv?.num).toBe("INV-0007");
    expect(inv?.lines).toHaveLength(1);
  });

  it("returns undefined when the API is unreachable (no fixture fallback)", async () => {
    stubFetch(null);
    const inv = await getInvoice("inv-0007");
    expect(inv).toBeUndefined();
  });
});

describe("create (write path)", () => {
  it("createClient POSTs with no tenant fallback header and maps the result", async () => {
    const spy = stubFetch({ "/clients": { id: "new-1", firstName: "Jane", lastName: "Doe", phone: "876 000 0000", parish: "Kingston", addressLine: "1 Main St" } });
    const c = await createClient({ firstName: "Jane", lastName: "Doe", phone: "876 000 0000" });
    expect(c.name).toBe("Jane Doe");
    expect(c.initials).toBe("JD");
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    // No more x-business-id fallback anywhere in api-client.ts; the browser
    // path relies entirely on the /api/proxy route attaching the JWT cookie.
    expect((init.headers as Record<string, string>)["x-business-id"]).toBeUndefined();
    expect(JSON.parse(init.body as string)).toMatchObject({ firstName: "Jane", lastName: "Doe" });
  });

  it("createJob POSTs the job body", async () => {
    const spy = stubFetch({ "/jobs": { id: "job-new" } });
    const r = await createJob({ name: "New wall", clientId: "cl-basil-reid" });
    expect(r.id).toBe("job-new");
    expect(JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string)).toMatchObject({
      name: "New wall",
      clientId: "cl-basil-reid",
    });
  });

  it("createMaterialFavourite POSTs the material body (including description) and maps the result", async () => {
    const spy = stubFetch({ "/catalogs/material-favourites": apiMaterialFavourite });
    const m = await createMaterialFavourite({
      name: "Cement (grey, 94lb)",
      unit: "bag",
      priceCents: 115_000,
      description: "Portland type I, bagged",
    });
    expect(m.priceDollars).toBe(1150);
    expect(m.description).toBe("Portland type I, bagged");
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-business-id"]).toBeUndefined();
    expect(JSON.parse(init.body as string)).toMatchObject({
      name: "Cement (grey, 94lb)",
      priceCents: 115_000,
      description: "Portland type I, bagged",
    });
  });

  it("createQuote POSTs the line items", async () => {
    const spy = stubFetch({ "/quotes": { id: "qt-new" } });
    const r = await createQuote({
      clientId: "cl-basil-reid",
      gctRatePct: 15,
      discountPct: 0,
      depositCents: 0,
      lineItems: [
        {
          category: LineCategory.MATERIAL,
          description: "Cement",
          quantity: 10,
          rateUnit: RateUnit.UNIT,
          unitPriceCents: 115_000,
          gctTreatment: GctTreatment.STANDARD,
        },
      ],
    });
    expect(r.id).toBe("qt-new");
    const body = JSON.parse((spy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(body.lineItems[0].unitPriceCents).toBe(115_000);
  });

  it("createInvoiceFromQuote POSTs to /invoices/from-quote/:quoteId with no body", async () => {
    const spy = stubFetch({ "/invoices/from-quote/qt-0142": { id: "inv-new" } });
    const r = await createInvoiceFromQuote("qt-0142");
    expect(r.id).toBe("inv-new");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/invoices/from-quote/qt-0142");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });
});

describe("update (write path)", () => {
  it("updateQuote PATCHes the quote body to /quotes/:id", async () => {
    const spy = stubFetch({ "/quotes/qt-0142": { id: "qt-0142" } });
    const r = await updateQuote("qt-0142", {
      clientId: "cl-basil-reid",
      gctRatePct: 15,
      discountPct: 0,
      depositCents: 0,
      lineItems: [
        {
          category: LineCategory.MATERIAL,
          description: "Cement",
          quantity: 10,
          rateUnit: RateUnit.UNIT,
          unitPriceCents: 115_000,
          gctTreatment: GctTreatment.STANDARD,
        },
      ],
    });
    expect(r.id).toBe("qt-0142");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/quotes/qt-0142");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["x-business-id"]).toBeUndefined();
    const body = JSON.parse(init.body as string);
    expect(body.lineItems[0].unitPriceCents).toBe(115_000);
  });

  it("updateClient PATCHes the client body to /clients/:id and maps the result", async () => {
    const spy = stubFetch({
      "/clients/cl-basil-reid": { id: "cl-basil-reid", firstName: "Basil", lastName: "Reid-Campbell", phone: "876 402 8811", parish: "St. Catherine", addressLine: "Lot 14 Bloxburgh Dr, Spanish Town" },
    });
    const c = await updateClient("cl-basil-reid", { lastName: "Reid-Campbell" });
    expect(c.name).toBe("Basil Reid-Campbell");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/clients/cl-basil-reid");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["x-business-id"]).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ lastName: "Reid-Campbell" });
  });

  it("updateJob PATCHes the job body to /jobs/:id", async () => {
    const spy = stubFetch({ "/jobs/job-0142": { id: "job-0142" } });
    const r = await updateJob("job-0142", { name: "Retaining wall, phase 2" });
    expect(r.id).toBe("job-0142");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/jobs/job-0142");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["x-business-id"]).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ name: "Retaining wall, phase 2" });
  });

  it("updateBusiness PATCHes the business body to /business/:id, renaming defaultGctRatePct to defaultGctRate", async () => {
    const spy = stubFetch({ "/business/seed-business-blackwood": { id: "seed-business-blackwood" } });
    const r = await updateBusiness("seed-business-blackwood", { name: "Blackwood & Sons", defaultGctRatePct: 12.5 });
    expect(r.id).toBe("seed-business-blackwood");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/business/seed-business-blackwood");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["x-business-id"]).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ name: "Blackwood & Sons", defaultGctRate: 12.5 });
  });

  it("updateMaterialFavourite PATCHes the material body to /catalogs/material-favourites/:id (last-price behaviour)", async () => {
    const spy = stubFetch({
      "/catalogs/material-favourites/mf-cement": { ...apiMaterialFavourite, priceCents: 120_000 },
    });
    const m = await updateMaterialFavourite("mf-cement", { priceCents: 120_000 });
    expect(m.priceCents).toBe(120_000);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/catalogs/material-favourites/mf-cement");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["x-business-id"]).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ priceCents: 120_000 });
  });

  it("reviseQuote POSTs to /quotes/:id/revise with no body", async () => {
    const spy = stubFetch({ "/quotes/qt-0142/revise": { id: "qt-0143" } });
    const r = await reviseQuote("qt-0142");
    expect(r.id).toBe("qt-0143");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/quotes/qt-0142/revise");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });

  it("setQuoteStatus POSTs { status } to /quotes/:id/status", async () => {
    const spy = stubFetch({ "/quotes/qt-0142/status": { id: "qt-0142" } });
    await setQuoteStatus("qt-0142", QuoteStatus.SENT);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/quotes/qt-0142/status");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ status: "SENT" });
  });

  it("updateInvoice PATCHes the invoice body to /invoices/:id (gctRatePct passed through unrenamed)", async () => {
    const spy = stubFetch({ "/invoices/inv-0007": { id: "inv-0007" } });
    const r = await updateInvoice("inv-0007", {
      dueDate: "2026-08-15T00:00:00.000Z",
      terms: "Due on receipt",
      gctRatePct: 15,
      discountPct: 0,
      depositCents: 0,
      lineItems: [
        {
          category: LineCategory.MATERIAL,
          description: "Cement",
          quantity: 10,
          rateUnit: RateUnit.UNIT,
          unitPriceCents: 115_000,
          gctTreatment: GctTreatment.STANDARD,
        },
      ],
    });
    expect(r.id).toBe("inv-0007");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/invoices/inv-0007");
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body as string);
    expect(body.gctRatePct).toBe(15);
    expect(body.lineItems[0].unitPriceCents).toBe(115_000);
  });

  it("finalizeInvoice POSTs to /invoices/:id/finalize with no body", async () => {
    const spy = stubFetch({ "/invoices/inv-0007/finalize": { id: "inv-0007" } });
    await finalizeInvoice("inv-0007");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/invoices/inv-0007/finalize");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
  });
});

describe("delete (write path)", () => {
  // The API's delete handlers return Promise<void>, so the live response is a
  // 200 with an empty body — assert request() tolerates that (no res.json()
  // parse error) as well as the method/path/header.
  function stubEmptyOk() {
    const spy = vi.fn(async (_url: string | URL, _init?: RequestInit) => {
      return { ok: true, status: 200, text: async () => "" } as unknown as Response;
    });
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("deleteClient sends DELETE to /clients/:id with no tenant fallback header", async () => {
    const spy = stubEmptyOk();
    await deleteClient("cl-basil-reid");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/clients/cl-basil-reid");
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>)["x-business-id"]).toBeUndefined();
  });

  it("deleteJob sends DELETE to /jobs/:id", async () => {
    const spy = stubEmptyOk();
    await deleteJob("job-0142");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/jobs/job-0142");
    expect(init.method).toBe("DELETE");
  });

  it("deleteQuote sends DELETE to /quotes/:id", async () => {
    const spy = stubEmptyOk();
    await deleteQuote("qt-0142");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/quotes/qt-0142");
    expect(init.method).toBe("DELETE");
  });

  it("deleteInvoice sends DELETE to /invoices/:id", async () => {
    const spy = stubEmptyOk();
    await deleteInvoice("inv-0007");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/invoices/inv-0007");
    expect(init.method).toBe("DELETE");
  });

  it("deleteMaterialFavourite sends DELETE to /catalogs/material-favourites/:id", async () => {
    const spy = stubEmptyOk();
    await deleteMaterialFavourite("mf-cement");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/catalogs/material-favourites/mf-cement");
    expect(init.method).toBe("DELETE");
  });
});

describe("getMaterialFavourites", () => {
  it("fetches with no auth header when signed out (no tenant fallback) and maps rows", async () => {
    const spy = stubFetch({ "/catalogs/material-favourites": [apiMaterialFavourite] });
    const favourites = await getMaterialFavourites();
    expect(favourites).toHaveLength(1);
    expect(favourites[0]?.priceDollars).toBe(1150);
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-business-id"]).toBeUndefined();
    expect(headers["authorization"]).toBeUndefined();
  });

  it("falls back to an empty list when the API is unreachable (no fixture backs these)", async () => {
    stubFetch(null);
    const favourites = await getMaterialFavourites();
    expect(favourites).toEqual([]);
  });

  it("sends no query string when called with no params (unfiltered — the existing pages' behaviour)", async () => {
    const spy = stubFetch({ "/catalogs/material-favourites": [apiMaterialFavourite] });
    await getMaterialFavourites();
    const [url] = spy.mock.calls[0] as [string];
    expect(String(url)).toMatch(/\/catalogs\/material-favourites$/);
  });

  it("forwards q/category/limit as a query string (the type-ahead search contract)", async () => {
    const spy = stubFetch({ "/catalogs/material-favourites": [apiMaterialFavourite] });
    await getMaterialFavourites({ q: "cement", category: "Cement", limit: 20 });
    const [url] = spy.mock.calls[0] as [string];
    const qs = new URL(String(url)).searchParams;
    expect(qs.get("q")).toBe("cement");
    expect(qs.get("category")).toBe("Cement");
    expect(qs.get("limit")).toBe("20");
  });
});

describe("getMaterialFavouritesClient", () => {
  it("fetches with no query string when called with no params and maps rows", async () => {
    const spy = stubFetch({ "/catalogs/material-favourites": [apiMaterialFavourite] });
    const favourites = await getMaterialFavouritesClient();
    expect(favourites).toHaveLength(1);
    expect(favourites[0]?.priceDollars).toBe(1150);
    const [url] = spy.mock.calls[0] as [string];
    expect(String(url)).toContain("/catalogs/material-favourites");
    expect(String(url)).not.toContain("?");
  });

  it("forwards q/category/limit — what the materials type-ahead and search box rely on", async () => {
    const spy = stubFetch({ "/catalogs/material-favourites": [apiMaterialFavourite] });
    await getMaterialFavouritesClient({ q: "2x4", category: "Lumber", limit: 20 });
    const [url] = spy.mock.calls[0] as [string];
    const qs = new URL(String(url)).searchParams;
    expect(qs.get("q")).toBe("2x4");
    expect(qs.get("category")).toBe("Lumber");
    expect(qs.get("limit")).toBe("20");
  });

  it("omits params that weren't given rather than sending empty values", async () => {
    const spy = stubFetch({ "/catalogs/material-favourites": [apiMaterialFavourite] });
    await getMaterialFavouritesClient({ q: "cement" });
    const [url] = spy.mock.calls[0] as [string];
    const qs = new URL(String(url)).searchParams;
    expect(qs.get("q")).toBe("cement");
    expect(qs.has("category")).toBe(false);
    expect(qs.has("limit")).toBe(false);
  });
});

describe("getJobs", () => {
  it("computes per-job value and quote count", async () => {
    stubFetch({ "/jobs": [apiJob], "/quotes": [apiQuote], "/clients": [apiClientRow] });
    const jobs = await getJobs();
    expect(jobs[0]?.name).toBe("Retaining wall, Spanish Town");
    expect(jobs[0]?.clientName).toBe("Basil Reid");
    expect(jobs[0]?.quoteCount).toBe(1);
    expect(jobs[0]?.valueCents).toBe(18_354_000);
  });

  it("returns an empty list when the API is unreachable (no fixture fallback)", async () => {
    stubFetch(null);
    const jobs = await getJobs();
    expect(jobs).toEqual([]);
  });
});

describe("supplier price comparison (#26 Phase 2b)", () => {
  const apiSupplierPrice = {
    id: "mpe-hl-cement",
    supplierId: "sup-hl-true-value",
    supplierName: "H&L True Value",
    location: "Kingston",
    priceCents: 115_000,
    note: "cash price",
    fetchedAt: "2026-08-08T09:15:00.000Z",
  };

  it("getMaterialPrices sends the material id as a query param", async () => {
    const spy = stubFetch({ "/catalogs/material-prices": [apiSupplierPrice] });
    const rows = await getMaterialPrices("mf-cement");
    expect(rows).toHaveLength(1);
    // No mapper: cents stay integer cents and fetchedAt stays ISO so the panel
    // can render it relative to now.
    expect(rows[0]?.priceCents).toBe(115_000);
    expect(rows[0]?.fetchedAt).toBe("2026-08-08T09:15:00.000Z");
    const [url] = spy.mock.calls[0] as [string];
    expect(new URL(String(url)).searchParams.get("materialFavouriteId")).toBe("mf-cement");
  });

  it("createMaterialPrice POSTs integer cents, never dollars", async () => {
    const spy = stubFetch({ "/catalogs/material-prices": { id: "mpe-new" } });
    const r = await createMaterialPrice({
      supplierId: "sup-hl-true-value",
      materialFavouriteId: "mf-cement",
      priceCents: 122_500,
      note: "delivered",
    });
    expect(r.id).toBe("mpe-new");
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      supplierId: "sup-hl-true-value",
      materialFavouriteId: "mf-cement",
      priceCents: 122_500,
      note: "delivered",
    });
  });

  it("deleteMaterialPrice sends DELETE to /catalogs/material-prices/:id", async () => {
    const spy = vi.fn(async (_url: string | URL, _init?: RequestInit) => {
      return { ok: true, status: 200, text: async () => "" } as unknown as Response;
    });
    vi.stubGlobal("fetch", spy);
    await deleteMaterialPrice("mpe-hl-cement");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/catalogs/material-prices/mpe-hl-cement");
    expect(init.method).toBe("DELETE");
  });

  it("getSuppliersClient reads this business's directory", async () => {
    const spy = stubFetch({
      "/catalogs/suppliers": [
        { id: "sup-hl-true-value", name: "H&L True Value", parish: "Kingston", website: null, isPartner: true },
      ],
    });
    const suppliers = await getSuppliersClient();
    expect(suppliers[0]?.name).toBe("H&L True Value");
    expect(suppliers[0]?.parish).toBe("Kingston");
    const [url] = spy.mock.calls[0] as [string];
    expect(String(url)).toContain("/catalogs/suppliers");
  });

  it("createSupplier POSTs the quick-add fields and omits an unset parish", async () => {
    const spy = stubFetch({
      "/catalogs/suppliers": { id: "sup-new", name: "Rapid True Value", parish: null, website: null, isPartner: false },
    });
    const created = await createSupplier({ name: "Rapid True Value" });
    expect(created.id).toBe("sup-new");
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Rapid True Value" });
  });

  it("createSupplier sends the parish when the quick-add supplied one", async () => {
    const spy = stubFetch({
      "/catalogs/suppliers": { id: "sup-new", name: "Rapid", parish: "St. Ann", website: null, isPartner: false },
    });
    await createSupplier({ name: "Rapid", parish: "St. Ann" });
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({ parish: "St. Ann" });
  });
});

describe("tenant-added material schema rows (#26 categories & units)", () => {
  it("createMaterialCategory POSTs the label to the schema endpoint", async () => {
    const spy = stubFetch({
      "/catalogs/material-schema/categories": {
        id: "cat-rebar",
        key: "rebar",
        label: "Rebar",
        sort: 99,
        custom: true,
        attributes: [],
      },
    });
    const created = await createMaterialCategory("Rebar");
    expect(created.id).toBe("cat-rebar");
    expect(created.custom).toBe(true);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/catalogs/material-schema/categories");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ label: "Rebar" });
  });

  it("createMaterialCategory returns the existing row when the label already matched", async () => {
    // The endpoint is idempotent, so the response can be a curated row the
    // caller must select rather than treat as a clash.
    stubFetch({
      "/catalogs/material-schema/categories": {
        id: "cat-lumber",
        key: "lumber",
        label: "Lumber",
        sort: 10,
        custom: false,
        attributes: [],
      },
    });
    const created = await createMaterialCategory("lumber");
    expect(created.id).toBe("cat-lumber");
    expect(created.custom).toBe(false);
  });

  it("createMaterialUnit POSTs the label to the units endpoint", async () => {
    const spy = stubFetch({
      "/catalogs/material-schema/units": {
        id: "unit-pallet",
        key: "pallet",
        label: "per pallet",
        sort: 99,
        custom: true,
      },
    });
    const created = await createMaterialUnit("per pallet");
    expect(created.label).toBe("per pallet");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/catalogs/material-schema/units");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ label: "per pallet" });
  });
});
