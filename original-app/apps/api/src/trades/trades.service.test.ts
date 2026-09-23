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
  // Nothing hidden unless a test says so — see the hiding tests below.
  const hiddenCatalog = { hiddenIds: vi.fn().mockResolvedValue(new Set<string>()) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { svc: new TradesService(prisma as any, hiddenCatalog as any), prisma, hiddenCatalog };
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

/**
 * Hiding a trade shortens THIS tenant's picker and nobody else's. The curated
 * master trades are shared rows, so the filter cannot live in the SQL `where`
 * — there is no column on Trade that says "Kenyatta doesn't use plumbers".
 * These pin that the filtering happens, and that it is scoped.
 */
describe("TradesService.findAll — hidden trades", () => {
  const rows = [
    { id: "t-mason", name: "Mason", businessId: null },
    { id: "t-plumber", name: "Plumber", businessId: null },
    { id: "t-custom", name: "Tiler", businessId: "b1" },
  ];

  it("drops hidden trades from the picker", async () => {
    const { svc, hiddenCatalog } = withPrisma({ findMany: vi.fn().mockResolvedValue(rows) });
    hiddenCatalog.hiddenIds.mockResolvedValue(new Set(["t-plumber"]));

    const names = (await svc.findAll("b1")).map((t) => t.name);
    expect(names).toContain("Mason");
    expect(names).not.toContain("Plumber");
  });

  it("hides a tenant's OWN custom trade just the same", async () => {
    const { svc, hiddenCatalog } = withPrisma({ findMany: vi.fn().mockResolvedValue(rows) });
    hiddenCatalog.hiddenIds.mockResolvedValue(new Set(["t-custom"]));

    expect((await svc.findAll("b1")).map((t) => t.name)).not.toContain("Tiler");
  });

  it("asks only for THIS business's hidden list", async () => {
    // The scoping is the safety property: an unscoped lookup would hide a
    // curated trade for every tenant on the platform.
    const { svc, hiddenCatalog } = withPrisma({ findMany: vi.fn().mockResolvedValue(rows) });
    await svc.findAll("b1");
    expect(hiddenCatalog.hiddenIds).toHaveBeenCalledWith("b1", "TRADE");
  });

  it("returns everything when the caller asks to include hidden rows", async () => {
    // The settings screen must list hidden entries in order to restore them.
    const { svc, hiddenCatalog } = withPrisma({ findMany: vi.fn().mockResolvedValue(rows) });
    hiddenCatalog.hiddenIds.mockResolvedValue(new Set(["t-plumber"]));

    expect(await svc.findAll("b1", true)).toHaveLength(3);
    expect(hiddenCatalog.hiddenIds).not.toHaveBeenCalled();
  });
});
