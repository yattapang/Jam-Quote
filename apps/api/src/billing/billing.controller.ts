import { Controller, Get, UseGuards } from "@nestjs/common";
import { TenantAuthGuard } from "../auth/tenant-auth.guard.js";
import { BusinessId } from "../common/business-id.decorator.js";
import { BillingService, type BillingStatus } from "./billing.service.js";
import type { PricingSnapshot } from "./pricing.service.js";

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public — pricing is not sensitive, no auth required. Guard is applied
   * per-method (not at the class level) specifically so this route stays open. */
  @Get("plans")
  plans(): Promise<PricingSnapshot> {
    return this.billing.plans();
  }

  @Get("status")
  @UseGuards(TenantAuthGuard)
  status(@BusinessId() businessId: string): Promise<BillingStatus> {
    return this.billing.status(businessId);
  }
}
