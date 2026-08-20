import { Injectable, NotFoundException } from "@nestjs/common";
import type { Purchase } from "@prisma/client";
import { computeJobProfit, labourEntryCostCents, type JobProfit } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import type {
  CreateLabourEntryInput,
  CreatePurchaseInput,
  LabourEntryQuery,
  PurchaseQuery,
  UpdatePurchaseInput,
} from "./purchases.dto.js";

/**
 * What a contractor spent — the cost side of job costing.
 *
 * Every method is tenant-scoped on businessId. That is not boilerplate: a
 * purchase is commercially sensitive in a way a price list is not, since it
 * reveals what a competitor pays their suppliers.
 */
@Injectable()
export class PurchasesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(businessId: string, filters: PurchaseQuery = {}): Promise<Purchase[]> {
    return this.prisma.purchase.findMany({
      where: {
        businessId,
        deletedAt: null,
        // `projectId: null` is a MEANINGFUL filter, not an absent one — it is
        // how a contractor sees overheads that belong to no job. So it is
        // matched on presence of the key, not on truthiness.
        ...(filters.projectId !== undefined ? { projectId: filters.projectId } : {}),
        ...(filters.from || filters.to
          ? {
              purchasedAt: {
                ...(filters.from ? { gte: new Date(filters.from) } : {}),
                ...(filters.to ? { lte: new Date(filters.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { purchasedAt: "desc" },
      ...(filters.limit !== undefined ? { take: filters.limit } : {}),
    });
  }

  async findOne(businessId: string, id: string): Promise<Purchase> {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!purchase) throw new NotFoundException("Purchase not found");
    return purchase;
  }

  async create(businessId: string, input: CreatePurchaseInput): Promise<Purchase> {
    await this.assertProjectOwned(businessId, input.projectId);
    return this.prisma.purchase.create({
      data: {
        businessId,
        projectId: input.projectId ?? null,
        supplierId: input.supplierId ?? null,
        description: input.description,
        amountCents: input.amountCents,
        gctCents: input.gctCents ?? 0,
        category: input.category ?? null,
        purchasedAt: new Date(input.purchasedAt),
        reference: input.reference ?? null,
        note: input.note ?? null,
      },
    });
  }

  async update(businessId: string, id: string, input: UpdatePurchaseInput): Promise<Purchase> {
    await this.findOne(businessId, id);
    if (input.projectId !== undefined) await this.assertProjectOwned(businessId, input.projectId);
    return this.prisma.purchase.update({
      where: { id },
      data: {
        // Only keys actually sent are written, so re-assigning a purchase to a
        // job does not clear its supplier or note as a side effect. An
        // explicit null detaches; an absent key leaves it alone.
        ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
        ...(input.supplierId !== undefined ? { supplierId: input.supplierId } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
        ...(input.gctCents !== undefined ? { gctCents: input.gctCents } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.purchasedAt !== undefined ? { purchasedAt: new Date(input.purchasedAt) } : {}),
        ...(input.reference !== undefined ? { reference: input.reference } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    });
  }

  /** Soft-delete, matching every other tenant-owned record so an offline
   * client can observe the tombstone. */
  async remove(businessId: string, id: string): Promise<void> {
    await this.findOne(businessId, id);
    await this.prisma.purchase.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /**
   * Did this job make money?
   *
   * Revenue comes from invoices attached to the project — NOT from quotes. A
   * quote is what was hoped for; an invoice is what was billed, and only one
   * of those belongs in a profit figure.
   */
  async projectProfit(
    businessId: string,
    projectId: string,
  ): Promise<JobProfit & { labourCostCents: number; purchaseCostCents: number }> {
    await this.assertProjectOwned(businessId, projectId);

    const [invoices, purchases, labour, business] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { businessId, projectId, deletedAt: null },
        select: { status: true, totalCents: true, paidCents: true },
      }),
      this.prisma.purchase.findMany({
        where: { businessId, projectId, deletedAt: null },
        select: { amountCents: true, gctCents: true },
      }),
      this.prisma.labourEntry.findMany({
        where: { businessId, projectId, deletedAt: null },
        select: { quantity: true, rateCents: true },
      }),
      this.prisma.business.findUnique({ where: { id: businessId }, select: { trn: true } }),
    ]);

    // A TRN is the practical signal that a contractor is GCT-registered and so
    // reclaims input tax. Imperfect — registration and having a TRN are not
    // identical — but it is the only signal the app holds, and the alternative
    // is silently assuming every tenant reclaims, which overstates the margin
    // for every sole trader who does not.
    const registeredForGct = Boolean(business?.trn?.trim());

    // Wages carry NO reclaimable GCT — they are not a supply. A subcontractor
    // who invoices with GCT is a Purchase, not a labour entry, which is why
    // the two stay separate rather than one table with a flag.
    const labourCosts = labour.map((l) => ({
      amountCents: labourEntryCostCents(l.quantity.toString(), l.rateCents),
      gctCents: 0,
    }));

    const profit = computeJobProfit(invoices, [...purchases, ...labourCosts], registeredForGct);
    const labourCostCents = labourCosts.reduce((n, l) => n + l.amountCents, 0);

    // The split is reported because "cost" alone does not tell a contractor
    // whether a job overran on materials or on days — which is the actionable
    // half of the answer.
    return {
      ...profit,
      labourCostCents,
      purchaseCostCents: profit.costCents - labourCostCents,
    };
  }

  // --- Labour: time worked on a job ---------------------------------------
  // Lives in this module because it is the other half of job costing. The
  // module is named for purchases only because that came first.

  async findAllLabour(businessId: string, filters: LabourEntryQuery = {}) {
    return this.prisma.labourEntry.findMany({
      where: {
        businessId,
        deletedAt: null,
        ...(filters.projectId !== undefined ? { projectId: filters.projectId } : {}),
      },
      orderBy: { workedOn: "desc" },
      ...(filters.limit !== undefined ? { take: filters.limit } : {}),
    });
  }

  async createLabour(businessId: string, input: CreateLabourEntryInput) {
    await this.assertProjectOwned(businessId, input.projectId);
    await this.assertLabourRateOwned(businessId, input.labourRateId);
    return this.prisma.labourEntry.create({
      data: {
        businessId,
        projectId: input.projectId ?? null,
        labourRateId: input.labourRateId ?? null,
        description: input.description,
        quantity: input.quantity,
        rateCents: input.rateCents,
        unitLabel: input.unitLabel ?? "day",
        workedOn: new Date(input.workedOn),
        note: input.note ?? null,
      },
    });
  }

  async removeLabour(businessId: string, id: string): Promise<void> {
    const entry = await this.prisma.labourEntry.findFirst({
      where: { id, businessId, deletedAt: null },
    });
    if (!entry) throw new NotFoundException("Labour entry not found");
    await this.prisma.labourEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Same reasoning as assertProjectOwned: an id is not a capability, and a
   * rate reveals what a competitor pays their crew. */
  private async assertLabourRateOwned(businessId: string, rateId?: string | null): Promise<void> {
    if (!rateId) return;
    const rate = await this.prisma.labourRate.findFirst({
      where: { id: rateId, businessId },
      select: { id: true },
    });
    if (!rate) throw new NotFoundException("Labour rate not found");
  }

  /** Ids are not capabilities: without this a tenant could attach their spend
   * to another business's job by guessing an id. */
  private async assertProjectOwned(businessId: string, projectId?: string | null): Promise<void> {
    if (!projectId) return;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, businessId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project not found");
  }
}
