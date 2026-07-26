import { describe, expect, it, vi } from "vitest";
import { TradesService, MASTER_TRADES } from "./trades.service.js";

function withPrisma(trade: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    trade: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      ...trade,
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new TradesService(prisma as any), prisma };
}

describe("TradesService.findAll", () => {
  it("merges global + business-custom trades, de-duped by name and sorted", async () => {
    const { svc, prisma } = withPrisma({
      findMany: vi.fn().mockResolvedValue([
        { id: "g1", businessId: null, name: "Electrician" },
        { id: "g2", businessId: null, name: "Mason" },
        { id: "c1", businessId: "biz-1", name: "electrician" }, // dup, different case
        { id: "c2", businessId: "biz-1", name: "Pool Installer" },
      ]),
    });
    const result = await svc.findAll("biz-1");
    expect(prisma.trade.findMany).toHaveBeenCalledWith({
      where: { OR: [{ businessId: null }, { businessId: "biz-1" }] },
    });
    // "electrician" custom dup is dropped in favour of the global row.
    expect(result).toEqual([
      { id: "g1", name: "Electrician", custom: false },
      { id: "g2", name: "Mason", custom: false },
      { id: "c2", name: "Pool Installer", custom: true },
    ]);
  });

  it("falls back to the in-code master list when the query throws (table missing)", async () => {
    const { svc } = withPrisma({ findMany: vi.fn().mockRejectedValue(new Error("relation does not exist")) });
    const result = await svc.findAll("biz-1");
    expect(result).toEqual(
      [...MASTER_TRADES].sort((a, b) => a.name.localeCompare(b.name)),
    );
  });
});

describe("TradesService.create", () => {
  it("returns the existing trade instead of creating a duplicate", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue({ id: "g1", businessId: null, name: "Mason" }),
    });
    const result = await svc.create("biz-1", { name: "mason" });
    expect(result).toEqual({ id: "g1", name: "Mason", custom: false });
    expect(prisma.trade.create).not.toHaveBeenCalled();
  });

  it("creates a business-custom trade when no match exists", async () => {
    const { svc, prisma } = withPrisma({
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "new-1", businessId: "biz-1", name: "Pool Installer" }),
    });
    const result = await svc.create("biz-1", { name: "Pool Installer" });
    expect(prisma.trade.create).toHaveBeenCalledWith({
      data: { businessId: "biz-1", name: "Pool Installer" },
    });
    expect(result).toEqual({ id: "new-1", name: "Pool Installer", custom: true });
  });
});
