import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import type { Business } from "@prisma/client";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { BusinessService } from "./business.service.js";
import {
  createBusinessSchema,
  updateBusinessSchema,
  type CreateBusinessInput,
  type UpdateBusinessInput,
} from "./business.dto.js";

/**
 * Every route here is tenant-scoped and behind TenantAuthGuard.
 *
 * POST / (create) is included in that: registration does NOT call this
 * endpoint — AuthService.register (../auth/auth.service.ts) creates the
 * Business directly inside its own transaction, seeded from the rule-pack,
 * and issues the token itself. No caller in apps/web or apps/mobile hits
 * POST /business either. It previously took an unauthenticated raw body and
 * created an orphan Business row for anyone who called it; now that the
 * class-level guard covers it too, it just requires an existing tenant
 * session, which no real flow needs. Left in place (rather than deleted) in
 * case it's genuinely dead and safe to remove later — flagging that instead
 * of unilaterally deleting a route during a security pass.
 */
@Controller("business")
@UseGuards(TenantAuthGuard)
export class BusinessController {
  constructor(private readonly business: BusinessService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(createBusinessSchema)) body: CreateBusinessInput,
  ): Promise<Business> {
    return this.business.create(body);
  }

  /** Convenience lookup for the caller's own business. */
  @Get("current")
  current(@BusinessId() businessId: string): Promise<Business> {
    return this.business.findById(businessId);
  }

  /**
   * :id must match the caller's own business — this is not a general
   * lookup. Without this check any authenticated tenant user could read (or,
   * on PATCH below, overwrite) any OTHER business by id, which is exactly
   * the cross-tenant hole this pass closes.
   */
  @Get(":id")
  findOne(@Param("id") id: string, @BusinessId() businessId: string): Promise<Business> {
    this.assertOwnBusiness(id, businessId);
    return this.business.findById(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @BusinessId() businessId: string,
    @Body(new ZodValidationPipe(updateBusinessSchema)) body: UpdateBusinessInput,
  ): Promise<Business> {
    this.assertOwnBusiness(id, businessId);
    return this.business.update(id, body);
  }

  private assertOwnBusiness(paramId: string, callerBusinessId: string): void {
    if (paramId !== callerBusinessId) {
      throw new ForbiddenException("You may only access your own business");
    }
  }
}
