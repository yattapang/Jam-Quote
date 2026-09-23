import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { PricingService } from "./pricing.service.js";

@Module({
  // AuthModule exports JwtModule, needed by TenantAuthGuard (applied on the
  // GET /billing/status method only — GET /billing/plans stays public).
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, PricingService],
  exports: [PricingService, BillingService],
})
export class BillingModule {}
