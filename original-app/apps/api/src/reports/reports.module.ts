import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";

@Module({
  // AuthModule exports JwtModule, needed by TenantAuthGuard (applied on
  // ReportsController) — same reasoning as InvoicesModule.
  imports: [AuthModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
