import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { WiPayService } from "./wipay.service.js";

@Module({
  // AuthModule exports JwtModule, needed by TenantAuthGuard — applied only
  // to the card/manual payment routes below, NOT the WiPay webhook, which
  // must stay public (WiPay can't present a JWT) and is verified by hash
  // instead (see PaymentsService.handleWiPayCallback).
  imports: [AuthModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, WiPayService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
