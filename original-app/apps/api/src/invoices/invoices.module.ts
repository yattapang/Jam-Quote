import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BusinessModule } from "../business/business.module.js";
import { InvoicesController } from "./invoices.controller.js";
import { PublicInvoicesController } from "./public-invoices.controller.js";
import { InvoicesService } from "./invoices.service.js";
import { InvoiceOverdueService } from "./invoice-overdue.service.js";

@Module({
  // BusinessModule exports BusinessService, used to reserve invoice numbers
  // (see InvoicesService.convertFromQuote). AuthModule exports JwtModule,
  // needed by TenantAuthGuard (applied on InvoicesController).
  imports: [AuthModule, BusinessModule],
  controllers: [InvoicesController, PublicInvoicesController],
  providers: [InvoicesService, InvoiceOverdueService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
