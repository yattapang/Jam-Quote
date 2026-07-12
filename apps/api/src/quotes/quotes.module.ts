import { Module } from "@nestjs/common";
import { BusinessModule } from "../business/business.module.js";
import { QuotesController } from "./quotes.controller.js";
import { QuotesService } from "./quotes.service.js";
import { QuoteExpiryService } from "./quote-expiry.service.js";

@Module({
  imports: [BusinessModule],
  controllers: [QuotesController],
  providers: [QuotesService, QuoteExpiryService],
  exports: [QuotesService],
})
export class QuotesModule {}
