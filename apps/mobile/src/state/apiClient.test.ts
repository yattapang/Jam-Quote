import { afterEach, describe, expect, it, vi } from "vitest";

// expo-constants is a native module; stub it so the api-client imports in node.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { hostUri: "10.0.0.5:8081" } },
}));

import {
  apiBaseUrl,
  deleteClient,
  deleteJob,
  deleteQuote,
  fetchClientRows,
  fetchJobRows,
  fetchQuoteRows,
  initialsOf,
  mapClientRow,
  mapJobRow,
  mapQuoteRow,
} from "./apiClient";
import { QuoteStatus } from "@jamquote/core";

type Routes = Record<string, unknown>;
function stubFetch(routes: Routes | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL) => {
      if (routes === null) throw new Error("network down");
      const path = String(url).replace(/^.*\/api/, "");
      const body = routes[path];
      if (body === undefined) return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());

const apiQuote = {
  id: "qt-0142",
  clientId: "cl-basil-reid",
  jobId: "job-0142",
  number: "QT-0142",
  status: QuoteStatus.ACCEPTED,
  totalCents: 18_354_000,
};
const apiClientRow = { id: "cl-basil-reid", name: "Basil Reid", phone: "876 402 8811", parish: "St. Catherine" };
const apiJob = {
  id: "job-0142",
  clientId: "cl-basil-reid",
  name: "Retaining wall, Spanish Town",
  addressLine: "Lot 14 Bloxburgh Dr, Spanish Town",
  stage: "In progress",
  progressPct: 62,
};

describe("pure mappers", () => {
  it("initialsOf", () => {
    expect(initialsOf("Basil Reid")).toBe("BR");
  });

  it("mapQuoteRow maps status to a pill and carries the total", () => {
    const row = mapQuoteRow(apiQuote, "Basil Reid", "Retaining wall, Spanish Town");
    expect(row).toEqual({
      id: "qt-0142",
      num: "QT-0142",
      client: "Basil Reid",
      job: "Retaining wall, Spanish Town",
      amountCents: 18_354_000,
      status: "Accepted",
      kind: "good",
    });
  });

  it("mapClientRow", () => {
    expect(mapClientRow(apiClientRow, 18_354_000, 1)).toEqual({
      id: "cl-basil-reid",
      initials: "BR",
      name: "Basil Reid",
      parish: "St. Catherine",
      phone: "876 402 8811",
      totalCents: 18_354_000,
      quoteCount: 1,
    });
  });

  it("mapJobRow maps stage to a pill and carries the value", () => {
    expect(mapJobRow(apiJob, "Basil Reid", 18_354_000)).toEqual({
      id: "job-0142",
      name: "Retaining wall, Spanish Town",
      clientName: "Basil Reid",
      address: "Lot 14 Bloxburgh Dr, Spanish Town",
      stage: "In progress",
      pct: 62,
      valueCents: 18_354_000,
      kind: "info",
    });
  });
});

describe("apiBaseUrl", () => {
  it("derives the dev machine host from the Metro packager host", () => {
    expect(apiBaseUrl()).toBe("http://10.0.0.5:3001/api");
  });
});

describe("fetchQuoteRows", () => {
  it("joins client/job names and sorts newest-first", async () => {
    stubFetch({
      "/quotes": [apiQuote, { ...apiQuote, id: "qt-0140", number: "QT-0140" }],
      "/clients": [apiClientRow],
      "/jobs": [apiJob],
    });
    const rows = await fetchQuoteRows();
    expect(rows.map((r) => r.num)).toEqual(["QT-0142", "QT-0140"]);
    expect(rows[0]?.client).toBe("Basil Reid");
    expect(rows[0]?.amountCents).toBe(18_354_000);
  });

  it("falls back to fixtures when the API is unreachable", async () => {
    stubFetch(null);
    const rows = await fetchQuoteRows();
    expect(rows.some((r) => r.num === "QT-0142")).toBe(true);
  });
});

describe("fetchClientRows", () => {
  it("computes per-client totals and counts", async () => {
    stubFetch({ "/clients": [apiClientRow], "/quotes": [apiQuote] });
    const rows = await fetchClientRows();
    expect(rows[0]?.name).toBe("Basil Reid");
    expect(rows[0]?.quoteCount).toBe(1);
    expect(rows[0]?.totalCents).toBe(18_354_000);
  });

  it("falls back to fixtures on failure", async () => {
    stubFetch(null);
    const rows = await fetchClientRows();
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("fetchJobRows", () => {
  it("joins client names and sums quote totals", async () => {
    stubFetch({ "/jobs": [apiJob], "/clients": [apiClientRow], "/quotes": [apiQuote] });
    const rows = await fetchJobRows();
    expect(rows[0]?.name).toBe("Retaining wall, Spanish Town");
    expect(rows[0]?.clientName).toBe("Basil Reid");
    expect(rows[0]?.valueCents).toBe(18_354_000);
  });

  it("falls back to fixtures on failure", async () => {
    stubFetch(null);
    const rows = await fetchJobRows();
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe("delete helpers", () => {
  function stubDelete() {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("deleteClient issues a DELETE with the business header", async () => {
    const fetchMock = stubDelete();
    await deleteClient("cl-basil-reid");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://10.0.0.5:3001/api/clients/cl-basil-reid",
      expect.objectContaining({ method: "DELETE", headers: { "x-business-id": "seed-business-blackwood" } }),
    );
  });

  it("deleteJob issues a DELETE with the business header", async () => {
    const fetchMock = stubDelete();
    await deleteJob("job-0142");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://10.0.0.5:3001/api/jobs/job-0142",
      expect.objectContaining({ method: "DELETE", headers: { "x-business-id": "seed-business-blackwood" } }),
    );
  });

  it("deleteQuote issues a DELETE with the business header", async () => {
    const fetchMock = stubDelete();
    await deleteQuote("qt-0142");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://10.0.0.5:3001/api/quotes/qt-0142",
      expect.objectContaining({ method: "DELETE", headers: { "x-business-id": "seed-business-blackwood" } }),
    );
  });

  it("throws when the API responds with a non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }) as unknown as Response),
    );
    await expect(deleteClient("missing")).rejects.toThrow("DELETE /clients/missing -> 404");
  });
});
