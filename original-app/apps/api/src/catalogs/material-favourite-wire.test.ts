import { describe, expect, it } from "vitest";
import { Prisma, type MaterialFavourite, type MaterialUnit } from "@prisma/client";
import { materialFavouriteWire } from "@jamquote/core";

/**
 * Seam 1 in `CONTRACTS.md`, for the saved-materials library. Same double
 * coupling: TypeScript against Prisma's generated types, Zod against what the
 * web reads.
 *
 * Two things here are worth pinning beyond the shape.
 *
 * **`unitRef` is a JOIN, not a column.** Materials once lost their unit on
 * create because `create` and `update` omitted `include: { unitRef: true }` while
 * the reads had it — a fresh material came back without its unit and the quote
 * line showed "30 units". So the contract keeps `unitRef` optional, and these
 * tests cover both the joined and unjoined payloads rather than pretending only
 * one exists.
 *
 * **`nameCustom` is a real boolean.** The old interface had it
 * `?: boolean | null`, a tri-state for a non-nullable column with a default,
 * which meant a reader had to handle three cases to be safe.
 */

const unitRef: MaterialUnit = {
  id: "mu_1",
  businessId: null,
  key: "bag",
  label: "Bag",
  sort: 1,
  createdAt: new Date("2026-01-05T00:00:00.000Z"),
  deletedAt: null,
};

const sample: MaterialFavourite = {
  id: "mf_1",
  businessId: "biz_1",
  name: "Carib Cement, 42.5kg bag",
  nameCustom: false,
  unit: null,
  unitId: "mu_1",
  priceCents: 120_000,
  supplierId: null,
  category: null,
  categoryDefId: "mcd_1",
  specs: { grade: "OPC" },
  searchText: "carib cement",
  measureUnit: "m2",
  coveragePerSellUnit: new Prisma.Decimal("5.0000"),
  wastePct: new Prisma.Decimal("10.00"),
  description: null,
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
  deletedAt: null,
};

function overTheWire<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

describe("the material favourite wire contract", () => {
  it("is satisfied by a row read WITH its unit joined", () => {
    const joined = { ...sample, unitRef };
    expect(() => materialFavouriteWire.parse(overTheWire(joined))).not.toThrow();
  });

  it("is satisfied by a row read WITHOUT the join", () => {
    // The shape a read that forgets `include: { unitRef: true }` produces. It
    // must parse, because the contract's job is to describe what arrives - and
    // the screen falls back to `unit` when the join is absent.
    expect(() => materialFavouriteWire.parse(overTheWire(sample))).not.toThrow();
  });

  it("accepts a null unitRef, which is a material with no unit set", () => {
    expect(() => materialFavouriteWire.parse(overTheWire({ ...sample, unitRef: null }))).not.toThrow();
  });

  it("keeps nameCustom a real boolean, not a tri-state", () => {
    const parsed = materialFavouriteWire.parse(overTheWire(sample));
    expect(parsed.nameCustom).toBe(false);
    expect(() => materialFavouriteWire.parse({ ...overTheWire(sample), nameCustom: null })).toThrow(
      /nameCustom/,
    );
  });

  it("keeps priceCents an integer NUMBER", () => {
    // The money invariant at the boundary. A Decimal here would arrive as a
    // string that Number() still parses, so nothing would fail loudly while
    // rounding drifted.
    const wire = overTheWire(sample);
    expect(typeof wire.priceCents).toBe("number");
    expect(() => materialFavouriteWire.parse({ ...wire, priceCents: "120000" })).toThrow(
      /priceCents/,
    );
  });

  it("sends coverage and waste as strings, with trailing zeros dropped", () => {
    // 5.0000 arrives as "5", 10.00 as "10". Anything comparing these to a
    // formatted figure is comparing against something the API does not send.
    const parsed = materialFavouriteWire.parse(overTheWire(sample));
    expect(parsed.coveragePerSellUnit).toBe("5");
    expect(parsed.wastePct).toBe("10");
  });

  it("allows a material with no coverage configured", () => {
    // Common, and the screen says where coverage comes from rather than
    // computing from nothing.
    const bare: MaterialFavourite = { ...sample, coveragePerSellUnit: null, wastePct: null };
    const parsed = materialFavouriteWire.parse(overTheWire(bare));
    expect(parsed.coveragePerSellUnit).toBeNull();
  });

  it("carries specs keyed by attribute key", () => {
    const parsed = materialFavouriteWire.parse(overTheWire(sample));
    expect(parsed.specs).toEqual({ grade: "OPC" });
  });

  it("allows a pre-2a row with free-text unit and category", () => {
    // Both generations still exist in the column set, so both must parse.
    const legacy: MaterialFavourite = {
      ...sample,
      unitId: null,
      unit: "bag",
      categoryDefId: null,
      category: "Cement",
      specs: null,
    };
    expect(() => materialFavouriteWire.parse(overTheWire(legacy))).not.toThrow();
  });

  it("REJECTS a response missing a promised field", () => {
    const { priceCents: _dropped, ...without } = overTheWire(sample);
    expect(() => materialFavouriteWire.parse(without)).toThrow(/priceCents/);
  });
});
