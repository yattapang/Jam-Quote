import { describe, expect, it } from "vitest";
import { computeJobProfit, labourEntryCostCents } from "./job-profit.js";

/**
 * `gctCents` defaults to 0 — an unregistered contractor, charging none.
 *
 * Every existing case in this file was written that way implicitly, which is
 * precisely why the output-GCT asymmetry survived: with no GCT on either side the
 * maths was right, and no fixture ever put any there. `invGct` below is the shape
 * that finds it.
 */
const inv = (totalCents: number, paidCents = 0, status = "INVOICED", gctCents = 0) => ({
  status,
  totalCents,
  paidCents,
  gctCents,
});

/** A registered contractor's invoice: GCT charged on top, and remitted to TAJ. */
const invGct = (subtotalCents: number, gctPct = 15, paidCents = 0) => {
  const gctCents = Math.round((subtotalCents * gctPct) / 100);
  return inv(subtotalCents + gctCents, paidCents, "INVOICED", gctCents);
};
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

describe("labourEntryCostCents", () => {
  it("multiplies whole days by the day rate", () => {
    expect(labourEntryCostCents(5, 400_000)).toBe(2_000_000);
  });

  it("handles a half day", () => {
    expect(labourEntryCostCents(2.5, 400_000)).toBe(1_000_000);
  });

  it("rounds per entry, not per sum", () => {
    // 7.333 hours at $12.34/hr. Rounding here keeps a job total reconcilable
    // against a wage sheet; a fraction of a cent per entry would accumulate.
    expect(labourEntryCostCents(7.333, 1_234)).toBe(9_049);
  });

  it("accepts a decimal string, which is how Prisma returns it", () => {
    expect(labourEntryCostCents("2.5", 400_000)).toBe(1_000_000);
  });

  it("is zero for a bad or empty quantity rather than NaN", () => {
    // A bad keystroke should leave the figure unchanged, not poison every
    // total that includes it.
    expect(labourEntryCostCents("", 400_000)).toBe(0);
    expect(labourEntryCostCents("abc", 400_000)).toBe(0);
    expect(labourEntryCostCents(-3, 400_000)).toBe(0);
    expect(labourEntryCostCents(0, 400_000)).toBe(0);
  });
});


describe("computeJobProfit — output GCT is not revenue", () => {
  it("measures revenue WITHOUT the GCT the contractor collects for TAJ", () => {
    // $1,000,000 of work plus $150,000 GCT. The GCT is collected and remitted; it
    // was never the contractor's money. Counting it as revenue while netting
    // reclaimable input tax off cost was an asymmetry that only ever flattered.
    const p = computeJobProfit([invGct(1_000_000)], [], true);
    expect(p.revenueCents).toBe(1_000_000);
  });

  it("gets the margin right on the case that used to read 65.2%", () => {
    // The reviewer's example. $1,150,000 billed including $150,000 GCT, against
    // $460,000 spent including $60,000 reclaimable. True profit is $600,000 on
    // $1,000,000 of revenue — 60%, not the 65.2% the old maths reported.
    const p = computeJobProfit([invGct(1_000_000)], [cost(460_000, 60_000)], true);
    expect(p.revenueCents).toBe(1_000_000);
    expect(p.costExGctCents).toBe(400_000);
    expect(p.netProfitCents).toBe(600_000);
    expect(p.marginPct).toBe(60);
  });

  it("is unchanged for an unregistered contractor, who charges no GCT", () => {
    // The reason this survived: with no GCT on either side both versions agree.
    const p = computeJobProfit([inv(1_000_000)], [cost(400_000, 0)], false);
    expect(p.revenueCents).toBe(1_000_000);
    expect(p.netProfitCents).toBe(600_000);
  });

  it("still subtracts output GCT for an unregistered contractor who charged some", () => {
    // Not their money either way. Registration decides whether INPUT tax is
    // reclaimable, not whether output tax counts as income.
    const p = computeJobProfit([invGct(1_000_000)], [cost(460_000, 60_000)], false);
    expect(p.revenueCents).toBe(1_000_000);
    // Input tax is a real cost to them, so it stays in.
    expect(p.costExGctCents).toBe(460_000);
    expect(p.netProfitCents).toBe(540_000);
  });

  it("counts cash collected GROSS, because that is what arrived in the bank", () => {
    // Deliberately not symmetrical with revenue: collected is a bank figure, and
    // the client paid the GCT-inclusive amount. A reconciliation against a bank
    // statement has to match what the bank saw.
    const p = computeJobProfit([invGct(1_000_000, 15, 1_150_000)], [], true);
    expect(p.collectedCents).toBe(1_150_000);
  });
});
