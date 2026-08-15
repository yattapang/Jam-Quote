import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import {
  buildSearchText,
  composeMaterialName,
  normalizeOptionValue,
  slugifyKey,
  type AttributeShape,
} from "./material-schema.js";
import { MaterialSchemaService } from "./material-schema.service.js";

const attr = (over: Partial<AttributeShape> & { key: string }): AttributeShape => ({
  label: over.key,
  kind: "ENUM",
  required: false,
  includeInName: false,
  nameOrder: null,
  ...over,
});

describe("normalizeOptionValue", () => {
  it("folds case and surrounding whitespace so one value does not become three", () => {
    const forms = ["Cedar", "cedar", "  CEDAR  "];
    expect(new Set(forms.map(normalizeOptionValue)).size).toBe(1);
  });

  it("collapses internal whitespace", () => {
    expect(normalizeOptionValue("Portland  Type   I")).toBe("portland type i");
  });
});

describe("slugifyKey", () => {
  it("turns a display label into a machine key", () => {
    expect(slugifyKey("Bag size")).toBe("bag-size");
    expect(slugifyKey("  Moisture / Content  ")).toBe("moisture-content");
  });
});

describe("composeMaterialName", () => {
  const lumber = [
    attr({ key: "dimension", includeInName: true, nameOrder: 1 }),
    attr({ key: "length", includeInName: true, nameOrder: 2 }),
    attr({ key: "species", includeInName: true, nameOrder: 3 }),
    attr({ key: "grade", includeInName: true, nameOrder: 4 }),
    attr({ key: "notes", includeInName: false }),
  ];

  it("builds the name from the includeInName attributes in nameOrder", () => {
    expect(
      composeMaterialName("Lumber", lumber, {
        dimension: "2x4",
        length: "16ft",
        species: "Cedar",
        grade: "Select",
      }),
    ).toBe("Lumber 2x4 16ft Cedar Select");
  });

  it("ignores attributes not flagged for the name", () => {
    expect(composeMaterialName("Lumber", lumber, { dimension: "2x4", notes: "warped" })).toBe("Lumber 2x4");
  });

  it("orders by nameOrder rather than by the order specs happen to be in", () => {
    expect(composeMaterialName("Lumber", lumber, { grade: "Select", dimension: "2x4" })).toBe(
      "Lumber 2x4 Select",
    );
  });

  it("skips unset attributes instead of leaving holes in the name", () => {
    expect(composeMaterialName("Lumber", lumber, { dimension: "2x4", grade: "Select" })).toBe(
      "Lumber 2x4 Select",
    );
  });

  it("falls back to the bare category label when nothing is filled in", () => {
    expect(composeMaterialName("Lumber", lumber, {})).toBe("Lumber");
  });
});

describe("buildSearchText", () => {
  it("covers name, description and spec VALUES", () => {
    const s = buildSearchText("Lumber 2x4", "leftover from Palisadoes", {
      dimension: "2x4",
      species: "Cedar",
    });
    for (const term of ["lumber", "palisadoes", "2x4", "cedar"]) expect(s).toContain(term);
  });

  it("omits spec keys — nobody searches for 'species'", () => {
    expect(buildSearchText("Board", null, { species: "Cedar" })).not.toContain("species");
  });

  it("tolerates missing description and specs", () => {
    expect(buildSearchText("Cement", null, null)).toBe("cement");
  });
});

// sellUnitsRequired's own tests moved with it to
// packages/core/src/quote/coverage.test.ts. It is only re-exported here.

// ---------------------------------------------------------------------------

const LUMBER = {
  id: "cat-lumber",
  key: "lumber",
  label: "Lumber",
  attributes: [
    {
      id: "a-dim", key: "dimension", label: "Dimension", kind: "ENUM", required: false,
      includeInName: true, nameOrder: 1,
      options: [{ id: "o1", value: "2x4", label: "2x4" }],
    },
    {
      id: "a-species", key: "species", label: "Species", kind: "ENUM", required: false,
      includeInName: true, nameOrder: 2,
      options: [{ id: "o2", value: "cedar", label: "Cedar" }],
    },
  ],
};

function withPrisma(category: unknown = LUMBER) {
  const prisma = {
    materialCategoryDef: { findFirst: vi.fn().mockResolvedValue(category), findMany: vi.fn() },
    materialUnit: { findFirst: vi.fn().mockResolvedValue({ id: "u1" }), findMany: vi.fn() },
    materialAttributeOption: { create: vi.fn().mockResolvedValue({}) },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new MaterialSchemaService(prisma as any), prisma };
}

