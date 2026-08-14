import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import type { AuditLog, Business, Subscription } from "@prisma/client";
import { AdminCapability } from "@jamquote/core";
import { AdminGuard } from "../auth/admin.guard.js";
import { RequireCapability } from "../auth/require-capability.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import type { PricingSnapshot } from "../billing/pricing.service.js";
import { updatePricingSchema, type UpdatePricingInput } from "../billing/billing.dto.js";
import { RulePackService, type EffectiveRulePack } from "../rulepack/rulepack.service.js";
import { updateRulePackSchema, type UpdateRulePackInput } from "../rulepack/rulepack.dto.js";
import {
  AdminService,
  type AdminFinancials,
  type AdminOverview,
  type AdminRegulatoryUpdate,
  type AdminTenant,
  type AdminUser,
} from "./admin.service.js";
import { AuditService } from "./audit.service.js";
import {
  hardDeleteTenantSchema,
  promoteAdminSchema,
  setTenantPlanSchema,
  updateAdminSchema,
  type HardDeleteTenantInput,
  type PromoteAdminInput,
  type SetTenantPlanInput,
  type UpdateAdminInput,
} from "./admin.dto.js";

/**
 * Platform-level admin API for the internal JamQuote staff console.
 * Deliberately NOT business-scoped: no x-business-id header, no
 * @BusinessId() decorator, no per-tenant filtering. Reads across every
 * tenant in the system. Gated by AdminGuard (JWT + role===ADMIN, checked
 * fresh from the DB) — every route here reads across ALL tenants, so this
 * guard is the only thing standing between the public internet and every
 * business's data. Do not remove it or rely on "not linked in the UI".
 */
