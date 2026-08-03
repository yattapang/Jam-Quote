import { Module } from "@nestjs/common";
import { BusinessModule } from "../business/business.module.js";
import { InvoicesController } from "./invoices.controller.js";
import { InvoicesService } from "./invoices.service.js";

@Module({
  // BusinessModule exports BusinessService, used to reserve invoice numbers
  // (see InvoicesService.convertFromQuote).
  imports: [BusinessModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
