import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClient,
  createJob,
  createQuote,
  deleteClient,
  deleteJob,
  deleteQuote,
  getClient,
  getClients,
  getJob,
  getJobs,
  getQuote,
  getQuotes,
  initialsOf,
  mapClient,
  mapQuote,
  reviseQuote,
  setQuoteStatus,
  updateClient,
  updateJob,
  updateQuote,
} from "./api-client";
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
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const apiClientRow = {
  id: "cl-basil-reid",
  firstName: "Basil",
  lastName: "Reid",
  name: "Basil Reid",
  phone: "876 402 8811",
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

// The API row shapes (ApiQuote/ApiClientRow) aren't exported; reference the
// mapper's own parameter type so the literals type-check against it.
type MapQuoteArg = Parameters<typeof mapQuote>[0];
type MapClientArg = Parameters<typeof mapClient>[0];

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
      parish: "St. Catherine",
      phone: "876 402 8811",
      address: "Lot 14 Bloxburgh Dr, Spanish Town",
    });
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
  it("fetches with the x-business-id header and maps rows", async () => {
    const spy = stubFetch({ "/clients": [apiClientRow] });
    const clients = await getClients();
    expect(clients[0]?.initials).toBe("BR");
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-business-id"]).toBe("seed-business-blackwood");
  });

  it("falls back to fixtures when the API is unreachable", async () => {
    stubFetch(null);
    const clients = await getClients();
    expect(clients.length).toBeGreaterThan(0);
    expect(clients.some((c) => c.name === "Basil Reid")).toBe(true);
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

  it("falls back to a fixture client when the API is unreachable", async () => {
    stubFetch(null);
    const c = await getClient("cl-basil-reid");
    expect(c?.name).toBe("Basil Reid");
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

  it("falls back to a fixture job when the API is unreachable", async () => {
    stubFetch(null);
    const j = await getJob("job-0142");
    expect(j?.name).toBe("Retaining wall, Spanish Town");
    expect(j?.clientName).toBe("Basil Reid");
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

  it("falls back to fixtures on failure (with derived totals)", async () => {
    stubFetch(null);
    const quotes = await getQuotes();
    const qt0142 = quotes.find((q) => q.num === "QT-0142");
    expect(qt0142?.totalCents).toBe(18_354_000);
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

  it("falls back to the fixture quote when the API is down", async () => {
    stubFetch(null);
    const q = await getQuote("qt-0142");
    expect(q?.num).toBe("QT-0142");
    expect(q?.lines.length).toBeGreaterThan(0);
  });
});

describe("create (write path)", () => {
  it("createClient POSTs with the business header and maps the result", async () => {
    const spy = stubFetch({ "/clients": { id: "new-1", firstName: "Jane", lastName: "Doe", phone: "876 000 0000", parish: "Kingston", addressLine: "1 Main St" } });
    const c = await createClient({ firstName: "Jane", lastName: "Doe", phone: "876 000 0000" });
    expect(c.name).toBe("Jane Doe");
    expect(c.initials).toBe("JD");
    const init = spy.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-business-id"]).toBe("seed-business-blackwood");
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
    expect((init.headers as Record<string, string>)["x-business-id"]).toBe("seed-business-blackwood");
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
    expect((init.headers as Record<string, string>)["x-business-id"]).toBe("seed-business-blackwood");
    expect(JSON.parse(init.body as string)).toEqual({ lastName: "Reid-Campbell" });
  });

  it("updateJob PATCHes the job body to /jobs/:id", async () => {
    const spy = stubFetch({ "/jobs/job-0142": { id: "job-0142" } });
    const r = await updateJob("job-0142", { name: "Retaining wall, phase 2" });
    expect(r.id).toBe("job-0142");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/jobs/job-0142");
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["x-business-id"]).toBe("seed-business-blackwood");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Retaining wall, phase 2" });
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

  it("deleteClient sends DELETE to /clients/:id with the business header", async () => {
    const spy = stubEmptyOk();
    await deleteClient("cl-basil-reid");
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain("/clients/cl-basil-reid");
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>)["x-business-id"]).toBe("seed-business-blackwood");
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

  it("falls back to fixtures on failure", async () => {
    stubFetch(null);
    const jobs = await getJobs();
    expect(jobs.length).toBeGreaterThan(0);
  });
});
