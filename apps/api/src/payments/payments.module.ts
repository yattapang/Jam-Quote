import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { WiPayService } from "./wipay.service.js";

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, WiPayService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
