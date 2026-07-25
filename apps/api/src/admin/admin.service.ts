import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Business, Supplier } from "@prisma/client";
import { supportedJurisdictions } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { PricingService, type PricingSnapshot } from "../billing/pricing.service.js";
import type { UpdatePricingInput } from "../billing/billing.dto.js";
import type {
  CreateSupplierInput,
  SetTenantPlanInput,
  UpdateSupplierInput,
} from "./admin.dto.js";
import { AuditService } from "./audit.service.js";
import { deleteBusinessCascade } from "./tenant-deletion.util.js";

export interface AdminOverview {
  businesses: number;
  activeSubscriptions: number;
  suppliersTracked: number;
  jurisdictionsLive: number;
}

export interface AdminTenant {
  id: string;
  name: string;
  parish: string | null;
  plan: string;
  trn: string | null;
  status: string;
  createdAt: Date;
  quoteCount: number;
  suspended: boolean;
}

export interface AdminSupplier {
  id: string;
  name: string;
  parish: string | null;
  isPartner: boolean;
  skuCount: number;
  lastFetch: string | null;
}

export interface AdminRegulatoryUpdate {
  id: string;
  title: string;
  category: string;
  summary: string;
  effectiveDate: Date | null;
  sourceUrl: string | null;
  actionNeeded: string | null;
}

export interface AdminUpcomingRenewal {
  businessId: string;
  businessName: string;
  plan: string;
  renewsAt: Date;
}

