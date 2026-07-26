import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { AssemblyComponentKind, computeAssemblyUnitCostCents } from "@jamquote/core";
import { AssembliesService } from "./assemblies.service.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const materialComponent = {
  kind: AssemblyComponentKind.MATERIAL,
  description: "Ceramic tile, 12x12",
  quantityPerUnit: 1.1,
  unitPriceCents: 25_000,
};
const labourComponent = {
  kind: AssemblyComponentKind.LABOUR,
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
      { id: "c1", assemblyId: "a1", sort: 0, ...materialComponent },
      { id: "c2", assemblyId: "a1", sort: 1, ...labourComponent },
    ],
    ...overrides,
  };
}

function withPrisma(overrides: Partial<Record<string, unknown>> = {}) {
  const tx = {
    assembly: { create: vi.fn().mockResolvedValue({ id: "a1" }), update: vi.fn() },
    assemblyComponent: { create: vi.fn(), deleteMany: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
    assembly: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    ...overrides,
  };
  return { svc: new AssembliesService(prisma as any), prisma, tx };
}

describe("AssembliesService.create", () => {
  it("creates the assembly + components in a transaction and returns the computed unitCostCents", async () => {
    const { svc, prisma, tx } = withPrisma();
    prisma.assembly.findFirst = vi.fn().mockResolvedValue(tileAssemblyRow());

    const result = await svc.create("b1", {
      name: "Tiling — per sq ft",
      unit: "sq ft",
      markupPct: 20,
      components: [materialComponent, labourComponent],
    } as any);

    expect(tx.assembly.create).toHaveBeenCalledWith({
      data: { businessId: "b1", name: "Tiling — per sq ft", unit: "sq ft", markupPct: 20 },
    });
    expect(tx.assemblyComponent.create).toHaveBeenCalledTimes(2);
    expect(tx.assemblyComponent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        assemblyId: "a1",
        kind: AssemblyComponentKind.MATERIAL,
        sort: 0,
      }),
    });

    const expectedCost = computeAssemblyUnitCostCents({
      components: [materialComponent, labourComponent],
      markupPct: 20,
    });
    expect(result.unitCostCents).toBe(expectedCost);
  });

  it("defaults markupPct to 0 when omitted", async () => {
    const { svc, prisma, tx } = withPrisma();
    prisma.assembly.findFirst = vi.fn().mockResolvedValue(tileAssemblyRow({ markupPct: 0 }));

    await svc.create("b1", {
      name: "Tiling — per sq ft",
      unit: "sq ft",
      components: [],
    } as any);

    expect(tx.assembly.create).toHaveBeenCalledWith({
      data: { businessId: "b1", name: "Tiling — per sq ft", unit: "sq ft", markupPct: 0 },
    });
  });
});

describe("AssembliesService.findAll", () => {
  it("scopes to the business, excludes soft-deleted rows, and computes unitCostCents", async () => {
    const { svc, prisma } = withPrisma();
    prisma.assembly.findMany = vi.fn().mockResolvedValue([tileAssemblyRow()]);

    const result = await svc.findAll("b1");

    expect(prisma.assembly.findMany).toHaveBeenCalledWith({
      where: { businessId: "b1", deletedAt: null },
      include: { components: { orderBy: { sort: "asc" } } },
      orderBy: { name: "asc" },
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.unitCostCents).toBe(
      computeAssemblyUnitCostCents({
        components: [materialComponent, labourComponent],
        markupPct: 20,
      }),
    );
  });
});

describe("AssembliesService.findOne", () => {
  it("throws NotFoundException when no matching (non-deleted) row exists", async () => {
    const { svc, prisma } = withPrisma();
    prisma.assembly.findFirst = vi.fn().mockResolvedValue(null);
    await expect(svc.findOne("b1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AssembliesService.update", () => {
  it("replaces components (delete old, insert new) when components is provided", async () => {
    const { svc, prisma, tx } = withPrisma();
    prisma.assembly.findFirst = vi
      .fn()
      // assertExists lookup
      .mockResolvedValueOnce(tileAssemblyRow())
      // findOne lookup after update
      .mockResolvedValueOnce(tileAssemblyRow({ markupPct: 25 }));

    const newComponent = {
      kind: AssemblyComponentKind.OTHER,
      description: "Grout",
      quantityPerUnit: 0.05,
      unitPriceCents: 10_000,
    };

    await svc.update("b1", "a1", { markupPct: 25, components: [newComponent] } as any);

    expect(tx.assembly.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { name: "Tiling — per sq ft", unit: "sq ft", markupPct: 25 },
    });
    expect(tx.assemblyComponent.deleteMany).toHaveBeenCalledWith({
      where: { assemblyId: "a1" },
    });
    expect(tx.assemblyComponent.create).toHaveBeenCalledTimes(1);
    expect(tx.assemblyComponent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assemblyId: "a1", kind: AssemblyComponentKind.OTHER }),
    });
  });

  it("leaves the existing components untouched when components is omitted", async () => {
    const { svc, prisma, tx } = withPrisma();
    prisma.assembly.findFirst = vi
      .fn()
      .mockResolvedValueOnce(tileAssemblyRow())
      .mockResolvedValueOnce(tileAssemblyRow({ name: "Tiling (updated)" }));

    await svc.update("b1", "a1", { name: "Tiling (updated)" } as any);

    expect(tx.assemblyComponent.deleteMany).not.toHaveBeenCalled();
    expect(tx.assemblyComponent.create).not.toHaveBeenCalled();
  });

  it("throws NotFoundException instead of updating when the row is already gone", async () => {
    const { svc, prisma, tx } = withPrisma();
    prisma.assembly.findFirst = vi.fn().mockResolvedValue(null);
    await expect(svc.update("b1", "missing", { name: "x" } as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(tx.assembly.update).not.toHaveBeenCalled();
  });
});

describe("AssembliesService.remove", () => {
  it("soft-deletes by setting deletedAt instead of removing the row", async () => {
    const { svc, prisma } = withPrisma();
    prisma.assembly.findFirst = vi.fn().mockResolvedValue(tileAssemblyRow());
    prisma.assembly.update = vi.fn();

    await svc.remove("b1", "a1");

    expect(prisma.assembly.update).toHaveBeenCalledWith({
      where: { id: "a1" },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("throws NotFoundException instead of deleting when the row is already gone", async () => {
    const { svc, prisma } = withPrisma();
    prisma.assembly.findFirst = vi.fn().mockResolvedValue(null);
    await expect(svc.remove("b1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
