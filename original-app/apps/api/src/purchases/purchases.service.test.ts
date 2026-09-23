import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import { PurchasesService } from "./purchases.service.js";

function build(opts: {
  project?: unknown;
  invoices?: unknown[];
  purchases?: unknown[];
  labour?: unknown[];
  trn?: string | null;
  gctRegistered?: boolean;
  supplier?: unknown;
} = {}) {
  const prisma = {
    project: {
      findFirst: vi.fn().mockResolvedValue("project" in opts ? opts.project : { id: "proj-1" }),
    },
    purchase: {
      findMany: vi.fn().mockResolvedValue(opts.purchases ?? []),
      findFirst: vi.fn().mockResolvedValue({ id: "pu-1", businessId: "biz-1", supplierId: null }),
      create: vi.fn().mockImplementation((args: { data: unknown }) => args.data),
      update: vi.fn().mockImplementation((args: { data: unknown }) => args.data),
    },
    invoice: { findMany: vi.fn().mockResolvedValue(opts.invoices ?? []) },
    labourEntry: {
      findMany: vi.fn().mockResolvedValue(opts.labour ?? []),
      findFirst: vi.fn().mockResolvedValue({ id: "le-1" }),
      create: vi.fn().mockImplementation((args: { data: unknown }) => args.data),
      update: vi.fn().mockImplementation((args: { data: unknown }) => args.data),
    },
    labourRate: { findFirst: vi.fn().mockResolvedValue({ id: "lr-1" }) },
    supplier: {
      findFirst: vi.fn().mockResolvedValue("supplier" in opts ? opts.supplier : { id: "sup-1" }),
    },
    business: {
      // Default registered, so the pre-existing cases keep their meaning. The
      // TRN is returned too, so a derivation that reads it instead of the flag
      // has something to (wrongly) find.
      findUnique: vi.fn().mockResolvedValue({
        trn: "trn" in opts ? opts.trn : "102-458-963",
        gctRegistered: opts.gctRegistered ?? true,
      }),
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

  it("refuses a supplier belonging to another business (S7)", async () => {
    // Ids are not capabilities: a caller-supplied supplierId must be checked
    // exactly like projectId, or a tenant could attach spend to another
    // business's supplier by guessing an id.
    const { svc } = build({ supplier: null });
    await expect(
      svc.create("biz-1", {
        description: "Rebar",
        amountCents: 10_000,
        purchasedAt: new Date().toISOString(),
        supplierId: "someone-elses-supplier",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a soft-deleted supplier (S7)", async () => {
    const { svc } = build({ supplier: null }); // findFirst excludes deletedAt, so a
    // soft-deleted row also resolves to null — same shape as "foreign".
    await expect(
      svc.create("biz-1", {
        description: "Rebar",
        amountCents: 10_000,
        purchasedAt: new Date().toISOString(),
        supplierId: "soft-deleted-supplier",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a made-up supplier id, with the identical 404 (S7)", async () => {
    const { svc } = build({ supplier: null });
    await expect(
      svc.create("biz-1", {
        description: "Rebar",
        amountCents: 10_000,
        purchasedAt: new Date().toISOString(),
        supplierId: "not-a-real-id",
      }),
    ).rejects.toThrow("Supplier not found");
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

  it("refuses reassigning to a supplier this business does not own (S7)", async () => {
    const { svc } = build({ supplier: null });
    await expect(
      svc.update("biz-1", "pu-1", { supplierId: "someone-elses-supplier" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a made-up supplier id on update, with the identical 404 (S7)", async () => {
    const { svc } = build({ supplier: null });
    await expect(
      svc.update("biz-1", "pu-1", { supplierId: "not-a-real-id" }),
    ).rejects.toThrow("Supplier not found");
  });

  it("keeps an UNCHANGED supplierId even if it has since been soft-deleted (S7)", async () => {
    // Old purchases must stay editable. supplier.findFirst returning null here
    // would represent the supplier being soft-deleted since the purchase was
    // made — the check must not even ask, because the value isn't changing.
    const { svc, prisma } = build({ supplier: null });
    prisma.purchase.findFirst.mockResolvedValue({
      id: "pu-1",
      businessId: "biz-1",
      supplierId: "sup-1",
    });
    await svc.update("biz-1", "pu-1", { supplierId: "sup-1", note: "still same supplier" });
    expect(prisma.supplier.findFirst).not.toHaveBeenCalled();
    expect(prisma.purchase.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ supplierId: "sup-1" }) }),
    );
  });

  it("still checks a NEWLY introduced supplierId, even when it replaces a soft-deleted one", async () => {
    const { svc, prisma } = build({ supplier: null });
    prisma.purchase.findFirst.mockResolvedValue({
      id: "pu-1",
      businessId: "biz-1",
      supplierId: "sup-old",
    });
    await expect(
      svc.update("biz-1", "pu-1", { supplierId: "sup-new-but-foreign" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supplier.findFirst).toHaveBeenCalled();
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
  // gctCents: 0 — an unregistered contractor charging none, which is what these
  // cases were implicitly testing all along. Revenue is measured net of output
  // GCT, because it is collected for TAJ and never the contractor's money.
  const invoiced = { status: "INVOICED", totalCents: 500_000, paidCents: 200_000, gctCents: 0 };

  it("nets reclaimable GCT off cost when the business is GCT-registered", async () => {
    const { svc } = build({
      invoices: [invoiced],
      purchases: [{ amountCents: 115_000, gctCents: 15_000 }],
      trn: "102-458-963",
      gctRegistered: true,
    });
    const p = await svc.projectProfit("biz-1", "proj-1");
    expect(p.costExGctCents).toBe(100_000);
    expect(p.netProfitCents).toBe(400_000);
  });

  it("does NOT net it off for a sole trader with a personal TRN who is not registered", async () => {
    // Every Jamaican has a TRN. Having one is not being registered with TAJ,
    // and treating it as such overstated this contractor's margin on every job.
    const { svc } = build({
      invoices: [invoiced],
      purchases: [{ amountCents: 115_000, gctCents: 15_000 }],
      trn: "102-458-963",
      gctRegistered: false,
    });
    const p = await svc.projectProfit("biz-1", "proj-1");
    expect(p.registeredForGct).toBe(false);
    expect(p.inputTaxCents).toBe(15_000);
    expect(p.costExGctCents).toBe(115_000);
    expect(p.netProfitCents).toBe(385_000);
  });

  it("nets it off for a registered business even with no TRN on file", async () => {
    // The flag is the owner's answer; the TRN field is not consulted at all.
    const { svc } = build({
      invoices: [invoiced],
      purchases: [{ amountCents: 115_000, gctCents: 15_000 }],
      trn: null,
      gctRegistered: true,
    });
    const p = await svc.projectProfit("biz-1", "proj-1");
    expect(p.registeredForGct).toBe(true);
    expect(p.costExGctCents).toBe(100_000);
    expect(p.netProfitCents).toBe(400_000);
  });

  it("does NOT net it off for an unregistered contractor with no TRN", async () => {
    // They never reclaim it, so treating it as recoverable would overstate the
    // margin on every job they do.
    const { svc } = build({
      invoices: [invoiced],
      purchases: [{ amountCents: 115_000, gctCents: 15_000 }],
      trn: null,
      gctRegistered: false,
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
    // `deletedAt: null` is new and deliberate. This module kept its own private
    // ownership check, which omitted it — so spend could be attached to a project
    // the contractor had deleted while a quote could not. It now delegates to the
    // shared helper, which is stricter.
    expect(prisma.project.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "proj-1", businessId: "biz-1", deletedAt: null } }),
    );
  });

  it("refuses a project this business does not own", async () => {
    const { svc } = build({ project: null });
    await expect(svc.projectProfit("biz-1", "nope")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("labour is part of the cost, and it is the biggest part", () => {
  const invoiced = { status: "INVOICED", totalCents: 1_000_000, paidCents: 0, gctCents: 0 };

  it("counts wages against the job", async () => {
    // Before this existed every profit figure overstated: costs counted the
    // cement and not the men who laid it.
    const { svc } = build({
      invoices: [invoiced],
      labour: [{ quantity: "5", rateCents: 400_000 }],
    });
    const p = await svc.projectProfit("biz-1", "proj-1");
    expect(p.labourCostCents).toBe(2_000_000);
    expect(p.netProfitCents).toBe(-1_000_000);
  });

  it("carries NO reclaimable GCT on wages", async () => {
    // Wages are not a supply. A subcontractor who invoices with GCT is a
    // Purchase, which is why the two stay separate.
    const { svc } = build({
      invoices: [invoiced],
      labour: [{ quantity: "2", rateCents: 100_000 }],
      trn: "102-458-963",
    });
    const p = await svc.projectProfit("biz-1", "proj-1");
    expect(p.inputTaxCents).toBe(0);
    expect(p.costExGctCents).toBe(200_000);
  });

  it("splits labour from materials, because 'cost' alone is not actionable", async () => {
    const { svc } = build({
      invoices: [invoiced],
      purchases: [{ amountCents: 115_000, gctCents: 15_000 }],
      labour: [{ quantity: "3", rateCents: 50_000 }],
    });
    const p = await svc.projectProfit("biz-1", "proj-1");
    expect(p.labourCostCents).toBe(150_000);
    // 100_000, not 115_000: purchaseCostCents is now derived from costExGctCents
    // so the two components add up to the Cost figure shown above them. Taken
    // from the gross cost, the parts exceeded the whole by the reclaimable GCT.
    expect(p.purchaseCostCents).toBe(100_000);
    expect(p.costCents).toBe(265_000);
  });

  it("handles a half day", async () => {
    const { svc } = build({ labour: [{ quantity: "2.5", rateCents: 400_000 }] });
    expect((await svc.projectProfit("biz-1", "proj-1")).labourCostCents).toBe(1_000_000);
  });

  it("accepts an entry with NO job — admin time is a real cost", async () => {
    const { svc, prisma } = build();
    await svc.createLabour("biz-1", {
      description: "Office admin",
      quantity: 1,
      rateCents: 300_000,
      workedOn: new Date().toISOString(),
    });
    expect(prisma.labourEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ projectId: null }) }),
    );
  });

  it("refuses a labour rate belonging to another business", async () => {
    const { svc, prisma } = build();
    prisma.labourRate.findFirst.mockResolvedValue(null);
    await expect(
      svc.createLabour("biz-1", {
        description: "Mason",
        quantity: 1,
        rateCents: 400_000,
        workedOn: new Date().toISOString(),
        labourRateId: "someone-elses",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a made-up labour rate id, with the identical 404", async () => {
    const { svc, prisma } = build();
    prisma.labourRate.findFirst.mockResolvedValue(null);
    await expect(
      svc.createLabour("biz-1", {
        description: "Mason",
        quantity: 1,
        rateCents: 400_000,
        workedOn: new Date().toISOString(),
        labourRateId: "not-a-real-id",
      }),
    ).rejects.toThrow("Labour rate not found");
  });

  it("accepts a labour rate this business owns even after it was soft-deleted — an offline replay must still land", async () => {
    // createLabour pins its own rateCents; the FK is a label, not a live price
    // lookup, so refusing a rate the contractor themselves deleted since would
    // break an ordinary replay or a late edit. The check must ask ownership
    // only, without deletedAt — unlike the shared assertLabourRateOwned other
    // callers use for a check-then-price lookup.
    const { svc, prisma } = build();
    // Ownership check queries WITHOUT deletedAt, so a soft-deleted-but-owned
    // rate still resolves here — simulate that directly.
    prisma.labourRate.findFirst.mockResolvedValue({ id: "lr-1" });
    await svc.createLabour("biz-1", {
      description: "Mason",
      quantity: 1,
      rateCents: 400_000,
      workedOn: new Date().toISOString(),
      labourRateId: "lr-1",
    });
    expect(prisma.labourRate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "lr-1", businessId: "biz-1" } }),
    );
    // Deliberately no deletedAt key in that where — the assertion above is the
    // guard: a rewrite that reintroduces `deletedAt: null` here would fail it.
    const where = prisma.labourRate.findFirst.mock.calls[0]![0].where;
    expect(where).not.toHaveProperty("deletedAt");
  });

  it("defaults the unit to days — how construction labour is usually bought", async () => {
    const { svc, prisma } = build();
    await svc.createLabour("biz-1", {
      description: "Devon",
      quantity: 2,
      rateCents: 400_000,
      workedOn: new Date().toISOString(),
    });
    expect(prisma.labourEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ unitLabel: "day" }) }),
    );
  });
});