export interface AdminFinancials {
  freeCount: number;
  proCount: number;
  currency: string;
  proMonthlyPriceCents: number;
  mrrCents: number;
  upcomingRenewals: AdminUpcomingRenewal[];
}

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Platform-level admin service for the internal JamQuote staff console.
 * Deliberately NOT business-scoped — no businessId filtering. Reads across
 * every tenant. Only reachable via the internal /admin routes.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly audit: AuditService,
  ) {}

  async overview(): Promise<AdminOverview> {
    const [businesses, activeSubscriptions, suppliersTracked] = await Promise.all([
      this.prisma.business.count({ where: { deletedAt: null } }),
      this.prisma.subscription.count({ where: { status: "active" } }),
      this.prisma.supplier.count(),
    ]);

    return {
      businesses,
      activeSubscriptions,
      suppliersTracked,
      jurisdictionsLive: supportedJurisdictions().length,
    };
  }

  /**
   * Lists tenants. By default, excludes soft-deleted (suspended) businesses
   * to preserve existing callers' expectations; pass includeSuspended: true
   * to see them too (each row still carries its own `suspended` flag either
   * way, so the shape never changes — only the set of rows returned does).
   */
  async tenants(includeSuspended = false): Promise<AdminTenant[]> {
    const businesses = await this.prisma.business.findMany({
      where: includeSuspended ? {} : { deletedAt: null },
      include: {
        subscription: true,
        _count: { select: { quotes: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return businesses.map((b) => ({
      id: b.id,
      name: b.name,
      parish: b.parish,
      plan: b.subscription?.plan ?? "Free",
      trn: b.trn,
      status: b.subscription?.status ?? "active",
      createdAt: b.createdAt,
      quoteCount: b._count.quotes,
      suspended: b.deletedAt !== null,
    }));
  }

  /** PATCH /admin/tenants/:id/suspend — reversible soft-delete. */
  async suspendTenant(id: string, actorUserId: string): Promise<Business> {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) throw new NotFoundException("Business not found");
    if (business.deletedAt) throw new BadRequestException("Tenant is already suspended");

    const updated = await this.prisma.business.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      actorUserId,
      action: "tenant.suspend",
      targetType: "Business",
      targetId: id,
      details: { name: business.name },
    });

    return updated;
  }

  /** PATCH /admin/tenants/:id/restore — undo a suspend. */
  async restoreTenant(id: string, actorUserId: string): Promise<Business> {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) throw new NotFoundException("Business not found");
    if (!business.deletedAt) throw new BadRequestException("Tenant is not suspended");

    const updated = await this.prisma.business.update({
      where: { id },
      data: { deletedAt: null },
    });

    await this.audit.record({
      actorUserId,
      action: "tenant.restore",
      targetType: "Business",
      targetId: id,
      details: { name: business.name },
    });

    return updated;
  }

  /**
   * DELETE /admin/tenants/:id — PERMANENT hard delete. Irreversible, so it
   * requires confirmName to exactly match the business's current name
   * (case-sensitive) before anything is touched. Deletes the business and
   * every row it owns inside a single transaction (see
   * ./tenant-deletion.util.ts for the FK-safe order, shared with
   * prisma/cleanup-seed.ts).
   */
  async hardDeleteTenant(
    id: string,
    confirmName: string,
    actorUserId: string,
  ): Promise<{ deleted: true; businessId: string }> {
    const business = await this.prisma.business.findUnique({ where: { id } });
    if (!business) throw new NotFoundException("Business not found");
    if (confirmName !== business.name) {
      throw new BadRequestException("confirmName does not match the business name");
    }

    await this.prisma.$transaction((tx) => deleteBusinessCascade(tx, id));

    await this.audit.record({
      actorUserId,
      action: "tenant.delete",
      targetType: "Business",
      targetId: id,
      details: { name: business.name },
    });

    return { deleted: true, businessId: id };
  }

  async suppliers(): Promise<AdminSupplier[]> {
    const suppliers = await this.prisma.supplier.findMany({
      where: { deletedAt: null },
      include: {
        _count: { select: { priceEntries: true } },
      },
      orderBy: { name: "asc" },
    });

    return Promise.all(
      suppliers.map(async (s) => {
        const latest = await this.prisma.materialPriceEntry.findFirst({
          where: { supplierId: s.id },
          orderBy: { fetchedAt: "desc" },
          select: { fetchedAt: true },
        });

        return {
          id: s.id,
          name: s.name,
          parish: s.parish,
          isPartner: s.isPartner,
          skuCount: s._count.priceEntries,
          lastFetch: latest ? latest.fetchedAt.toISOString() : null,
        };
      }),
    );
  }

  /**
   * POST /admin/suppliers — Supplier is platform-level, not business-scoped,
   * so this is intentionally not tied to any tenant.
   */
  async createSupplier(input: CreateSupplierInput, actorUserId: string): Promise<Supplier> {
    const supplier = await this.prisma.supplier.create({
      data: {
        name: input.name,
        website: input.website,
        parish: input.parish,
        isPartner: input.isPartner ?? false,
      },
    });

    await this.audit.record({
      actorUserId,
      action: "supplier.create",
      targetType: "Supplier",
      targetId: supplier.id,
      details: { ...input },
    });

    return supplier;
  }

  async updateSupplier(
    id: string,
    input: UpdateSupplierInput,
    actorUserId: string,
  ): Promise<Supplier> {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException("Supplier not found");

    const supplier = await this.prisma.supplier.update({ where: { id }, data: input });

    await this.audit.record({
      actorUserId,
      action: "supplier.update",
      targetType: "Supplier",
      targetId: id,
      details: { ...input },
    });

    return supplier;
  }

  /**
   * DELETE /admin/suppliers/:id — SOFT delete only. MaterialPriceEntry and
   * QuoteLineItem both reference Supplier (no cascade), so a hard delete
   * would FK-fail the moment any tenant had ever used this supplier on a
   * quote line item.
   */
  async deleteSupplier(id: string, actorUserId: string): Promise<Supplier> {
    const existing = await this.prisma.supplier.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException("Supplier not found");

    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.audit.record({
      actorUserId,
      action: "supplier.delete",
      targetType: "Supplier",
      targetId: id,
      details: { name: existing.name },
    });

    return supplier;
  }

  regulatory(): Promise<AdminRegulatoryUpdate[]> {
    return this.prisma.regulatoryUpdate.findMany({
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        title: true,
        category: true,
        summary: true,
        effectiveDate: true,
        sourceUrl: true,
        actionNeeded: true,
      },
    });
  }

  pricing(): Promise<PricingSnapshot> {
    return this.pricingService.get();
  }

  async updatePricing(patch: UpdatePricingInput, actorUserId: string): Promise<PricingSnapshot> {
    const updated = await this.pricingService.update(patch);

    await this.audit.record({
      actorUserId,
      action: "pricing.update",
      targetType: "PricingConfig",
      targetId: "default",
      details: { ...patch },
    });

    return updated;
  }

  /** Manual-upgrade path: admin sets a business's plan directly. */
  async setTenantPlan(businessId: string, input: SetTenantPlanInput, actorUserId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException("Business not found");

    const subscription = await this.prisma.subscription.upsert({
      where: { businessId },
      create: {
        businessId,
        plan: input.plan,
        status: "active",
        renewsAt: input.renewsAt ? new Date(input.renewsAt) : null,
      },
      update: {
        plan: input.plan,
        renewsAt: input.renewsAt ? new Date(input.renewsAt) : null,
      },
    });

    await this.audit.record({
      actorUserId,
      action: "tenant.setPlan",
      targetType: "Business",
      targetId: businessId,
      details: { plan: input.plan, renewsAt: input.renewsAt ?? null },
    });

    return subscription;
  }

  /**
   * GET /admin/financials — subscription & revenue overview, derived from
   * Subscription + PricingConfig + Business. Excludes soft-deleted
   * (suspended) businesses from every count below.
   */
  async financials(): Promise<AdminFinancials> {
    const [pricing, businesses] = await Promise.all([
      this.pricingService.get(),
      this.prisma.business.findMany({
        where: { deletedAt: null },
        include: { subscription: true },
      }),
    ]);

    const now = Date.now();
    const cutoff = new Date(now + SIXTY_DAYS_MS);

    let proCount = 0;
    const upcomingRenewals: AdminUpcomingRenewal[] = [];

    for (const b of businesses) {
      const isPro = b.subscription?.plan === "pro";
      if (isPro) proCount += 1;

      if (
        isPro &&
        b.subscription!.renewsAt &&
        b.subscription!.renewsAt.getTime() >= now &&
        b.subscription!.renewsAt.getTime() <= cutoff.getTime()
      ) {
        upcomingRenewals.push({
          businessId: b.id,
          businessName: b.name,
          plan: b.subscription!.plan,
          renewsAt: b.subscription!.renewsAt!,
        });
      }
    }

    upcomingRenewals.sort((a, b) => a.renewsAt.getTime() - b.renewsAt.getTime());

    return {
      freeCount: businesses.length - proCount,
      proCount,
      currency: pricing.currency,
      proMonthlyPriceCents: pricing.proMonthlyPriceCents,
      mrrCents: proCount * pricing.proMonthlyPriceCents,
      upcomingRenewals,
    };
  }
}
