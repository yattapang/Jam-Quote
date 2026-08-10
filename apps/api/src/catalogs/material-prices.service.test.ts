import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { MaterialPricesService } from "./material-prices.service.js";

const MATERIAL = { id: "mat-1", businessId: "biz-1", name: "Cement Portland Type I 42.5kg", unit: "bag" };
const SUPPLIER_A = { id: "sup-a", name: "Rapid True Value", parish: "Kingston", deletedAt: null };
const SUPPLIER_B = { id: "sup-b", name: "H&L Agri", parish: "St Andrew", deletedAt: null };

function entry(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pe-1",
    supplierId: SUPPLIER_A.id,
    supplier: SUPPLIER_A,
    businessId: null,
    priceCents: 250_000,
    note: null,
    fetchedAt: new Date("2026-08-01T10:00:00Z"),
    ...over,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function harness(over: Record<string, any> = {}) {
  const prisma = {
    materialFavourite: { findFirst: vi.fn().mockResolvedValue(MATERIAL) },
    supplier: { findFirst: vi.fn().mockResolvedValue(SUPPLIER_A) },
    materialPriceEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    ...over,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new MaterialPricesService(prisma as any), prisma };
}

describe("MaterialPricesService.findForMaterial", () => {
  it("refuses to read prices for a material belonging to another business", async () => {
    // Ids are not capabilities: without the ownership check, passing another
    // tenant's material id would expose their private price history.
    const { svc, prisma } = harness({ materialFavourite: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(svc.findForMaterial("biz-1", "mat-other")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialPriceEntry.findMany).not.toHaveBeenCalled();
  });

  it("scopes the query to this business's own entries plus curated rows", async () => {
    const { svc, prisma } = harness();
    await svc.findForMaterial("biz-1", "mat-1");

    const where = prisma.materialPriceEntry.findMany.mock.calls[0]?.[0].where;
    expect(where.OR).toEqual([
      { businessId: "biz-1", materialFavouriteId: "mat-1" },
      { businessId: null, name: { equals: MATERIAL.name, mode: "insensitive" } },
    ]);
  });

  it("excludes retired suppliers", async () => {
    // SuppliersService.findAll does NOT filter deletedAt, so a comparison view
    // that didn't filter here would send a contractor to a dead merchant.
    const { svc, prisma } = harness();
    await svc.findForMaterial("biz-1", "mat-1");
    expect(prisma.materialPriceEntry.findMany.mock.calls[0]?.[0].where.supplier).toEqual({ deletedAt: null });
  });

  it("keeps only the most recent entry per supplier", async () => {
    const { svc } = harness({
      materialPriceEntry: {
        findMany: vi.fn().mockResolvedValue([
          entry({ id: "new", priceCents: 260_000, fetchedAt: new Date("2026-08-05T10:00:00Z") }),
          entry({ id: "old", priceCents: 100_000, fetchedAt: new Date("2026-07-01T10:00:00Z") }),
        ]),
      },
    });
    const rows = await svc.findForMaterial("biz-1", "mat-1");
    // The stale 100_000 must not win just because it is cheaper — it is not
    // what that supplier charges today.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("new");
  });

  it("sorts cheapest first across suppliers", async () => {
    const { svc } = harness({
      materialPriceEntry: {
        findMany: vi.fn().mockResolvedValue([
          entry({ id: "a", supplierId: "sup-a", supplier: SUPPLIER_A, priceCents: 300_000 }),
          entry({ id: "b", supplierId: "sup-b", supplier: SUPPLIER_B, priceCents: 120_000 }),
        ]),
      },
    });
    expect((await svc.findForMaterial("biz-1", "mat-1")).map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("flags own prices apart from curated reference prices", async () => {
    const { svc } = harness({
      materialPriceEntry: {
        findMany: vi.fn().mockResolvedValue([
          entry({ id: "mine", supplierId: "sup-a", supplier: SUPPLIER_A, businessId: "biz-1" }),
          entry({ id: "curated", supplierId: "sup-b", supplier: SUPPLIER_B, businessId: null }),
        ]),
      },
    });
    const rows = await svc.findForMaterial("biz-1", "mat-1");
    expect(rows.find((r) => r.id === "mine")?.own).toBe(true);
    expect(rows.find((r) => r.id === "curated")?.own).toBe(false);
  });

  it("returns fetchedAt as an ISO string, not a pre-rendered relative time", async () => {
    // Formatting belongs to the client — web and mobile render it differently,
    // and a server-rendered "2 hours ago" is wrong as soon as it is cached.
    const { svc } = harness({ materialPriceEntry: { findMany: vi.fn().mockResolvedValue([entry()]) } });
    expect((await svc.findForMaterial("biz-1", "mat-1"))[0]?.fetchedAt).toBe("2026-08-01T10:00:00.000Z");
  });
});

describe("MaterialPricesService.create", () => {
  it("records the price against this business, denormalizing the material name", async () => {
    const { svc, prisma } = harness();
    await svc.create("biz-1", { supplierId: SUPPLIER_A.id, materialFavouriteId: "mat-1", priceCents: 245_000 });

    expect(prisma.materialPriceEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "biz-1",
        materialFavouriteId: "mat-1",
        supplierId: SUPPLIER_A.id,
        name: MATERIAL.name,
        priceCents: 245_000,
        // MANUAL, not LOOKUP: conflating a typed-in price with a scraped one
        // would make the curated/own split unrecoverable from the data.
        source: "MANUAL",
      }),
    });
  });

  it("rejects a material this business does not own", async () => {
    const { svc, prisma } = harness({ materialFavourite: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(
      svc.create("biz-1", { supplierId: SUPPLIER_A.id, materialFavouriteId: "mat-x", priceCents: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialPriceEntry.create).not.toHaveBeenCalled();
  });

  it("scopes the supplier lookup to this business", async () => {
    // Suppliers are tenant-private, so naming another tenant's supplier by id
    // would leak its name and parish back through the comparison view.
    const { svc, prisma } = harness();
    await svc.create("biz-1", { supplierId: SUPPLIER_A.id, materialFavouriteId: "mat-1", priceCents: 1 });
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: SUPPLIER_A.id, businessId: "biz-1", deletedAt: null },
    });
  });

  it("rejects a retired supplier", async () => {
    const { svc, prisma } = harness({ supplier: { findFirst: vi.fn().mockResolvedValue(null) } });
    await expect(
      svc.create("biz-1", { supplierId: "sup-dead", materialFavouriteId: "mat-1", priceCents: 1 }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialPriceEntry.create).not.toHaveBeenCalled();
  });

  it("inserts rather than updating, so repeated prices build history", async () => {
    const { svc, prisma } = harness();
    await svc.create("biz-1", { supplierId: SUPPLIER_A.id, materialFavouriteId: "mat-1", priceCents: 1 });
    await svc.create("biz-1", { supplierId: SUPPLIER_A.id, materialFavouriteId: "mat-1", priceCents: 2 });
    expect(prisma.materialPriceEntry.create).toHaveBeenCalledTimes(2);
  });
});

describe("MaterialPricesService.remove", () => {
  it("deletes an entry this business recorded", async () => {
    const { svc, prisma } = harness({
      materialPriceEntry: {
        findUnique: vi.fn().mockResolvedValue({ id: "pe-1", businessId: "biz-1" }),
        delete: vi.fn().mockResolvedValue({}),
      },
    });
    await svc.remove("biz-1", "pe-1");
    expect(prisma.materialPriceEntry.delete).toHaveBeenCalledWith({ where: { id: "pe-1" } });
  });

  it("refuses to delete a platform-curated price", async () => {
    const { svc, prisma } = harness({
      materialPriceEntry: {
        findUnique: vi.fn().mockResolvedValue({ id: "pe-1", businessId: null }),
        delete: vi.fn(),
      },
    });
    await expect(svc.remove("biz-1", "pe-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.materialPriceEntry.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete another business's price entry", async () => {
    const { svc, prisma } = harness({
      materialPriceEntry: {
        findUnique: vi.fn().mockResolvedValue({ id: "pe-1", businessId: "biz-2" }),
        delete: vi.fn(),
      },
    });
    await expect(svc.remove("biz-1", "pe-1")).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.materialPriceEntry.delete).not.toHaveBeenCalled();
  });
});
