import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller.js";
import { AdminService } from "./admin.service.js";
import { AuditModule } from "./audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AdminGuard } from "../auth/admin.guard.js";
import { BillingModule } from "../billing/billing.module.js";
import { RulePackModule } from "../rulepack/rulepack.module.js";

@Module({
  // AuthModule exports JwtModule, which AdminGuard needs (JwtService) to
  // verify the bearer token before checking the caller's role. BillingModule
  // exports PricingService (GET/PATCH /admin/pricing); RulePackModule exports
  // RulePackService (GET/PATCH /admin/rulepack); AuditModule the shared trail.
  imports: [AuthModule, BillingModule, RulePackModule, AuditModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminService],
})
export class AdminModule {}
