import { describe, expect, it, vi } from "vitest";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { SuppliersService } from "./suppliers.service.js";

const OWN = { id: "sup-1", businessId: "biz-1", name: "Rapid True Value", deletedAt: null };
const OTHER = { id: "sup-2", businessId: "biz-2", name: "Somebody Else Hardware", deletedAt: null };
const LEGACY = { id: "sup-3", businessId: null, name: "H&L True Value", deletedAt: null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function harness(supplier: Record<string, any> = {}) {
  const prisma = {
    supplier: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(OWN),
      update: vi.fn().mockResolvedValue(OWN),
      delete: vi.fn(),
      ...supplier,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new SuppliersService(prisma as any), prisma };
}

describe("SuppliersService.findAll", () => {
  it("returns only this business's own live suppliers", async () => {
    // A NULL businessId is legacy platform data, not a shared directory —
    // unlike MaterialCategoryDef/MaterialUnit, there is no `OR businessId:
    // null` here, and adding one would show every tenant those rows.
    const { svc, prisma } = harness({ findMany: vi.fn().mockResolvedValue([OWN]) });
    await svc.findAll("biz-1");
    expect(prisma.supplier.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", deletedAt: null },
      orderBy: { name: "asc" },
    });
  });
});

describe("SuppliersService.create", () => {
  it("returns the existing supplier instead of creating a duplicate", async () => {
    const { svc, prisma } = harness({ findFirst: vi.fn().mockResolvedValue(OWN) });
    expect(await svc.create("biz-1", { name: "rapid true value" })).toEqual(OWN);
    expect(prisma.supplier.create).not.toHaveBeenCalled();
  });

  it("matches an existing name case-insensitively, within this business only", async () => {
    const { svc, prisma } = harness();
    await svc.create("biz-1", { name: "Rapid True Value" });
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: "biz-1",
        deletedAt: null,
        name: { equals: "Rapid True Value", mode: "insensitive" },
      },
    });
  });

  it("creates a supplier owned by the calling business", async () => {
    const { svc, prisma } = harness();
    await svc.create("biz-1", { name: "  Corner Hardware  " });
    expect(prisma.supplier.create).toHaveBeenCalledWith({
      data: { name: "Corner Hardware", businessId: "biz-1" },
    });
  });
});

describe("SuppliersService ownership checks", () => {
  it("refuses to update a legacy platform supplier", async () => {
    // Until #28 this was reachable with no authentication at all. A row with
    // no owner is nobody's to edit.
    const { svc, prisma } = harness({ findFirst: vi.fn().mockResolvedValue(LEGACY) });
    await expect(svc.update("biz-1", LEGACY.id, { name: "Mine now" })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.supplier.update).not.toHaveBeenCalled();
  });

  it("refuses to delete a legacy platform supplier", async () => {
    const { svc, prisma } = harness({ findFirst: vi.fn().mockResolvedValue(LEGACY) });
    await expect(svc.remove("biz-1", LEGACY.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.supplier.update).not.toHaveBeenCalled();
  });

  it("hides another tenant's supplier behind a 404 rather than a 403", async () => {
    // Ids are not capabilities, and a 403 would confirm the row exists.
    const { svc, prisma } = harness({ findFirst: vi.fn().mockResolvedValue(OTHER) });
    await expect(svc.findOne("biz-1", OTHER.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.update("biz-1", OTHER.id, { name: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(svc.remove("biz-1", OTHER.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supplier.update).not.toHaveBeenCalled();
  });

  it("returns its own supplier", async () => {
    const { svc } = harness({ findFirst: vi.fn().mockResolvedValue(OWN) });
    expect(await svc.findOne("biz-1", OWN.id)).toEqual(OWN);
  });

  it("updates its own supplier", async () => {
    const { svc, prisma } = harness({ findFirst: vi.fn().mockResolvedValue(OWN) });
    await svc.update("biz-1", OWN.id, { name: "Rapid" });
    expect(prisma.supplier.update).toHaveBeenCalledWith({
      where: { id: OWN.id },
      data: { name: "Rapid" },
    });
  });
});

describe("SuppliersService.remove", () => {
  it("soft-deletes rather than removing the row", async () => {
    // MaterialPriceEntry.supplierId is ON DELETE RESTRICT and
    // QuoteLineItem.supplierId ON DELETE SET NULL — a hard delete would
    // either fail outright or strip the supplier off already-sent quotes.
    const { svc, prisma } = harness({ findFirst: vi.fn().mockResolvedValue(OWN) });
    await svc.remove("biz-1", OWN.id);
    expect(prisma.supplier.update).toHaveBeenCalledWith({
      where: { id: OWN.id },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.supplier.delete).not.toHaveBeenCalled();
  });

  it("404s on an already soft-deleted supplier", async () => {
    const { svc } = harness({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.remove("biz-1", OWN.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
