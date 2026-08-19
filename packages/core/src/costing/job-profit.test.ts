import { describe, expect, it } from "vitest";
import { computeJobProfit } from "./job-profit.js";

const inv = (totalCents: number, paidCents = 0, status = "INVOICED") => ({
  status,
  totalCents,
  paidCents,
});
const cost = (amountCents: number, gctCents = 0) => ({ amountCents, gctCents });

describe("computeJobProfit — revenue", () => {
  it("sums invoiced work", () => {
    expect(computeJobProfit([inv(500_000), inv(200_000)], []).revenueCents).toBe(700_000);
  });

  it("EXCLUDES drafts", () => {
    // A draft is not a claim on anyone. Counting it would let a contractor
    // make a job look profitable by typing an invoice they never sent.
    const p = computeJobProfit([inv(500_000), inv(900_000, 0, "DRAFT")], []);
    expect(p.revenueCents).toBe(500_000);
  });

  it("tracks collected separately from invoiced", () => {
    const p = computeJobProfit([inv(500_000, 200_000)], []);
    expect(p.revenueCents).toBe(500_000);
    expect(p.collectedCents).toBe(200_000);
  });
});

describe("computeJobProfit — cost and input tax", () => {
  it("sums what was spent, GCT included", () => {
    expect(computeJobProfit([], [cost(115_000, 15_000)]).costCents).toBe(115_000);
  });

  it("nets reclaimable GCT off the cost for a registered business", () => {
    // The tax comes back, so it is not part of what the job cost.
    const p = computeJobProfit([inv(500_000)], [cost(115_000, 15_000)], true);
    expect(p.costExGctCents).toBe(100_000);
    expect(p.inputTaxCents).toBe(15_000);
    expect(p.netProfitCents).toBe(400_000);
  });

  it("does NOT net it off for an unregistered contractor", () => {
    // They never get the tax back, so treating it as recoverable would
    // overstate the margin on every job they do.
    const p = computeJobProfit([inv(500_000)], [cost(115_000, 15_000)], false);
    expect(p.costExGctCents).toBe(115_000);
    expect(p.netProfitCents).toBe(385_000);
  });

  it("handles a purchase with no GCT — an unregistered supplier", () => {
    const p = computeJobProfit([inv(500_000)], [cost(80_000, 0)]);
    expect(p.costExGctCents).toBe(80_000);
    expect(p.inputTaxCents).toBe(0);
  });
});

describe("computeJobProfit — margin", () => {
  it("is a percentage of revenue, to one decimal", () => {
    expect(computeJobProfit([inv(500_000)], [cost(100_000)]).marginPct).toBe(80);
  });

  it("is NULL when nothing has been invoiced yet", () => {
    // A job with costs and no invoices has an undefined margin. Showing
    // "-100%" or "0%" would both read as facts about a job simply not billed.
    const p = computeJobProfit([], [cost(100_000)]);
    expect(p.marginPct).toBeNull();
    expect(p.netProfitCents).toBe(-100_000);
  });

  it("goes negative when a job overran", () => {
    const p = computeJobProfit([inv(100_000)], [cost(150_000)]);
    expect(p.netProfitCents).toBe(-50_000);
    expect(p.marginPct).toBe(-50);
  });

  it("is zero-safe on an empty job", () => {
    expect(computeJobProfit([], [])).toMatchObject({
      revenueCents: 0,
      costCents: 0,
      netProfitCents: 0,
      marginPct: null,
    });
  });
});
