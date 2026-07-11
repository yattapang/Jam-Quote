import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module.js";
import { HealthController } from "./health.controller.js";
import { BusinessModule } from "./business/business.module.js";
import { ClientsModule } from "./clients/clients.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { QuotesModule } from "./quotes/quotes.module.js";
import { CatalogsModule } from "./catalogs/catalogs.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { AdminModule } from "./admin/admin.module.js";

/**
 * Root module. Feature modules are registered here as the Sonnet builders
 * deliver them. Still TODO: AuthModule, PricingModule (scrapers),
 * InvoicingModule, DocumentsModule (PDF), MessagingModule (whatsapp/email),
 * ReportsModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    BusinessModule,
    ClientsModule,
    JobsModule,
    QuotesModule,
    CatalogsModule,
    PaymentsModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
