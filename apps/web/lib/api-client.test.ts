import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getClients,
  getJobs,
  getQuote,
  getQuotes,
  initialsOf,
  mapClient,
  mapQuote,
} from "./api-client";

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
      return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => body } as unknown as Response;
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
    expect(q.gctRatePct).toBe(15);
    expect(q.discountPct).toBe(5);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]?.unitPriceCents).toBe(115_000);
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
