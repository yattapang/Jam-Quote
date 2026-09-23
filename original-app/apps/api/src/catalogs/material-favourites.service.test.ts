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
function withPrisma(
  materialFavourite: Partial<Record<string, unknown>> = {},
  supplier: Partial<Record<string, unknown>> = {},
) {
  const prisma = {
    materialFavourite: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ...materialFavourite,
    },
    // Default: any supplierId checked resolves as owned by this business, so
    // existing tests that don't care about suppliers pass unmodified.
    supplier: {
      findFirst: vi.fn().mockResolvedValue({ id: "supplier-owned" }),
      ...supplier,
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
  // Nothing hidden unless a test says so; hiddenIds is the only method the
  // service calls.
  const hiddenCatalog = { hiddenIds: vi.fn().mockResolvedValue(new Set<string>()) };
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svc: new MaterialFavouritesService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      schema as unknown as MaterialSchemaService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hiddenCatalog as any,
    ),
    prisma,
    schema,
    hiddenCatalog,
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

  it("checks a supplied supplierId is owned by this business before writing", async () => {
    const { svc, prisma } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", { priceCents: 1200, supplierId: "sup-1" });
    expect(prisma.supplier.findFirst).toHaveBeenCalledWith({
      where: { id: "sup-1", businessId: "biz-1", deletedAt: null },
      select: { id: true },
    });
  });

  it("refuses another tenant's supplierId — the id is stored unchecked in a plain String? column, not a Prisma relation", async () => {
    const { svc, prisma } = withPrisma(
      { create: vi.fn().mockResolvedValue({}) },
      { findFirst: vi.fn().mockResolvedValue(null) },
    );
    await expect(
      svc.create("biz-1", { priceCents: 1200, supplierId: "someone-elses" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialFavourite.create).not.toHaveBeenCalled();
  });

  it("does not call the supplier check when no supplierId is supplied", async () => {
    const { svc, prisma } = withPrisma({ create: vi.fn().mockResolvedValue({}) });
    await svc.create("biz-1", { name: "Cement", priceCents: 1200 });
    expect(prisma.supplier.findFirst).not.toHaveBeenCalled();
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

  it("clears supplierId/measureUnit/coveragePerSellUnit/wastePct when the PATCH sends null", async () => {
    const existingConfigured = {
      ...existing,
      supplierId: "sup-old",
      measureUnit: "m²",
      coveragePerSellUnit: 4,
      wastePct: 10,
    };
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue(existingConfigured),
      update: vi.fn().mockResolvedValue({}),
    });
    await svc.update("biz-1", "mat-1", {
      supplierId: null,
      measureUnit: null,
      coveragePerSellUnit: null,
      wastePct: null,
    });
    expect(prisma.materialFavourite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "mat-1" },
        data: expect.objectContaining({
          supplierId: null,
          measureUnit: null,
          coveragePerSellUnit: null,
          wastePct: null,
        }),
      }),
    );
  });

  it("clearing supplierId with null skips the supplier ownership check entirely", async () => {
    const existingWithSupplier = { ...existing, supplierId: "sup-old" };
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue(existingWithSupplier),
      update: vi.fn().mockResolvedValue({}),
    });
    await svc.update("biz-1", "mat-1", { supplierId: null });
    expect(prisma.supplier.findFirst).not.toHaveBeenCalled();
    expect(prisma.materialFavourite.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ supplierId: null }) }),
    );
  });

  it("refuses to update a row belonging to another business", async () => {
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.update("biz-1", "mat-1", { priceCents: 1 })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialFavourite.update).not.toHaveBeenCalled();
  });

  it("refuses a supplierId belonging to another business on update", async () => {
    const { svc, prisma } = withPrisma(
      { findFirst: vi.fn().mockResolvedValue(existing), update: vi.fn().mockResolvedValue({}) },
      { findFirst: vi.fn().mockResolvedValue(null) },
    );
    await expect(
      svc.update("biz-1", "mat-1", { supplierId: "someone-elses" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.materialFavourite.update).not.toHaveBeenCalled();
  });

  it("gives the identical NotFoundException for another tenant's real supplierId as for a made-up one — no existence oracle", async () => {
    const { svc } = withPrisma(
      { findFirst: vi.fn().mockResolvedValue(existing), update: vi.fn().mockResolvedValue({}) },
      { findFirst: vi.fn().mockResolvedValue(null) },
    );
    let foreignMessage: string | undefined;
    let madeUpMessage: string | undefined;
    try {
      await svc.update("biz-1", "mat-1", { supplierId: "real-but-foreign" });
    } catch (e) {
      foreignMessage = (e as NotFoundException).message;
    }
    try {
      await svc.update("biz-1", "mat-1", { supplierId: "totally-made-up" });
    } catch (e) {
      madeUpMessage = (e as NotFoundException).message;
    }
    expect(foreignMessage).toBeDefined();
    expect(foreignMessage).toBe(madeUpMessage);
  });

  it("allows re-sending the supplierId already persisted on this favourite even if it has since been soft-deleted (regression)", async () => {
    const existingWithSupplier = { ...existing, supplierId: "sup-deleted" };
    const { svc, prisma } = withPrisma(
      { findFirst: vi.fn().mockResolvedValue(existingWithSupplier), update: vi.fn().mockResolvedValue({}) },
      {
        // Live lookup (deletedAt: null) finds nothing — it's been soft-deleted.
        // Grandfathered lookup (no deletedAt filter) still finds it, because it
        // still belongs to this business.
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string; deletedAt?: null } }) =>
          Promise.resolve("deletedAt" in where ? null : { id: where.id }),
        ),
      },
    );
    await expect(
      svc.update("biz-1", "mat-1", { supplierId: "sup-deleted" }),
    ).resolves.toBeDefined();
    expect(prisma.materialFavourite.update).toHaveBeenCalled();
  });

  it("still refuses a NEWLY chosen supplierId that has been soft-deleted, even though the favourite's current supplier is grandfathered", async () => {
    const existingWithSupplier = { ...existing, supplierId: "sup-old" };
    const { svc } = withPrisma(
      { findFirst: vi.fn().mockResolvedValue(existingWithSupplier), update: vi.fn().mockResolvedValue({}) },
      {
        findFirst: vi.fn().mockImplementation(({ where }: { where: { id: string; deletedAt?: null } }) =>
          Promise.resolve("deletedAt" in where ? null : { id: where.id }),
        ),
      },
    );
    await expect(
      svc.update("biz-1", "mat-1", { supplierId: "sup-new-but-deleted" }),
    ).rejects.toBeInstanceOf(NotFoundException);
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

  it("applies `limit` AFTER the hidden filter, not as a Prisma `take`", async () => {
    // Order matters. Taking 5 rows in SQL and then dropping the hidden ones
    // returns fewer than 5 — the picker silently loses entries, and which ones
    // depends on alphabetical position. Fetch, filter, then trim.
    const rows = Array.from({ length: 8 }, (_, i) => ({ id: `m${i}`, name: `m${i}` }));
    const { svc, prisma, hiddenCatalog } = withPrisma({
      findMany: vi.fn().mockResolvedValue(rows),
    });
    hiddenCatalog.hiddenIds.mockResolvedValue(new Set(["m0", "m1", "m2"]));

    const result = await svc.findAll("biz-1", { limit: 5 });

    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith(
      expect.not.objectContaining({ take: 5 }),
    );
    expect(result).toHaveLength(5);
    expect(result.map((r) => r.id)).toEqual(["m3", "m4", "m5", "m6", "m7"]);
  });

  it("omits materials this business has hidden", async () => {
    const { svc, hiddenCatalog } = withPrisma({
      findMany: vi.fn().mockResolvedValue([{ id: "keep" }, { id: "gone" }]),
    });
    hiddenCatalog.hiddenIds.mockResolvedValue(new Set(["gone"]));
    const result = await svc.findAll("biz-1");
    expect(result.map((r) => r.id)).toEqual(["keep"]);
  });

  it("includeHidden returns them, so settings can offer a restore", async () => {
    // A material that vanished the moment it was hidden could never be brought
    // back — the settings screen is the one place it must still be listed.
    const { svc, hiddenCatalog } = withPrisma({
      findMany: vi.fn().mockResolvedValue([{ id: "keep" }, { id: "gone" }]),
    });
    const result = await svc.findAll("biz-1", {}, true);
    expect(result.map((r) => r.id)).toEqual(["keep", "gone"]);
    expect(hiddenCatalog.hiddenIds).not.toHaveBeenCalled();
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
