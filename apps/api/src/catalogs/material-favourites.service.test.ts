import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { MaterialFavouritesService } from "./material-favourites.service.js";

function withPrisma(materialFavourite: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    materialFavourite: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ...materialFavourite,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new MaterialFavouritesService(prisma as any), prisma };
}

describe("MaterialFavouritesService.create", () => {
  it("passes the optional category + specs straight through to prisma", async () => {
    const { svc, prisma } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", {
      name: "Rebar 1/2in",
      priceCents: 25000,
      category: "Steel / Rebar",
      specs: { Diameter: "1/2in", Length: "20ft" },
    });
    expect(prisma.materialFavourite.create).toHaveBeenCalledWith({
      data: {
        name: "Rebar 1/2in",
        priceCents: 25000,
        category: "Steel / Rebar",
        specs: { Diameter: "1/2in", Length: "20ft" },
        businessId: "biz-1",
      },
    });
  });

  it("still works with no category/specs (backward compatible)", async () => {
    const { svc, prisma } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", { name: "Cement", priceCents: 1200 });
    expect(prisma.materialFavourite.create).toHaveBeenCalledWith({
      data: { name: "Cement", priceCents: 1200, businessId: "biz-1" },
    });
  });
});

describe("MaterialFavouritesService.update", () => {
  it("passes category + specs through on update", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "mat-1", businessId: "biz-1" }),
      update: vi.fn().mockResolvedValue({}),
    });
    await svc.update("biz-1", "mat-1", { category: "Blocks", specs: { Size: "6in", Type: "Solid" } });
    expect(prisma.materialFavourite.update).toHaveBeenCalledWith({
      where: { id: "mat-1" },
      data: { category: "Blocks", specs: { Size: "6in", Type: "Solid" } },
    });
  });
});

describe("MaterialFavouritesService.findOne", () => {
  it("throws NotFoundException when no matching row exists", async () => {
    const { svc } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.findOne("biz-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
