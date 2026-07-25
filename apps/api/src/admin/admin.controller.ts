import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import type { Subscription } from "@prisma/client";
import { AdminGuard } from "../auth/admin.guard.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import type { PricingSnapshot } from "../billing/pricing.service.js";
import { updatePricingSchema, type UpdatePricingInput } from "../billing/billing.dto.js";
import {
  AdminService,
  type AdminOverview,
  type AdminRegulatoryUpdate,
  type AdminSupplier,
  type AdminTenant,
} from "./admin.service.js";
import { setTenantPlanSchema, type SetTenantPlanInput } from "./admin.dto.js";

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
  constructor(private readonly admin: AdminService) {}

  @Get("overview")
  overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }

  @Get("tenants")
  tenants(): Promise<AdminTenant[]> {
    return this.admin.tenants();
  }

  @Get("suppliers")
  suppliers(): Promise<AdminSupplier[]> {
    return this.admin.suppliers();
  }

  @Get("regulatory")
  regulatory(): Promise<AdminRegulatoryUpdate[]> {
    return this.admin.regulatory();
  }

  @Get("pricing")
  pricing(): Promise<PricingSnapshot> {
    return this.admin.pricing();
  }

  @Patch("pricing")
  updatePricing(
    @Body(new ZodValidationPipe(updatePricingSchema)) body: UpdatePricingInput,
  ): Promise<PricingSnapshot> {
    return this.admin.updatePricing(body);
  }

  /** Manual-upgrade path: set a business's plan directly (bypasses payment). */
  @Patch("tenants/:id/plan")
  setTenantPlan(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setTenantPlanSchema)) body: SetTenantPlanInput,
  ): Promise<Subscription> {
    return this.admin.setTenantPlan(id, body);
  }
}