describe("MaterialSchemaService.normalizeForWrite", () => {
  it("composes the name from the specs rather than trusting the client's", async () => {
    const { svc } = withPrisma();
    const out = await svc.normalizeForWrite("biz-1", {
      categoryDefId: "cat-lumber",
      name: "whatever the client sent",
      specs: { dimension: "2x4", species: "Cedar" },
    });
    expect(out.name).toBe("Lumber 2x4 Cedar");
  });

  it("keeps a pinned name instead of recomposing it", async () => {
    // Pinned names are already on quotes the contractor has sent; recomposing
    // would silently change a customer-facing document.
    const { svc } = withPrisma();
    const out = await svc.normalizeForWrite("biz-1", {
      categoryDefId: "cat-lumber",
      name: "Grandpa's special stock",
      nameCustom: true,
      specs: { dimension: "2x4" },
    });
    expect(out.name).toBe("Grandpa's special stock");
  });

  it("rejects a spec key the category does not define", async () => {
    // An unknown key would be invisible in the form and therefore
    // un-editable — exactly how the pre-2a untyped blob rotted.
    const { svc } = withPrisma();
    await expect(
      svc.normalizeForWrite("biz-1", { categoryDefId: "cat-lumber", specs: { colour: "red" } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("records an off-vocabulary ENUM value as a TENANT option rather than blocking the write", async () => {
    const { svc, prisma } = withPrisma();
    const out = await svc.normalizeForWrite("biz-1", {
      categoryDefId: "cat-lumber",
      specs: { species: "Ironwood" },
    });
    expect(prisma.materialAttributeOption.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attributeId: "a-species",
        businessId: "biz-1", // tenant-scoped: never widens the curated list
        value: "ironwood",
        label: "Ironwood",
      }),
    });
    expect(out.specs).toEqual({ species: "Ironwood" }); // original casing kept
  });

  it("reuses an existing option when only the casing differs", async () => {
    const { svc, prisma } = withPrisma();
    await svc.normalizeForWrite("biz-1", { categoryDefId: "cat-lumber", specs: { species: "CEDAR" } });
    expect(prisma.materialAttributeOption.create).not.toHaveBeenCalled();
  });

  it("rejects a required attribute that is missing", async () => {
    const required = {
      ...LUMBER,
      attributes: [{ ...LUMBER.attributes[0], required: true }],
    };
    const { svc } = withPrisma(required);
    await expect(
      svc.normalizeForWrite("biz-1", { categoryDefId: "cat-lumber", specs: {} }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a non-numeric value for a NUMBER attribute", async () => {
    const numeric = {
      ...LUMBER,
      attributes: [
        { id: "a-len", key: "len", label: "Length", kind: "NUMBER", required: false,
          includeInName: false, nameOrder: null, options: [] },
      ],
    };
    const { svc } = withPrisma(numeric);
    await expect(
      svc.normalizeForWrite("biz-1", { categoryDefId: "cat-lumber", specs: { len: "sixteen" } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("treats an empty spec value as 'not set' rather than an error", async () => {
    const { svc } = withPrisma();
    const out = await svc.normalizeForWrite("biz-1", {
      categoryDefId: "cat-lumber",
      specs: { dimension: "2x4", species: "  " },
    });
    expect(out.specs).toEqual({ dimension: "2x4" });
  });

  it("rejects a category this business cannot see", async () => {
    // findFirst is already scoped to curated-or-own, so another tenant's
    // private category resolves to null here.
    const { svc } = withPrisma(null);
    await expect(
      svc.normalizeForWrite("biz-1", { categoryDefId: "someone-elses-category" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("falls back to the typed name when the material has no category", async () => {
    const { svc } = withPrisma();
    const out = await svc.normalizeForWrite("biz-1", { name: "Random offcut" });
    expect(out.name).toBe("Random offcut");
    expect(out.searchText).toBe("random offcut");
  });

  it("requires a name when there is no category to compose one from", async () => {
    const { svc } = withPrisma();
    await expect(svc.normalizeForWrite("biz-1", {})).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("MaterialSchemaService.assertUnitVisible", () => {
  it("accepts a curated or own unit", async () => {
    const { svc } = withPrisma();
    await expect(svc.assertUnitVisible("biz-1", "u1")).resolves.toBeUndefined();
  });

  it("rejects a unit id this business cannot see", async () => {
    const { svc, prisma } = withPrisma();
    prisma.materialUnit.findFirst.mockResolvedValue(null);
    await expect(svc.assertUnitVisible("biz-1", "someone-elses-unit")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("scopes the lookup to curated-or-own", async () => {
    const { svc, prisma } = withPrisma();
    await svc.assertUnitVisible("biz-1", "u1");
    expect(prisma.materialUnit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ businessId: null }, { businessId: "biz-1" }],
        }),
      }),
    );
  });
});
