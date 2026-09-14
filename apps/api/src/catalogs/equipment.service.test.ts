import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { EquipmentService } from "./equipment.service.js";

function withPrisma(equipmentItem: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    equipmentItem: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      ...equipmentItem,
    },
  };
  const hiddenCatalog = { hiddenIds: vi.fn().mockResolvedValue(new Set<string>()) };
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svc: new EquipmentService(prisma as any, hiddenCatalog as any),
    prisma,
    hiddenCatalog,
  };
}

describe("EquipmentService.findOne", () => {
  it("throws NotFoundException when no matching row exists", async () => {
    const { svc, prisma } = withPrisma({ findFirst: vi.fn().mockResolvedValue(null) });
    await expect(svc.findOne("biz-1", "item-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.equipmentItem.findFirst).toHaveBeenCalledWith({
      where: { id: "item-1", businessId: "biz-1" },
    });
  });
});

describe("EquipmentService.update", () => {
  it("passes a null unitLabel straight through to Prisma, clearing it", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "item-1", businessId: "biz-1" }),
      update: vi.fn().mockResolvedValue({ id: "item-1" }),
    });
    await svc.update("biz-1", "item-1", { unitLabel: null });
    expect(prisma.equipmentItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { unitLabel: null },
    });
  });

  it("clears a stale hire vendor when switching hired -> owned via null", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "item-1", businessId: "biz-1" }),
      update: vi.fn().mockResolvedValue({ id: "item-1" }),
    });
    await svc.update("biz-1", "item-1", { owned: true, vendor: null, vendorPhone: null });
    expect(prisma.equipmentItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { owned: true, vendor: null, vendorPhone: null },
    });
  });
});
