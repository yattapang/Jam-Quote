import { describe, expect, it } from "vitest";
import type { EquipmentItem, LabourRate } from "@prisma/client";
import { equipmentItemWire, labourRateWire } from "@jamquote/core";

/**
 * Seam 1 in `CONTRACTS.md`, for the rate book. Same double coupling: TypeScript
 * against Prisma's generated types, Zod against what the web reads.
 *
 * The load-bearing assertion here is that `rateCents` reaches the browser as a
 * NUMBER. Money in this system is always integer cents (`PLANNING.md` §6), and
 * the one time a display layer broke that invariant it produced a 100x error on
 * screen. If someone widens the column to `Decimal`, every price silently
 * becomes a string that `Number()` still parses — so nothing would break loudly,
 * and rounding would start drifting instead. This is where that gets caught.
 */

const labour: LabourRate = {
  id: "lr_1",
  businessId: "biz_1",
  trade: "Mason",
  skillTier: null,
  rateCents: 800_000,
  rateUnit: "DAY",
  unitLabel: null,
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
  deletedAt: null,
};

const equipment: EquipmentItem = {
  id: "eq_1",
  businessId: "biz_1",
  name: "Concrete mixer",
  owned: false,
  vendor: "Rent-A-Tool",
  vendorPhone: "8765550199",
  rateCents: 350_000,
  rateUnit: "DAY",
  unitLabel: null,
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
  deletedAt: null,
};

function overTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("the labour rate wire contract", () => {
  it("is satisfied by what the service returns", () => {
    expect(() => labourRateWire.parse(overTheWire(labour))).not.toThrow();
  });

  it("keeps rateCents an integer NUMBER on the wire", () => {
    // The money invariant, checked at the boundary rather than assumed.
    const wire = overTheWire(labour);
    expect(typeof wire.rateCents).toBe("number");
    expect(wire.rateCents).toBe(800_000);
  });

  it("REJECTS a rate that arrives as a string", () => {
    // What widening the column to Decimal would do. Number() would still parse
    // it, so nothing else would fail loudly - rounding would just start
    // drifting. Caught here instead.
    expect(() => labourRateWire.parse({ ...overTheWire(labour), rateCents: "800000" })).toThrow(
      /rateCents/,
    );
  });

  it("REJECTS a fractional rateCents", () => {
    // Half a cent does not exist. If one appears, some caller has divided.
    expect(() => labourRateWire.parse({ ...overTheWire(labour), rateCents: 12.5 })).toThrow(
      /rateCents/,
    );
  });

  it("carries a null unitLabel through rather than inventing one", () => {
    // Null means "use the rateUnit's own label", which lineUnitLabel resolves.
    // A contract that defaulted it here would put that decision in two places.
    expect(labourRateWire.parse(overTheWire(labour)).unitLabel).toBeNull();
  });

  it("REJECTS a rateUnit outside the enum", () => {
    expect(() => labourRateWire.parse({ ...overTheWire(labour), rateUnit: "FORTNIGHT" })).toThrow(
      /rateUnit/,
    );
  });
});

describe("the equipment wire contract", () => {
  it("is satisfied by what the service returns", () => {
    expect(() => equipmentItemWire.parse(overTheWire(equipment))).not.toThrow();
  });

  it("keeps `owned` a real boolean", () => {
    // It decides whether the rate is cash out the door or an internal charge,
    // so a truthy string would quietly change what a job costs.
    expect(typeof overTheWire(equipment).owned).toBe("boolean");
    expect(() => equipmentItemWire.parse({ ...overTheWire(equipment), owned: "false" })).toThrow(
      /owned/,
    );
  });

  it("REJECTS a response missing a promised field", () => {
    const { name: _dropped, ...without } = overTheWire(equipment);
    expect(() => equipmentItemWire.parse(without)).toThrow(/name/);
  });
});
