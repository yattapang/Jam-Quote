import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { PricingService } from "./pricing.service.js";
import { EntitlementsService } from "./entitlements.service.js";

@Module({
  // AuthModule exports JwtModule, needed by TenantAuthGuard (applied on the
  // GET /billing/status method only — GET /billing/plans stays public).
  imports: [AuthModule],
  controllers: [BillingController],
  providers: [BillingService, PricingService, EntitlementsService],
  // EntitlementsService is exported because enforcement happens at each feature's
  // OWN boundary (ADR 0007 §3) — quotes, payments and every later call site import
  // it from here rather than re-deriving a plan check locally.
  exports: [PricingService, BillingService, EntitlementsService],
})
export class BillingModule {}
