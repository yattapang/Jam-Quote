import { describe, expect, it } from "vitest";
import {
  demoQuoteTotals,
  demoClientTotalCents,
  findDemoQuote,
  formatJmd,
} from "@jamquote/core";
import {
  clientRows,
  dashboardStats,
  initialQuoteLines,
  quoteListRows,
  QUOTE_DISCOUNT_PCT,
  QUOTE_GCT_RATE_PCT,
} from "./mockData";
import { computeTotals } from "@jamquote/core";

describe("mobile mock data derives amounts from the shared fixtures", () => {
  it("every quote-list amount equals computeTotals for that quote (no hardcoding)", () => {
    for (const row of quoteListRows) {
      const q = findDemoQuote(row.num);
      expect(q, row.num).toBeDefined();
      expect(row.amountCents, row.num).toBe(demoQuoteTotals(q!).totalCents);
    }
  });

  it("QT-0142's editor lines total the same $183,540 shown in the list", () => {
    const editorTotal = computeTotals({
      lines: initialQuoteLines.map((l) => ({
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        markupPct: l.markupPct,
        gctTreatment: l.gctTreatment,
      })),
      gctRatePct: QUOTE_GCT_RATE_PCT,
      discountPct: QUOTE_DISCOUNT_PCT,
    }).totalCents;

    const listRow = quoteListRows.find((r) => r.num === "QT-0142")!;
    expect(editorTotal).toBe(listRow.amountCents);
    expect(formatJmd(editorTotal)).toBe("$183,540.00");
  });

  it("client totals equal the sum of that client's quotes", () => {
    const byName = new Map(clientRows.map((c) => [c.name, c]));
    // Basil Reid has exactly QT-0142.
    const basil = byName.get("Basil Reid")!;
    expect(basil.quoteCount).toBe(1);
    expect(basil.totalCents).toBe(demoClientTotalCents("cl-basil-reid"));
  });

  it("dashboard exposes quotes-this-month (parity with web)", () => {
    expect(dashboardStats.quotesThisMonth).toBeGreaterThan(0);
  });
});
