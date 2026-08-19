import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { PurchasesService } from "./purchases.service.js";

function build(opts: {
  project?: unknown;
  invoices?: unknown[];
  purchases?: unknown[];
  trn?: string | null;
} = {}) {
  const prisma = {
    project: {
      findFirst: vi.fn().mockResolvedValue("project" in opts ? opts.project : { id: "proj-1" }),
    },
    purchase: {
      findMany: vi.fn().mockResolvedValue(opts.purchases ?? []),
      findFirst: vi.fn().mockResolvedValue({ id: "pu-1", businessId: "biz-1" }),
      create: vi.fn().mockImplementation((args: { data: unknown }) => args.data),
      update: vi.fn().mockImplementation((args: { data: unknown }) => args.data),
    },
    invoice: { findMany: vi.fn().mockResolvedValue(opts.invoices ?? []) },
    business: {
      findUnique: vi.fn().mockResolvedValue({ trn: "trn" in opts ? opts.trn : "102-458-963" }),
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = new PurchasesService(prisma as any);
  return { svc, prisma };
}

describe("recording a purchase", () => {
  it("accepts one with NO project — overheads have no job", async () => {
    // Fuel, phone, insurance. A required project would make contractors invent
    // one, poisoning every job-profit figure afterwards.
    const { svc, prisma } = build();
    await svc.create("biz-1", {
      description: "Fuel",
      amountCents: 5_000,
      purchasedAt: new Date().toISOString(),
    });
    expect(prisma.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: null }) }),
    );
  });

  it("refuses a project belonging to another business", async () => {
    // Ids are not capabilities: otherwise a tenant could attach spend to
    // someone else's job by guessing an id.
    const { svc } = build({ project: null });
    await expect(
      svc.create("biz-1", {
        description: "Cement",
        amountCents: 10_000,
        purchasedAt: new Date().toISOString(),
        projectId: "someone-elses",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("defaults GCT to zero — plenty of suppliers are not registered", async () => {
    const { svc, prisma } = build();
    await svc.create("biz-1", {
      description: "Sand",
      amountCents: 8_000,
      purchasedAt: new Date().toISOString(),
    });
    expect(prisma.purchase.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ gctCents: 0 }) }),
    );
  });
});

describe("editing a purchase", () => {
  it("writes only the keys sent, so re-assigning a job keeps the rest", async () => {
    const { svc, prisma } = build();
    await svc.update("biz-1", "pu-1", { projectId: "proj-1" });
    expect(prisma.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { projectId: "proj-1" } }),
    );
  });

  it("an explicit null detaches the job without touching anything else", async () => {
    const { svc, prisma } = build();
    await svc.update("biz-1", "pu-1", { projectId: null });
    expect(prisma.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { projectId: null } }),
    );
  });
});

describe("listing purchases", () => {
  it("treats projectId: null as 'overheads only', not as no filter", async () => {
    // The distinction is the feature: it is how a contractor sees what belongs
    // to no job at all.
    const { svc, prisma } = build();
    await svc.findAll("biz-1", { projectId: null });
    expect(prisma.purchase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ projectId: null }) }),
    );
  });

  it("omits the filter entirely when none was given", async () => {
    const { svc, prisma } = build();
    await svc.findAll("biz-1", {});
    const where = prisma.purchase.findMany.mock.calls[0]![0].where;
    expect(where).not.toHaveProperty("projectId");
  });
});

describe("did this job make money?", () => {
  const invoiced = { status: "INVOICED", totalCents: 500_000, paidCents: 200_000 };

  it("nets reclaimable GCT off cost when the business has a TRN", async () => {
    const { svc } = build({
      invoices: [invoiced],
      purchases: [{ amountCents: 115_000, gctCents: 15_000 }],
      trn: "102-458-963",
    });
    const p = await svc.projectProfit("biz-1", "proj-1");
    expect(p.costExGctCents).toBe(100_000);
    expect(p.netProfitCents).toBe(400_000);
  });

  it("does NOT net it off for a contractor with no TRN", async () => {
    // They never reclaim it, so treating it as recoverable would overstate the
    // margin on every job they do.
    const { svc } = build({
      invoices: [invoiced],
      purchases: [{ amountCents: 115_000, gctCents: 15_000 }],
      trn: null,
    });
    const p = await svc.projectProfit("biz-1", "proj-1");
    expect(p.costExGctCents).toBe(115_000);
    expect(p.netProfitCents).toBe(385_000);
  });

  it("reads revenue from INVOICES, never from quotes", async () => {
    // A quote is what was hoped for; an invoice is what was billed.
    const { svc, prisma } = build({ invoices: [invoiced] });
    await svc.projectProfit("biz-1", "proj-1");
    expect(prisma.invoice.findMany).toHaveBeenCalled();
    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "proj-1", businessId: "biz-1" } }),
    );
  });

  it("refuses a project this business does not own", async () => {
    const { svc } = build({ project: null });
    await expect(svc.projectProfit("biz-1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});
