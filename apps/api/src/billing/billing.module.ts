import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { PricingService } from "./pricing.service.js";

@Module({
  controllers: [BillingController],
  providers: [BillingService, PricingService],
  exports: [PricingService, BillingService],
})
export class BillingModule {}