@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly auditService: AuditService,
    private readonly rulePack: RulePackService,
  ) {}

  @Get("overview")
  overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }

  @Get("tenants")
  tenants(@Query("includeSuspended") includeSuspended?: string): Promise<AdminTenant[]> {
    return this.admin.tenants(includeSuspended === "true");
  }

  /** Reversible soft-delete — sets Business.deletedAt. */
  @Patch("tenants/:id/suspend")
  @RequireCapability(AdminCapability.MANAGE_TENANTS)
  suspendTenant(@Param("id") id: string, @Req() req: Request): Promise<Business> {
    return this.admin.suspendTenant(id, req.user!.sub);
  }

  /**
   * Mint a 30-minute, read-only token for viewing this tenant's own screens.
   * Gated on MANAGE_TENANTS — the same authorization as suspending them —
   * because reading a contractor's entire book of business is at least as
   * consequential as closing their account. Audited as tenant.impersonate.
   */
  @Post("tenants/:id/impersonate")
  @RequireCapability(AdminCapability.MANAGE_TENANTS)
  impersonateTenant(
    @Param("id") id: string,
    @Req() req: Request,
  ): Promise<{ token: string; expiresAt: string; business: { id: string; name: string } }> {
    return this.admin.impersonateTenant(id, req.user!.sub);
  }

  /** Undoes a suspend — clears Business.deletedAt. */
  @Patch("tenants/:id/restore")
  @RequireCapability(AdminCapability.MANAGE_TENANTS)
  restoreTenant(@Param("id") id: string, @Req() req: Request): Promise<Business> {
    return this.admin.restoreTenant(id, req.user!.sub);
  }

  /**
   * PERMANENT hard delete. Requires the body's confirmName to exactly match
   * the business's current name — see AdminService.hardDeleteTenant.
   */
  @Delete("tenants/:id")
  @RequireCapability(AdminCapability.MANAGE_TENANTS)
  hardDeleteTenant(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(hardDeleteTenantSchema)) body: HardDeleteTenantInput,
    @Req() req: Request,
  ): Promise<{ deleted: true; businessId: string }> {
    return this.admin.hardDeleteTenant(id, body.confirmName, req.user!.sub);
  }

  // No supplier routes here by design. Suppliers are tenant-owned (each
  // contractor keeps their own merchant list, see SuppliersController); there
  // is no curated directory for the console to manage.

  @Get("regulatory")
  regulatory(): Promise<AdminRegulatoryUpdate[]> {
    return this.admin.regulatory();
  }

  @Get("pricing")
  pricing(): Promise<PricingSnapshot> {
    return this.admin.pricing();
  }

  @Patch("pricing")
  @RequireCapability(AdminCapability.MANAGE_PRICING)
  updatePricing(
    @Body(new ZodValidationPipe(updatePricingSchema)) body: UpdatePricingInput,
    @Req() req: Request,
  ): Promise<PricingSnapshot> {
    return this.admin.updatePricing(body, req.user!.sub);
  }

  /**
   * GET /admin/rulepack — the effective jurisdiction pack (static core baseline
   * merged with any stored override). Viewable by any admin; the console reads
   * it to render the rule-pack screen.
   */
  @Get("rulepack")
  rulepack(@Query("country") country?: string): Promise<EffectiveRulePack> {
    return this.rulePack.get(country ?? "JM");
  }

  /** PATCH /admin/rulepack — edit the pack's editable slice (rate/label/
   * provenance/statutory rates). Baseline values stay code-owned. */
  @Patch("rulepack")
  @RequireCapability(AdminCapability.MANAGE_RULEPACK)
  updateRulepack(
    @Query("country") country: string | undefined,
    @Body(new ZodValidationPipe(updateRulePackSchema)) body: UpdateRulePackInput,
    @Req() req: Request,
  ): Promise<EffectiveRulePack> {
    return this.rulePack.update(country ?? "JM", body, req.user!.sub);
  }

  /** Manual-upgrade path: set a business's plan directly (bypasses payment). */
  @Patch("tenants/:id/plan")
  @RequireCapability(AdminCapability.MANAGE_TENANTS)
  setTenantPlan(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setTenantPlanSchema)) body: SetTenantPlanInput,
    @Req() req: Request,
  ): Promise<Subscription> {
    return this.admin.setTenantPlan(id, body, req.user!.sub);
  }

  /** Subscription & revenue overview — GET /admin/financials. */
  @Get("financials")
  @RequireCapability(AdminCapability.VIEW_FINANCIALS)
  financials(): Promise<AdminFinancials> {
    return this.admin.financials();
  }

  /** Recent audit trail entries, newest first — GET /admin/audit. */
  @Get("audit")
  audit(): Promise<AuditLog[]> {
    return this.auditService.recent();
  }

  // --- Admin management (super-admin / MANAGE_ADMINS) -----------------------

  /** GET /admin/me — the signed-in admin's own authorization (drives UI gating). */
  @Get("me")
  me(@Req() req: Request): Promise<{ isSuperAdmin: boolean; capabilities: string[] }> {
    return this.admin.adminMe(req.user!.sub);
  }

  @Get("admins")
  @RequireCapability(AdminCapability.MANAGE_ADMINS)
  admins(): Promise<AdminUser[]> {
    return this.admin.listAdmins();
  }

  /** Promote an existing user (by email) to admin with the given capabilities. */
  @Post("admins")
  @RequireCapability(AdminCapability.MANAGE_ADMINS)
  promoteAdmin(
    @Body(new ZodValidationPipe(promoteAdminSchema)) body: PromoteAdminInput,
    @Req() req: Request,
  ): Promise<AdminUser> {
    return this.admin.promoteAdmin(body, {
      userId: req.adminContext!.userId,
      isSuperAdmin: req.adminContext!.isSuperAdmin,
    });
  }

  @Patch("admins/:id")
  @RequireCapability(AdminCapability.MANAGE_ADMINS)
  updateAdmin(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAdminSchema)) body: UpdateAdminInput,
    @Req() req: Request,
  ): Promise<AdminUser> {
    return this.admin.updateAdmin(id, body, {
      userId: req.adminContext!.userId,
      isSuperAdmin: req.adminContext!.isSuperAdmin,
    });
  }

  @Delete("admins/:id")
  @RequireCapability(AdminCapability.MANAGE_ADMINS)
  revokeAdmin(@Param("id") id: string, @Req() req: Request): Promise<{ revoked: true; userId: string }> {
    return this.admin.revokeAdmin(id, {
      userId: req.adminContext!.userId,
      isSuperAdmin: req.adminContext!.isSuperAdmin,
    });
  }
}
