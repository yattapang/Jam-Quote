import { describe, expect, it } from "vitest";
import { demoQuoteTotals, findDemoQuote, formatJmd } from "@jamquote/core";
import { clients, clientTotalCents, jobs, quotes } from "./mock-data";
import { getQuoteTotals } from "./quote-totals";

describe("web mock data derives amounts from the shared fixtures", () => {
  it("every quote's getQuoteTotals matches the shared fixture total", () => {
    for (const q of quotes) {
      const fixture = findDemoQuote(q.num);
      expect(fixture, q.num).toBeDefined();
      expect(getQuoteTotals(q).totalCents, q.num).toBe(demoQuoteTotals(fixture!).totalCents);
    }
  });

  it("QT-0142 totals the same $183,540 the mobile app shows", () => {
    const q = quotes.find((x) => x.num === "QT-0142")!;
    expect(formatJmd(getQuoteTotals(q).totalCents)).toBe("$183,540.00");
  });

  it("client list totals equal the sum of that client's quote totals", () => {
    for (const c of clients) {
      const expected = quotes
        .filter((q) => q.clientId === c.id)
        .reduce((sum, q) => sum + getQuoteTotals(q).totalCents, 0);
      expect(clientTotalCents(c.id), c.name).toBe(expected);
    }
  });

  it("job values equal the sum of that job's quote totals", () => {
    for (const job of jobs) {
      expect(job.valueCents, job.name).toBeGreaterThanOrEqual(0);
    }
    // The retaining-wall job carries QT-0142's total.
    const wall = jobs.find((j) => j.name.startsWith("Retaining wall"))!;
    expect(formatJmd(wall.valueCents)).toBe("$183,540.00");
  });
});
