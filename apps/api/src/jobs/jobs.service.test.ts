import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { JobComponentKind, computeJobUnitCostCents } from "@jamquote/core";
import { JobsService } from "./jobs.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const materialComponent = {
  kind: JobComponentKind.MATERIAL,
  description: "Ceramic tile, 12x12",
  quantityPerUnit: 1.1,
  unitPriceCents: 25_000,
};
const labourComponent = {
  kind: JobComponentKind.LABOUR,
  description: "Tiler labour",
  quantityPerUnit: 0.2,
  unitPriceCents: 800_000,
};

function tileAssemblyRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "a1",
    businessId: "b1",
    name: "Tiling — per sq ft",
    unit: "sq ft",
    markupPct: 20,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    components: [
      { id: "c1", jobId: "a1", sort: 0, ...materialComponent },
      { id: "c2", jobId: "a1", sort: 1, ...labourComponent },
    ],
    ...overrides,
  };
}

function withPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  const tx = {
    job: { create: vi.fn().mockResolvedValue({ id: "a1" }), update: vi.fn() },
    jobComponent: { create: vi.fn(), deleteMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    job: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    // The job's CURRENT components, read in update() to grandfather in
    // already-persisted refs even if since soft-deleted. Default: none.
    jobComponent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    // Ownership lookups for component refs. Default: whatever id is asked
    // for, one row comes back "owned" (findMany count matches the id count),
    // so existing tests that don't care about this pass unmodified.
    materialFavourite: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id: string) => ({ id }))),
      ),
    },
    labourRate: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id: string) => ({ id }))),
      ),
    },
    equipmentItem: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(where.id.in.map((id: string) => ({ id }))),
      ),
    },
    ...overrides,
  };
  return { svc: new JobsService(prisma as any), prisma, tx };
}

describe("JobsService.create", () => {
  it("creates the job + components in a transaction and returns the computed unitCostCents", async () => {
    const { svc, prisma, tx } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValue(tileAssemblyRow());

    const result = await svc.create("b1", {
      name: "Tiling — per sq ft",
      unit: "sq ft",
      markupPct: 20,
      components: [materialComponent, labourComponent],
    } as any);

    expect(tx.job.create).toHaveBeenCalledWith({
      data: { businessId: "b1", name: "Tiling — per sq ft", unit: "sq ft", markupPct: 20 },
    });
    expect(tx.jobComponent.create).toHaveBeenCalledTimes(2);
    expect(tx.jobComponent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        jobId: "a1",
        kind: JobComponentKind.MATERIAL,
        sort: 0,
      }),
    });

    const expectedCost = computeJobUnitCostCents({
      components: [materialComponent, labourComponent],
      markupPct: 20,
    });
    expect(result.unitCostCents).toBe(expectedCost);
  });

  it("defaults markupPct to 0 when omitted", async () => {
    const { svc, prisma, tx } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValue(tileAssemblyRow({ markupPct: 0 }));

    await svc.create("b1", {
      name: "Tiling — per sq ft",
      unit: "sq ft",
      components: [],
    } as any);

    expect(tx.job.create).toHaveBeenCalledWith({
      data: { businessId: "b1", name: "Tiling — per sq ft", unit: "sq ft", markupPct: 0 },
    });
  });
});

