import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { TradesController } from "./trades.controller.js";
import { TradesService } from "./trades.service.js";

@Module({
  // AuthModule exports JwtModule, needed by TenantAuthGuard (applied on
  // TradesController) to verify tokens.
  imports: [AuthModule],
  controllers: [TradesController],
  providers: [TradesService],
  exports: [TradesService],
})
export class TradesModule {}
