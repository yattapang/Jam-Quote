import { describe, expect, it } from "vitest";
import { Prisma, type LabourEntry, type Purchase } from "@prisma/client";
import { labourEntryWire, purchaseWire } from "@jamquote/core";

/**
 * Seam 1 for the costing shapes. These feed `computeJobProfit`, so they sit on
 * the money seam — the place this project has been bitten twice.
 *
 * The assertions that matter are about TYPE rather than shape. Both carry cents,
 * and the failure to guard against is subtle: widen a cents column to `Decimal`
 * and every amount arrives as a string that `Number()` still parses. Nothing
 * fails loudly; rounding just starts drifting, and a contractor's margin is
 * wrong by a little, everywhere.
 */

const purchase: Purchase = {
  id: "pu_1",
  businessId: "biz_1",
  projectId: "pr_1",
  supplierId: null,
  description: "Cement, 20 bags",
  amountCents: 2_400_000,
  gctCents: 0,
  category: "Materials",
  purchasedAt: new Date("2026-09-03T00:00:00.000Z"),
  reference: null,
  note: null,
  createdAt: new Date("2026-09-03T00:00:00.000Z"),
  updatedAt: new Date("2026-09-03T00:00:00.000Z"),
  deletedAt: null,
};

const labour: LabourEntry = {
  id: "le_1",
  businessId: "biz_1",
  projectId: "pr_1",
  labourRateId: "lr_1",
  description: "Mason, blockwork",
  quantity: new Prisma.Decimal("2.5"),
  rateCents: 800_000,
  unitLabel: "day",
  workedOn: new Date("2026-09-03T00:00:00.000Z"),
  note: null,
  createdAt: new Date("2026-09-03T00:00:00.000Z"),
  updatedAt: new Date("2026-09-03T00:00:00.000Z"),
  deletedAt: null,
};

function overTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("the purchase wire contract", () => {
  it("is satisfied by what the service returns", () => {
    expect(() => purchaseWire.parse(overTheWire(purchase))).not.toThrow();
  });

  it("keeps amountCents and gctCents integers", () => {
    const wire = overTheWire(purchase);
    expect(typeof wire.amountCents).toBe("number");
    expect(() => purchaseWire.parse({ ...wire, amountCents: "2400000" })).toThrow(/amountCents/);
    expect(() => purchaseWire.parse({ ...wire, gctCents: 12.5 })).toThrow(/gctCents/);
  });

  it("allows a null projectId, which is an OVERHEAD rather than a missing link", () => {
    // Spend with no job behind it is a real category, not an incomplete record -
    // the list endpoint filters on the presence of the key for that reason.
    const overhead: Purchase = { ...purchase, projectId: null };
    expect(purchaseWire.parse(overTheWire(overhead)).projectId).toBeNull();
  });

  it("allows an uncategorised purchase", () => {
    // Category is free text with suggestions, not an enum, so blank is normal
    // and groupByCategory buckets it as "Uncategorised".
    const bare: Purchase = { ...purchase, category: null };
    expect(purchaseWire.parse(overTheWire(bare)).category).toBeNull();
  });

  it("keeps gctCents at zero for an unregistered supplier", () => {
    // Asked for as an AMOUNT rather than derived from a rate: plenty of
    // suppliers here are not registered, and assuming 15% would invent input tax
    // that cannot be reclaimed.
    expect(purchaseWire.parse(overTheWire(purchase)).gctCents).toBe(0);
  });

  it("REJECTS a response missing a promised field", () => {
    const { amountCents: _dropped, ...without } = overTheWire(purchase);
    expect(() => purchaseWire.parse(without)).toThrow(/amountCents/);
  });
});

describe("the labour entry wire contract", () => {
  it("is satisfied by what the service returns", () => {
    expect(() => labourEntryWire.parse(overTheWire(labour))).not.toThrow();
  });

  it("sends a fractional quantity as a STRING", () => {
    // Half a day is normal. A Decimal, so a string on the wire.
    expect(labourEntryWire.parse(overTheWire(labour)).quantity).toBe("2.5");
  });

  it("keeps the snapshotted rate an integer number", () => {
    const wire = overTheWire(labour);
    expect(typeof wire.rateCents).toBe("number");
    expect(() => labourEntryWire.parse({ ...wire, rateCents: "800000" })).toThrow(/rateCents/);
  });

  it("always carries a unit label, because a bare quantity means nothing", () => {
    // Non-nullable with a database default of "day". "2" with nothing after it
    // is not a cost anyone can read.
    expect(labourEntryWire.parse(overTheWire(labour)).unitLabel).toBe("day");
    expect(() => labourEntryWire.parse({ ...overTheWire(labour), unitLabel: null })).toThrow(
      /unitLabel/,
    );
  });

  it("allows admin time with no job behind it", () => {
    const admin: LabourEntry = { ...labour, projectId: null, labourRateId: null };
    expect(() => labourEntryWire.parse(overTheWire(admin))).not.toThrow();
  });
});
