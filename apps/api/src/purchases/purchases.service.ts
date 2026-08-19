import { Injectable, NotFoundException } from "@nestjs/common";
import type { Purchase } from "@prisma/client";
import { computeJobProfit, type JobProfit } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import type { CreatePurchaseInput, PurchaseQuery, UpdatePurchaseInput } from "./purchases.dto.js";

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
  async projectProfit(businessId: string, projectId: string): Promise<JobProfit> {
    await this.assertProjectOwned(businessId, projectId);

    const [invoices, purchases, business] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { businessId, projectId, deletedAt: null },
        select: { status: true, totalCents: true, paidCents: true },
      }),
      this.prisma.purchase.findMany({
        where: { businessId, projectId, deletedAt: null },
        select: { amountCents: true, gctCents: true },
      }),
      this.prisma.business.findUnique({ where: { id: businessId }, select: { trn: true } }),
    ]);

    // A TRN is the practical signal that a contractor is GCT-registered and so
    // reclaims input tax. Imperfect — registration and having a TRN are not
    // identical — but it is the only signal the app holds, and the alternative
    // is silently assuming every tenant reclaims, which overstates the margin
    // for every sole trader who does not.
    const registeredForGct = Boolean(business?.trn?.trim());

    return computeJobProfit(invoices, purchases, registeredForGct);
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
