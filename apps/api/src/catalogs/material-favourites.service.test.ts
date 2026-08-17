import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { MaterialFavouritesService } from "./material-favourites.service.js";
import type { MaterialSchemaService } from "./material-schema.service.js";

/**
 * Prisma is mocked throughout this file. MaterialSchemaService is stubbed too:
 * what it decides (validation, name composition, vocabulary capture) is
 * covered in material-schema.test.ts — here we only care that
 * MaterialFavouritesService routes writes THROUGH it and persists what it
 * returns, rather than trusting client input.
 */
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
  const schema = {
    assertUnitVisible: vi.fn().mockResolvedValue(undefined),
    normalizeForWrite: vi.fn().mockImplementation(
      (_biz: string, input: { name?: string; specs?: Record<string, string> }) => ({
        name: input.name ?? "composed name",
        specs: input.specs ?? null,
        searchText: (input.name ?? "composed name").toLowerCase(),
      }),
    ),
  };
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svc: new MaterialFavouritesService(prisma as any, schema as unknown as MaterialSchemaService),
    prisma,
    schema,
  };
}

describe("MaterialFavouritesService.create", () => {
  it("persists the name/specs/searchText the schema service decided, not the raw input", async () => {
    const { svc, prisma, schema } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    schema.normalizeForWrite.mockResolvedValue({
      name: "Lumber 2x4 16ft Cedar Select",
      specs: { dimension: "2x4", length: "16ft", species: "Cedar", grade: "Select" },
      searchText: "lumber 2x4 16ft cedar select",
    });

    await svc.create("biz-1", {
      priceCents: 25000,
      categoryDefId: "11111111-1111-1111-1111-111111111111",
      specs: { dimension: "2x4" },
    });

    expect(prisma.materialFavourite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: "biz-1",
          name: "Lumber 2x4 16ft Cedar Select",
          specs: { dimension: "2x4", length: "16ft", species: "Cedar", grade: "Select" },
          searchText: "lumber 2x4 16ft cedar select",
        }),
      }),
    );
  });

  it("checks a supplied unitId is visible to this business before writing", async () => {
    const { svc, schema } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", { priceCents: 1200, unitId: "22222222-2222-2222-2222-222222222222" });
    // Ids are not capabilities: without this check a tenant could reference
    // another tenant's private unit by guessing its id.
    expect(schema.assertUnitVisible).toHaveBeenCalledWith("biz-1", "22222222-2222-2222-2222-222222222222");
  });

  it("does not call the unit check when no unitId is supplied", async () => {
    const { svc, schema } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", { name: "Cement", priceCents: 1200 });
    expect(schema.assertUnitVisible).not.toHaveBeenCalled();
  });

  it("still accepts a bare name + price (pre-2a clients)", async () => {
    const { svc, prisma } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", { name: "Cement", priceCents: 1200 });
    expect(prisma.materialFavourite.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Cement", priceCents: 1200, businessId: "biz-1" }),
      }),
    );
  });
});

describe("MaterialFavouritesService.update", () => {
  const existing = {
    id: "mat-1",
    businessId: "biz-1",
    categoryDefId: "cat-1",
    specs: { dimension: "2x4" },
    name: "Lumber 2x4",
    nameCustom: false,
    description: null,
  };

  it("normalizes against the MERGED row, not the patch alone", async () => {
    const { svc, schema } = withPrisma({
      findFirst: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue({}),
    });

    await svc.update("biz-1", "mat-1", { priceCents: 30000 });

    // A price-only PATCH must still see the existing category/specs, or the
    // name would be recomposed from nothing and the material would be renamed
    // as a side effect of a price change.
    expect(schema.normalizeForWrite).toHaveBeenCalledWith(
      "biz-1",
      { priceCents: 30000 },
      expect.objectContaining({ categoryDefId: "cat-1", specs: { dimension: "2x4" }, name: "Lumber 2x4" }),
    );
  });

  it("writes back the recomposed name and searchText", async () => {
    const { svc, prisma, schema } = withPrisma({
      findFirst: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue({}),
    });
    schema.normalizeForWrite.mockResolvedValue({
      name: "Lumber 2x4 20ft",
      specs: { dimension: "2x4", length: "20ft" },
      searchText: "lumber 2x4 20ft",
    });

    await svc.update("biz-1", "mat-1", { specs: { dimension: "2x4", length: "20ft" } });

    expect(prisma.materialFavourite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mat-1" },
        data: expect.objectContaining({ name: "Lumber 2x4 20ft", searchText: "lumber 2x4 20ft" }),
      }),
    );
  });

  it("allows clearing description with an empty string", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue(existing),
      update: vi.fn().mockResolvedValue({}),
    });
    await svc.update("biz-1", "mat-1", { description: "" });
    expect(prisma.materialFavourite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mat-1" },
        data: expect.objectContaining({ description: "" }),
      }),
    );
  });

  it("refuses to update a row belonging to another business", async () => {
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.update("biz-1", "mat-1", { priceCents: 1 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialFavourite.update).not.toHaveBeenCalled();
  });
});

