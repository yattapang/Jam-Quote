import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole, type Business, type Supplier } from "@prisma/client";
import { supportedJurisdictions } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import { PricingService, type PricingSnapshot } from "../billing/pricing.service.js";
import type { UpdatePricingInput } from "../billing/billing.dto.js";
import type {
  CreateSupplierInput,
  PromoteAdminInput,
  SetTenantPlanInput,
  UpdateAdminInput,
  UpdateSupplierInput,
} from "./admin.dto.js";

/** The acting admin's authorization, from AdminGuard's req.adminContext.
 * Passed into admin-management methods so they can enforce super-admin-only
 * rules and prevent self-lockout. */
export interface AdminActor {
  userId: string;
  isSuperAdmin: boolean;
}

/** One internal staff admin, as returned by the admin-management endpoints. */
export interface AdminUser {
  id: string;
  email: string | null;
  fullName: string | null;
  isSuperAdmin: boolean;
  capabilities: string[];
  createdAt: Date;
}
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

  // --- Admin RBAC (super-admin + granular capabilities) --------------------

  private toAdminUser(u: {
    id: string;
    email: string | null;
    fullName: string | null;
    isSuperAdmin: boolean;
    adminCapabilities: string[];
    createdAt: Date;
  }): AdminUser {
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      isSuperAdmin: u.isSuperAdmin,
      capabilities: u.adminCapabilities,
      createdAt: u.createdAt,
    };
  }

  private readonly ADMIN_SELECT = {
    id: true,
    email: true,
    fullName: true,
    isSuperAdmin: true,
    adminCapabilities: true,
    createdAt: true,
  } as const;

  /** GET /admin/me — the signed-in admin's own authorization. */
  async adminMe(userId: string): Promise<{ isSuperAdmin: boolean; capabilities: string[] }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true, adminCapabilities: true },
    });
    return {
      isSuperAdmin: user?.isSuperAdmin ?? false,
      capabilities: user?.adminCapabilities ?? [],
    };
  }

  /** GET /admin/admins — every internal staff admin. */
  async listAdmins(): Promise<AdminUser[]> {
    const users = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      select: this.ADMIN_SELECT,
      orderBy: { createdAt: "asc" },
    });
    return users.map((u) => this.toAdminUser(u));
  }

  /** How many super-admins exist — used to prevent removing the last one. */
  private countSuperAdmins(): Promise<number> {
    return this.prisma.user.count({ where: { role: UserRole.ADMIN, isSuperAdmin: true } });
  }

  /**
   * POST /admin/admins — promote an EXISTING user (matched by email) to an
   * internal admin with the given capabilities. Only a super-admin may grant
   * super-admin status. We deliberately never create a brand-new account here
   * (that needs a password) — the person must sign up first, then be promoted.
   */
  async promoteAdmin(input: PromoteAdminInput, actor: AdminActor): Promise<AdminUser> {
    if (input.isSuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenException("Only a super-admin can grant super-admin status.");
    }

    const email = input.email.trim().toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, isSuperAdmin: true },
    });
    if (!user) {
      throw new NotFoundException("No user with that email — ask them to sign up first, then promote them.");
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        role: UserRole.ADMIN,
        adminCapabilities: input.capabilities,
        isSuperAdmin: input.isSuperAdmin ?? user.isSuperAdmin,
      },
      select: this.ADMIN_SELECT,
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: "admin.promote",
      targetType: "User",
      targetId: user.id,
      details: { email, capabilities: input.capabilities, isSuperAdmin: updated.isSuperAdmin },
    });

    return this.toAdminUser(updated);
  }

  /**
   * PATCH /admin/admins/:id — update an admin's capabilities and/or
   * super-admin status. Guards: only a super-admin may change super-admin
   * status or edit a super-admin; the last super-admin can't be demoted; an
   * actor can't strip their own super-admin or MANAGE_ADMINS access.
   */
  async updateAdmin(id: string, input: UpdateAdminInput, actor: AdminActor): Promise<AdminUser> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isSuperAdmin: true, adminCapabilities: true },
    });
    if (!target || target.role !== UserRole.ADMIN) {
      throw new NotFoundException("Admin not found");
    }

    const touchesSuperAdmin = input.isSuperAdmin !== undefined;
    if ((touchesSuperAdmin || target.isSuperAdmin) && !actor.isSuperAdmin) {
      throw new ForbiddenException("Only a super-admin can modify a super-admin.");
    }

    // Demoting the last super-admin would lock everyone out of admin management.
    if (touchesSuperAdmin && input.isSuperAdmin === false && target.isSuperAdmin) {
      if ((await this.countSuperAdmins()) <= 1) {
        throw new BadRequestException("Cannot remove the last super-admin.");
      }
      if (target.id === actor.userId) {
        throw new BadRequestException("You can't remove your own super-admin status.");
      }
    }

    // Prevent an actor from removing their own path back into admin management.
    if (
      target.id === actor.userId &&
      !actor.isSuperAdmin &&
      input.capabilities !== undefined &&
      !input.capabilities.includes("MANAGE_ADMINS")
    ) {
      throw new BadRequestException("You can't remove your own 'Manage admins' capability.");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(input.capabilities !== undefined ? { adminCapabilities: input.capabilities } : {}),
        ...(touchesSuperAdmin ? { isSuperAdmin: input.isSuperAdmin } : {}),
      },
      select: this.ADMIN_SELECT,
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: "admin.update",
      targetType: "User",
      targetId: id,
      details: {
        capabilities: input.capabilities ?? null,
        isSuperAdmin: touchesSuperAdmin ? input.isSuperAdmin : null,
      },
    });

    return this.toAdminUser(updated);
  }

  /**
   * DELETE /admin/admins/:id — revoke a user's admin access (back to OWNER,
   * capabilities cleared). Guards: can't revoke yourself; can't revoke the
   * last super-admin; only a super-admin may revoke a super-admin.
   */
  async revokeAdmin(id: string, actor: AdminActor): Promise<{ revoked: true; userId: string }> {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, isSuperAdmin: true },
    });
    if (!target || target.role !== UserRole.ADMIN) {
      throw new NotFoundException("Admin not found");
    }
    if (target.id === actor.userId) {
      throw new BadRequestException("You can't revoke your own admin access.");
    }
    if (target.isSuperAdmin && !actor.isSuperAdmin) {
      throw new ForbiddenException("Only a super-admin can revoke a super-admin.");
    }
    if (target.isSuperAdmin && (await this.countSuperAdmins()) <= 1) {
      throw new BadRequestException("Cannot revoke the last super-admin.");
    }

    await this.prisma.user.update({
      where: { id },
      data: { role: UserRole.OWNER, isSuperAdmin: false, adminCapabilities: [] },
    });

    await this.audit.record({
      actorUserId: actor.userId,
      action: "admin.revoke",
      targetType: "User",
      targetId: id,
      details: {},
    });

    return { revoked: true, userId: id };
  }
}
