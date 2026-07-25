import { Controller, Get } from "@nestjs/common";
import { BusinessId } from "../common/business-id.decorator.js";
import { BillingService, type BillingStatus } from "./billing.service.js";
import type { PricingSnapshot } from "./pricing.service.js";

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public — pricing is not sensitive, no auth required. */
  @Get("plans")
  plans(): Promise<PricingSnapshot> {
    return this.billing.plans();
  }

  @Get("status")
  status(@BusinessId() businessId: string): Promise<BillingStatus> {
    return this.billing.status(businessId);
  }
}
