import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { assertSuppliersOwned } from "./assert-suppliers-owned.js";

/**
 * A fake that applies ONLY the filters the query actually asks for.
 *
 * The sibling fake in `assert-owned.test.ts` matched `r.businessId === where.businessId`
 * unconditionally, so it answered the tenant question itself: dropping `businessId`
 * from the real query could not make a foreign row pass. This one resolves each key
 * present in `where` against the row and ignores keys that are absent, so removing a
 * filter from the implementation shows up as a row that should not have matched.
 */
type SupplierRow = { id: string; businessId: string | null; deletedAt?: Date | null };

function fakeSuppliers(rows: SupplierRow[]) {
  const matchesValue = (actual: unknown, expected: unknown): boolean => {
    if (expected !== null && typeof expected === "object" && "in" in (expected as object)) {
      return (expected as { in: unknown[] }).in.some((v) => (v ?? null) === (actual ?? null));
    }
    return (actual ?? null) === (expected ?? null);
  };
  const matchesWhere = (r: SupplierRow, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, expected]) => {
      // `OR` is a list of alternative where-clauses, any of which may match.
      if (key === "OR") {
        return (expected as Record<string, unknown>[]).some((alt) => matchesWhere(r, alt));
      }
      return matchesValue((r as unknown as Record<string, unknown>)[key], expected);
    });
  const findMany = vi.fn(({ where }: { where: Record<string, unknown> }) =>
    Promise.resolve(rows.filter((r) => matchesWhere(r, where)).map((r) => ({ id: r.id }))),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supplier: { findMany } } as any;
}

const MINE: SupplierRow = { id: "sup_mine", businessId: "biz_1", deletedAt: null };
const MINE_DELETED: SupplierRow = { id: "sup_gone", businessId: "biz_1", deletedAt: new Date() };
const THEIRS: SupplierRow = { id: "sup_theirs", businessId: "biz_2", deletedAt: null };
/** Pre-tenancy platform data. `Supplier.businessId` is nullable precisely for these
 * (schema.prisma, model Supplier) and `QuoteLineItem.supplierId` still points at them. */
const LEGACY_NULL: SupplierRow = { id: "sup_legacy", businessId: null, deletedAt: null };

describe("assertSuppliersOwned — new ids", () => {
  it("accepts live suppliers this business owns", async () => {
    await expect(
      assertSuppliersOwned(fakeSuppliers([MINE, THEIRS]), "biz_1", ["sup_mine"]),
    ).resolves.toBeUndefined();
  });

  it("refuses another tenant's supplier", async () => {
    await expect(
      assertSuppliersOwned(fakeSuppliers([MINE, THEIRS]), "biz_1", ["sup_theirs"]),
    ).rejects.toThrow(NotFoundException);
  });

  it("refuses a soft-deleted supplier as a NEWLY introduced id", async () => {
    await expect(
      assertSuppliersOwned(fakeSuppliers([MINE_DELETED]), "biz_1", ["sup_gone"]),
    ).rejects.toThrow("Supplier not found");
  });

  it("refuses a legacy NULL-owner supplier as a NEWLY introduced id", async () => {
    // Nobody may ATTACH an ownerless row to a document; the concession below is only
    // for ids already persisted on the document being saved.
    await expect(
      assertSuppliersOwned(fakeSuppliers([LEGACY_NULL]), "biz_1", ["sup_legacy"]),
    ).rejects.toThrow("Supplier not found");
  });

  it("tolerates null/undefined ids and makes no query at all", async () => {
    const db = fakeSuppliers([MINE]);
    await expect(assertSuppliersOwned(db, "biz_1", [null, undefined])).resolves.toBeUndefined();
    expect(db.supplier.findMany).not.toHaveBeenCalled();
  });
});

describe("assertSuppliersOwned — grandfathered ids already on the document", () => {
  it("accepts a soft-deleted supplier this business owns", async () => {
    await expect(
      assertSuppliersOwned(
        fakeSuppliers([MINE_DELETED]),
        "biz_1",
        ["sup_gone"],
        new Set(["sup_gone"]),
      ),
    ).resolves.toBeUndefined();
  });

  it("HIGH: accepts a legacy NULL-owner supplier, so the quote stays savable", async () => {
    // A pre-tenancy supplier row has no owner to match, and a quote line that already
    // references one cannot be repaired from the UI — LineItemsEditor.tsx has no
    // supplier control — so refusing it made update, revise and convert all 404 with
    // no way for the contractor to clear the field. Permanently unsavable quote.
    await expect(
      assertSuppliersOwned(
        fakeSuppliers([LEGACY_NULL]),
        "biz_1",
        ["sup_legacy"],
        new Set(["sup_legacy"]),
      ),
    ).resolves.toBeUndefined();
  });

  it("STILL refuses another tenant's supplier, grandfathered or not", async () => {
    // This is the point of the tenant check: NULL is ownerless legacy data no tenant
    // can see, while biz_2's row is another contractor's live merchant.
    await expect(
      assertSuppliersOwned(
        fakeSuppliers([LEGACY_NULL, THEIRS]),
        "biz_1",
        ["sup_theirs"],
        new Set(["sup_theirs"]),
      ),
    ).rejects.toThrow("Supplier not found");
  });

  it("STILL refuses an id that names no supplier at all", async () => {
    await expect(
      assertSuppliersOwned(fakeSuppliers([MINE]), "biz_1", ["sup_ghost"], new Set(["sup_ghost"])),
    ).rejects.toThrow("Supplier not found");
  });

  it("queries grandfathered ids without any deletedAt filter, owner OR unowned", async () => {
    const db = fakeSuppliers([LEGACY_NULL]);
    await assertSuppliersOwned(db, "biz_1", ["sup_legacy"], new Set(["sup_legacy"]));
    expect(db.supplier.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["sup_legacy"] },
      OR: [{ businessId: "biz_1" }, { businessId: null }],
    });
  });

  it("checks a mixed set on both paths in one call each", async () => {
    const db = fakeSuppliers([MINE, LEGACY_NULL]);
    await expect(
      assertSuppliersOwned(db, "biz_1", ["sup_mine", "sup_legacy"], new Set(["sup_legacy"])),
    ).resolves.toBeUndefined();
    expect(db.supplier.findMany).toHaveBeenCalledTimes(2);
  });
});
