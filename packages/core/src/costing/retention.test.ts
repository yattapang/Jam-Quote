import { describe, expect, it } from "vitest";
import { invoiceSettlement, retentionCents } from "./retention.js";

describe("retentionCents", () => {
  it("takes the percentage of the total", () => {
    expect(retentionCents(10_000_000, 10)).toBe(1_000_000);
  });

  it("is zero when no retention applies", () => {
    expect(retentionCents(10_000_000, null)).toBe(0);
    expect(retentionCents(10_000_000, 0)).toBe(0);
    expect(retentionCents(10_000_000, undefined)).toBe(0);
  });

  it("rounds to a payable figure", () => {
    expect(retentionCents(100_001, 33)).toBe(33_000);
  });

  it("clamps a nonsense percentage rather than making the balance negative", () => {
    expect(retentionCents(10_000_000, 150)).toBe(10_000_000);
    expect(retentionCents(10_000_000, -5)).toBe(0);
  });
});

describe("invoiceSettlement", () => {
  const base = { totalCents: 10_000_000, paidCents: 0, retentionCents: 1_000_000, retentionReleased: false };

  it("excludes held money from what is due now", () => {
    const s = invoiceSettlement(base);
    expect(s.dueNowCents).toBe(9_000_000);
    expect(s.heldCents).toBe(1_000_000);
  });

  it("counts an invoice as settled once the payable part arrives", () => {
    // THE rule. $100,000 with 10% retention is settled at $90,000 — the rest
    // is held under the terms, not owed. Treating it as a shortfall has
    // contractors chasing money nobody owes yet.
    const s = invoiceSettlement({ ...base, paidCents: 9_000_000 });
    expect(s.settledForNow).toBe(true);
    expect(s.outstandingCents).toBe(0);
  });

  it("makes the held money payable once released", () => {
    const s = invoiceSettlement({ ...base, paidCents: 9_000_000, retentionReleased: true });
    expect(s.dueNowCents).toBe(10_000_000);
    expect(s.heldCents).toBe(0);
    expect(s.outstandingCents).toBe(1_000_000);
    expect(s.settledForNow).toBe(false);
  });

  it("behaves like an ordinary invoice when there is no retention", () => {
    const s = invoiceSettlement({ totalCents: 500_000, paidCents: 200_000, retentionCents: 0, retentionReleased: false });
    expect(s.dueNowCents).toBe(500_000);
    expect(s.outstandingCents).toBe(300_000);
  });

  it("never reports a negative outstanding on an overpayment", () => {
    // A credit to sort out by hand, not a negative receivable that quietly
    // offsets another invoice's balance.
    const s = invoiceSettlement({ ...base, paidCents: 9_500_000 });
    expect(s.outstandingCents).toBe(0);
  });
});