describe("every endpoint returns the same material shape", () => {
  // The client resolves a material's sold-by unit as `unitRef?.label ?? unit`.
  // For a post-2a material the legacy `unit` column is null, so any endpoint
  // that omits this join returns a material with no unit at all. That is not a
  // cosmetic difference: a create response is piped straight onto the quote
  // line the contractor is building, so the unit they just picked disappeared
  // and the line printed the bare rate cadence instead ("1 unit" for rebar
  // sold by the linear foot). Read paths had the join and writes did not,
  // which is why it only ever bit freshly created and freshly edited rows.
  it("create joins unitRef", async () => {
    const { svc, prisma } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", { name: "Rebar", priceCents: 100 });
    expect(prisma.materialFavourite.create).toHaveBeenCalledWith(
      expect.objectContaining({ include: { unitRef: true } }),
    );
  });

  it("update joins unitRef", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "mat-1", businessId: "biz-1", specs: null }),
      update: vi.fn().mockResolvedValue({}),
    });
    await svc.update("biz-1", "mat-1", { priceCents: 1 });
    expect(prisma.materialFavourite.update).toHaveBeenCalledWith(
      expect.objectContaining({ include: { unitRef: true } }),
    );
  });
});

describe("MaterialFavouritesService.findOne", () => {
  it("throws NotFoundException when no matching row exists", async () => {
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.findOne("biz-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialFavourite.findFirst).toHaveBeenCalledWith({
      where: { id: "missing", businessId: "biz-1", deletedAt: null },
      include: { unitRef: true },
    });
  });
});

describe("MaterialFavouritesService.findAll", () => {
  it("returns everything when no params are given", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1");
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", deletedAt: null },
      orderBy: { name: "asc" },
      // The unit is a FK as of 2a; consumers render its label from here.
      include: { unitRef: true },
    });
  });

  it("excludes soft-deleted rows", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1");
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
    );
  });

  it("filters by the legacy free-text category", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1", { category: "Steel / Rebar" });
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: "Steel / Rebar" }),
      }),
    );
  });

  it("filters by categoryDefId", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1", { categoryDefId: "cat-1" });
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryDefId: "cat-1" }) }),
    );
  });

  it("applies `limit` via Prisma `take`", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1", { limit: 5 });
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it("searches the denormalized searchText, lowercased to match how it is stored", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1", { q: "Cedar" });
    const where = prisma.materialFavourite.findMany.mock.calls[0]![0].where;
    expect(where.OR).toContainEqual({ searchText: { contains: "cedar" } });
  });

  it("also matches name/description case-insensitively as a fallback", async () => {
    // Belt and braces: if a row ever lacks searchText, search degrades rather
    // than silently returning nothing for a material that plainly matches.
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1", { q: "weathered" });
    const where = prisma.materialFavourite.findMany.mock.calls[0]![0].where;
    expect(where.OR).toContainEqual({ name: { contains: "weathered", mode: "insensitive" } });
    expect(where.OR).toContainEqual({ description: { contains: "weathered", mode: "insensitive" } });
  });

  it("treats SQL metacharacters in `q` as literal text", async () => {
    // No raw SQL is involved any more — Prisma parameterizes `contains` — so
    // the string can only ever be matched, never executed.
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    const malicious = "' OR 1=1 --";
    await svc.findAll("biz-1", { q: malicious });
    const where = prisma.materialFavourite.findMany.mock.calls[0]![0].where;
    expect(where.OR).toContainEqual({ searchText: { contains: malicious.toLowerCase() } });
  });
});

describe("MaterialFavouritesService.remove", () => {
  it("soft-deletes by setting deletedAt instead of removing the row", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "mat-1", businessId: "biz-1" }),
    });
    await svc.remove("biz-1", "mat-1");
    expect(prisma.materialFavourite.update).toHaveBeenCalledWith({
      where: { id: "mat-1" },
      data: { deletedAt: expect.any(Date) },
    });
    expect(prisma.materialFavourite.delete).not.toHaveBeenCalled();
  });

  it("throws NotFoundException instead of deleting when the row is already gone", async () => {
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.remove("biz-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialFavourite.update).not.toHaveBeenCalled();
    expect(prisma.materialFavourite.delete).not.toHaveBeenCalled();
  });
});
