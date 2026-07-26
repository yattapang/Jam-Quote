import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { LabourRatesService } from "./labour-rates.service.js";

function withPrisma(labourRate: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    labourRate: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      ...labourRate,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new LabourRatesService(prisma as any), prisma };
}

describe("LabourRatesService.findAll", () => {
  it("scopes to the business and excludes soft-deleted rows", async () => {
    const { svc, prisma } = withPrisma({ findMany: vi.fn().mockResolvedValue([]) });
    await svc.findAll("biz-1");
    expect(prisma.labourRate.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1", deletedAt: null },
      orderBy: { trade: "asc" },
    });
  });
});

describe("LabourRatesService.findOne", () => {
  it("throws NotFoundException when no matching (non-deleted) row exists", async () => {
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.findOne("biz-1", "rate-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.labourRate.findFirst).toHaveBeenCalledWith({
      where: { id: "rate-1", businessId: "biz-1", deletedAt: null },
    });
  });
});

describe("LabourRatesService.remove", () => {
  it("soft-deletes by setting deletedAt instead of removing the row", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "rate-1", businessId: "biz-1" }),
    });
    await svc.remove("biz-1", "rate-1");
    expect(prisma.labourRate.update).toHaveBeenCalledWith({
      where: { id: "rate-1" },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it("throws NotFoundException instead of deleting when the row is already gone", async () => {
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.remove("biz-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.labourRate.update).not.toHaveBeenCalled();
  });
});
