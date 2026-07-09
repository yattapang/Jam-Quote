import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module.js";
import { HealthController } from "./health.controller.js";

/**
 * Root module. Feature modules (auth, business, clients, jobs, quotes,
 * catalogs, pricing, invoicing, payments, documents, messaging, regulatory,
 * reports, sync) are registered here as the Sonnet builders deliver them.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    // TODO(A1): AuthModule, BusinessModule, ClientsModule, JobsModule, QuotesModule,
    //           CatalogsModule, InvoicingModule, ReportsModule
    // TODO(A0/pricing): PricingModule (scrapers)
    // TODO(A4): PaymentsModule (WiPay), DocumentsModule, MessagingModule
  ],
  controllers: [HealthController],
})
export class AppModule {}
