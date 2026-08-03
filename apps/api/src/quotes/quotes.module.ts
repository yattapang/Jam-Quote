import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { BusinessModule } from "../business/business.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { QuotesController } from "./quotes.controller.js";
import { QuotesService } from "./quotes.service.js";
import { QuoteExpiryService } from "./quote-expiry.service.js";

@Module({
  // BillingModule exports PricingService, used by the free-tier gate on
  // quote creation (see QuotesService.create). AuthModule exports JwtModule,
  // needed by TenantAuthGuard (applied on QuotesController) to verify tokens.
  imports: [AuthModule, BusinessModule, BillingModule],
  controllers: [QuotesController],
  providers: [QuotesService, QuoteExpiryService],
  exports: [QuotesService],
})
export class QuotesModule {}
