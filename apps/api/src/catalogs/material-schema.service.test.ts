import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { MaterialSchemaService } from "./material-schema.service.js";

const CURATED_CATEGORY = {
  id: "cat-lumber",
  businessId: null,
  key: "lumber",
  label: "Lumber",
  sort: 10,
  attributes: [
    {
      id: "att-species",
      businessId: null,
      key: "species",
      label: "Species",
      kind: "ENUM",
      unit: null,
      required: false,
      includeInName: true,
      nameOrder: 1,
      sort: 0,
      options: [{ id: "opt-cedar", businessId: "biz-1", value: "cedar", label: "Cedar" }],
    },
  ],
};

const CURATED_UNIT = { id: "unit-bag", businessId: null, key: "bag", label: "Bag", sort: 10 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function harness(over: Record<string, any> = {}) {
  const prisma = {
    materialCategoryDef: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    materialUnit: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    ...over,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new MaterialSchemaService(prisma as any, { hiddenIds: vi.fn().mockResolvedValue(new Set<string>()) } as any), prisma };
}

describe("MaterialSchemaService.getSchema", () => {
  it("flags tenant rows as custom and curated rows as not, all the way down", async () => {
    const { svc } = harness({
      materialCategoryDef: { findMany: vi.fn().mockResolvedValue([CURATED_CATEGORY]) },
      materialUnit: {
        findMany: vi.fn().mockResolvedValue([
          CURATED_UNIT,
          { id: "unit-drum", businessId: "biz-1", key: "drum", label: "Drum", sort: 900 },
        ]),
      },
    });

    const schema = await svc.getSchema("biz-1");

    expect(schema.categories[0]?.custom).toBe(false);
    expect(schema.categories[0]?.attributes[0]?.custom).toBe(false);
    // The tenant added "Cedar" to a curated attribute — that option is theirs.
    expect(schema.categories[0]?.attributes[0]?.options[0]?.custom).toBe(true);
    expect(schema.units.map((u) => u.custom)).toEqual([false, true]);
  });
});

describe("MaterialSchemaService.createCategory", () => {
  it("returns an existing curated category rather than shadowing it", async () => {
    const { svc, prisma } = harness({
      materialCategoryDef: {
        findFirst: vi.fn().mockResolvedValue(CURATED_CATEGORY),
        create: vi.fn(),
      },
    });

    const view = await svc.createCategory("biz-1", { label: "lumber" });

    expect(view.id).toBe("cat-lumber");
    expect(view.custom).toBe(false);
    // The full attribute tree comes back too, so the client can splice this
    // straight into its cached schema without a refetch.
    expect(view.attributes).toHaveLength(1);
    expect(prisma.materialCategoryDef.create).not.toHaveBeenCalled();
  });

  it("looks for the match across curated rows and this tenant's own", async () => {
    const { svc, prisma } = harness({
      materialCategoryDef: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "cat-new",
          businessId: "biz-1",
          key: "rebar",
          label: "Rebar",
          sort: 900,
          attributes: [],
        }),
      },
    });
    await svc.createCategory("biz-1", { label: "Rebar" });
    expect(prisma.materialCategoryDef.findFirst.mock.calls[0]?.[0].where).toEqual({
      label: { equals: "Rebar", mode: "insensitive" },
      deletedAt: null,
      OR: [{ businessId: null }, { businessId: "biz-1" }],
    });
  });

  it("creates a tenant-owned category with a slugified key and no attributes", async () => {
    const created = {
      id: "cat-new",
      businessId: "biz-1",
      key: "pool-tiling",
      label: "Pool Tiling",
      sort: 900,
      attributes: [],
    };
    const { svc, prisma } = harness({
      materialCategoryDef: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    });

    const view = await svc.createCategory("biz-1", { label: "Pool Tiling" });

    expect(prisma.materialCategoryDef.create.mock.calls[0]?.[0].data).toEqual({
      businessId: "biz-1",
      key: "pool-tiling",
      label: "Pool Tiling",
      sort: 900,
    });
    expect(view).toEqual({
      id: "cat-new",
      key: "pool-tiling",
      label: "Pool Tiling",
      sort: 900,
      custom: true,
      attributes: [],
    });
  });

  it("rejects a label that slugifies to nothing", async () => {
    // "###" would produce an empty key, which would then collide with any
    // other punctuation-only label.
    const { svc, prisma } = harness();
    await expect(svc.createCategory("biz-1", { label: "###" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.materialCategoryDef.create).not.toHaveBeenCalled();
  });
});

describe("MaterialSchemaService.createUnit", () => {
  it("returns an existing unit rather than creating a duplicate", async () => {
    const { svc, prisma } = harness({
      materialUnit: { findFirst: vi.fn().mockResolvedValue(CURATED_UNIT), create: vi.fn() },
    });

    expect(await svc.createUnit("biz-1", { label: "BAG" })).toEqual({
      id: "unit-bag",
      key: "bag",
      label: "Bag",
      sort: 10,
      custom: false,
    });
    expect(prisma.materialUnit.create).not.toHaveBeenCalled();
  });

  it("creates a tenant-owned unit with a slugified key", async () => {
    const { svc, prisma } = harness({
      materialUnit: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "unit-new",
          businessId: "biz-1",
          key: "half-drum",
          label: "Half Drum",
          sort: 900,
        }),
      },
    });

    const view = await svc.createUnit("biz-1", { label: "Half Drum" });

    expect(prisma.materialUnit.create).toHaveBeenCalledWith({
      data: { businessId: "biz-1", key: "half-drum", label: "Half Drum", sort: 900 },
    });
    expect(view.custom).toBe(true);
  });

  it("rejects a label that slugifies to nothing", async () => {
    const { svc, prisma } = harness();
    await expect(svc.createUnit("biz-1", { label: "—" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.materialUnit.create).not.toHaveBeenCalled();
  });
});
