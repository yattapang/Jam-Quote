import { describe, expect, it } from "vitest";
import {
  demoClients,
  demoClientTotalCents,
  demoJobs,
  demoQuotes,
  demoQuoteTotals,
  findDemoClient,
  findDemoJob,
} from "./demo.js";
import { formatJmd } from "../tax/money.js";

describe("demo fixtures — referential integrity", () => {
  it("every quote points at a real client and job", () => {
    for (const q of demoQuotes) {
      expect(findDemoClient(q.clientId), `${q.number} client`).toBeDefined();
      expect(findDemoJob(q.jobId), `${q.number} job`).toBeDefined();
    }
  });

  it("every job points at a real client", () => {
    for (const j of demoJobs) {
      expect(findDemoClient(j.clientId), `${j.id} client`).toBeDefined();
    }
  });

  it("quote numbers are unique", () => {
    const nums = demoQuotes.map((q) => q.number);
    expect(new Set(nums).size).toBe(nums.length);
  });
});

describe("demo fixtures — amounts are derived, not hand-typed", () => {
  it("every quote total is positive and computed via computeTotals", () => {
    for (const q of demoQuotes) {
      const t = demoQuoteTotals(q);
      expect(t.totalCents, `${q.number} total`).toBeGreaterThan(0);
      // GCT only on standard lines' post-discount share; never exceeds subtotal.
      expect(t.gctCents).toBeLessThan(t.subtotalCents);
    }
  });

  it("QT-0142 (the retaining wall) totals the known-good $183,540", () => {
    const q = demoQuotes.find((x) => x.number === "QT-0142")!;
    const t = demoQuoteTotals(q);
    expect(t.subtotalCents).toBe(16_800_000);
    expect(t.totalCents).toBe(18_354_000);
    expect(formatJmd(t.totalCents)).toBe("$183,540.00");
  });

  it("a client's list total equals the sum of that client's quote totals", () => {
    for (const c of demoClients) {
      const expected = demoQuotes
        .filter((q) => q.clientId === c.id)
        .reduce((sum, q) => sum + demoQuoteTotals(q).totalCents, 0);
      expect(demoClientTotalCents(c.id), c.name).toBe(expected);
    }
  });
});
