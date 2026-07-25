import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { AuditService } from "./audit.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { AdminGuard } from "../auth/admin.guard.js";
import { BillingModule } from "../billing/billing.module.js";

@Module({
  // AuthModule exports JwtModule, which AdminGuard needs (JwtService) to
  // verify the bearer token before checking the caller's role. BillingModule
  // exports PricingService, which backs GET/PATCH /admin/pricing.
  imports: [AuthModule, BillingModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, AuditService],
  exports: [AdminService, AuditService],
})
export class AdminModule {}
