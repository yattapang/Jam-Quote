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