describe("JobsService.create — component ownership", () => {
  it("refuses a materialFavouriteId belonging to another business", async () => {
    const { svc, prisma } = withPrisma();
    prisma.materialFavourite.findMany = vi.fn().mockResolvedValue([]); // not found for this business
    await expect(
      svc.create("b1", {
        name: "x",
        unit: "sq ft",
        components: [{ ...materialComponent, materialFavouriteId: "someone-elses" }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a labourRateId belonging to another business", async () => {
    const { svc, prisma } = withPrisma();
    prisma.labourRate.findMany = vi.fn().mockResolvedValue([]);
    await expect(
      svc.create("b1", {
        name: "x",
        unit: "sq ft",
        components: [{ ...labourComponent, labourRateId: "someone-elses" }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses an equipmentItemId belonging to another business", async () => {
    const { svc, prisma } = withPrisma();
    prisma.equipmentItem.findMany = vi.fn().mockResolvedValue([]);
    await expect(
      svc.create("b1", {
        name: "x",
        unit: "sq ft",
        components: [{ ...materialComponent, equipmentItemId: "someone-elses" }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("gives the identical NotFoundException for a made-up id as for another tenant's real id — no existence oracle", async () => {
    const { svc, prisma } = withPrisma();
    prisma.materialFavourite.findMany = vi.fn().mockResolvedValue([]);
    let foreignMessage: string | undefined;
    let madeUpMessage: string | undefined;
    try {
      await svc.create("b1", {
        name: "x",
        unit: "sq ft",
        components: [{ ...materialComponent, materialFavouriteId: "real-but-foreign" }],
      } as any);
    } catch (e) {
      foreignMessage = (e as NotFoundException).message;
    }
    try {
      await svc.create("b1", {
        name: "x",
        unit: "sq ft",
        components: [{ ...materialComponent, materialFavouriteId: "totally-made-up" }],
      } as any);
    } catch (e) {
      madeUpMessage = (e as NotFoundException).message;
    }
    expect(foreignMessage).toBeDefined();
    expect(foreignMessage).toBe(madeUpMessage);
  });

  it("batches the lookup for multiple components and de-dupes repeated ids", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValue(tileAssemblyRow());
    await svc.create("b1", {
      name: "x",
      unit: "sq ft",
      components: [
        { ...materialComponent, materialFavouriteId: "m1" },
        { ...materialComponent, materialFavouriteId: "m1" },
        { ...materialComponent, materialFavouriteId: "m2" },
      ],
    } as any);
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.materialFavourite.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["m1", "m2"] }, businessId: "b1", deletedAt: null }),
      }),
    );
  });

  it("allows components with no refs at all (plain OTHER lines)", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValue(tileAssemblyRow());
    await svc.create("b1", { name: "x", unit: "sq ft", components: [materialComponent] } as any);
    expect(prisma.materialFavourite.findMany).not.toHaveBeenCalled();
  });
});

describe("JobsService.update — component ownership", () => {
  it("refuses a foreign materialFavouriteId on a replacement component list", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValue(tileAssemblyRow());
    prisma.materialFavourite.findMany = vi.fn().mockResolvedValue([]);
    await expect(
      svc.update("b1", "a1", {
        components: [{ ...materialComponent, materialFavouriteId: "someone-elses" }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not check refs when components is omitted from the patch", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findFirst = vi
      .fn()
      .mockResolvedValueOnce(tileAssemblyRow())
      .mockResolvedValueOnce(tileAssemblyRow({ name: "x" }));
    await svc.update("b1", "a1", { name: "x" } as any);
    expect(prisma.materialFavourite.findMany).not.toHaveBeenCalled();
  });

  it("allows re-sending a materialFavouriteId already persisted on this job even if it has since been soft-deleted (rename regression)", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findFirst = vi
      .fn()
      .mockResolvedValueOnce(tileAssemblyRow())
      .mockResolvedValueOnce(tileAssemblyRow({ name: "Renamed" }));
    // The job currently has a component referencing "m-deleted".
    prisma.jobComponent.findMany = vi.fn().mockResolvedValue([
      { materialFavouriteId: "m-deleted", labourRateId: null, equipmentItemId: null },
    ]);
    // That material is now soft-deleted: the plain "live" lookup finds nothing,
    // but the grandfathered (no deletedAt filter) lookup does.
    prisma.materialFavourite.findMany = vi.fn().mockImplementation(({ where }: any) =>
      Promise.resolve(
        "deletedAt" in where ? [] : where.id.in.map((id: string) => ({ id })),
      ),
    );

    await expect(
      svc.update("b1", "a1", {
        name: "Renamed",
        components: [{ ...materialComponent, materialFavouriteId: "m-deleted" }],
      } as any),
    ).resolves.toBeDefined();
  });

  it("still refuses a NEWLY introduced materialFavouriteId that has been soft-deleted, even though other ids on the job are grandfathered", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValueOnce(tileAssemblyRow());
    // Job currently has no components referencing anything.
    prisma.jobComponent.findMany = vi.fn().mockResolvedValue([]);
    // "m-deleted" is soft-deleted and was never on this job before.
    prisma.materialFavourite.findMany = vi.fn().mockImplementation(({ where }: any) =>
      Promise.resolve("deletedAt" in where ? [] : where.id.in.map((id: string) => ({ id }))),
    );

    await expect(
      svc.update("b1", "a1", {
        components: [{ ...materialComponent, materialFavouriteId: "m-deleted" }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("still refuses a foreign materialFavouriteId even if it happens to match an id string already on the job (grandfathering re-checks businessId)", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValueOnce(tileAssemblyRow());
    prisma.jobComponent.findMany = vi.fn().mockResolvedValue([
      { materialFavouriteId: "someone-elses", labourRateId: null, equipmentItemId: null },
    ]);
    // Even without the deletedAt filter, it belongs to another business.
    prisma.materialFavourite.findMany = vi.fn().mockResolvedValue([]);

    await expect(
      svc.update("b1", "a1", {
        components: [{ ...materialComponent, materialFavouriteId: "someone-elses" }],
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("JobsService.findAll", () => {
  it("scopes to the business, excludes soft-deleted rows, and computes unitCostCents", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findMany = vi.fn().mockResolvedValue([tileAssemblyRow()]);

    const result = await svc.findAll("b1");

    expect(prisma.job.findMany).toHaveBeenCalledWith({
      where: { businessId: "b1", deletedAt: null },
      include: { components: { orderBy: { sort: "asc" } } },
      orderBy: { name: "asc" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.unitCostCents).toBe(
      computeJobUnitCostCents({
        components: [materialComponent, labourComponent],
        markupPct: 20,
      }),
    );
  });
});

describe("JobsService.findOne", () => {
  it("throws NotFoundException when no matching (non-deleted) row exists", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValue(null);
    await expect(svc.findOne("b1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("JobsService.update", () => {
  it("replaces components (delete old, insert new) when components is provided", async () => {
    const { svc, prisma, tx } = withPrisma();
    prisma.job.findFirst = vi
      .fn()
      // assertExists lookup
      .mockResolvedValueOnce(tileAssemblyRow())
      // findOne lookup after update
      .mockResolvedValueOnce(tileAssemblyRow({ markupPct: 25 }));

    const newComponent = {
      kind: JobComponentKind.OTHER,
      description: "Grout",
      quantityPerUnit: 0.05,
      unitPriceCents: 10_000,
    };

    await svc.update("b1", "a1", { markupPct: 25, components: [newComponent] } as any);

    expect(tx.job.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { name: "Tiling — per sq ft", unit: "sq ft", markupPct: 25 },
    });
    expect(tx.jobComponent.deleteMany).toHaveBeenCalledWith({
      where: { jobId: "a1" },
    });
    expect(tx.jobComponent.create).toHaveBeenCalledTimes(1);
    expect(tx.jobComponent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ jobId: "a1", kind: JobComponentKind.OTHER }),
    });
  });

  it("leaves the existing components untouched when components is omitted", async () => {
    const { svc, prisma, tx } = withPrisma();
    prisma.job.findFirst = vi
      .fn()
      .mockResolvedValueOnce(tileAssemblyRow())
      .mockResolvedValueOnce(tileAssemblyRow({ name: "Tiling (updated)" }));

    await svc.update("b1", "a1", { name: "Tiling (updated)" } as any);

    expect(tx.jobComponent.deleteMany).not.toHaveBeenCalled();
    expect(tx.jobComponent.create).not.toHaveBeenCalled();
  });

  it("throws NotFoundException instead of updating when the row is already gone", async () => {
    const { svc, prisma, tx } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValue(null);
    await expect(svc.update("b1", "missing", { name: "x" } as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.job.update).not.toHaveBeenCalled();
  });
});

describe("JobsService.remove", () => {
  it("soft-deletes by setting deletedAt instead of removing the row", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValue(tileAssemblyRow());
    prisma.job.update = vi.fn();

    await svc.remove("b1", "a1");

    expect(prisma.job.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("throws NotFoundException instead of deleting when the row is already gone", async () => {
    const { svc, prisma } = withPrisma();
    prisma.job.findFirst = vi.fn().mockResolvedValue(null);
    await expect(svc.remove("b1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
