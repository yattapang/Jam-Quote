import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module.js";
import { HealthController } from "./health.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { AuthContextMiddleware } from "./auth/auth-context.middleware.js";
import { BusinessModule } from "./business/business.module.js";
import { ClientsModule } from "./clients/clients.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { QuotesModule } from "./quotes/quotes.module.js";
import { CatalogsModule } from "./catalogs/catalogs.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { SyncModule } from "./sync/sync.module.js";

/**
 * Root module. Feature modules are registered here as the Sonnet builders
 * deliver them. Still TODO: PricingModule (scrapers), InvoicingModule,
 * DocumentsModule (PDF), MessagingModule (whatsapp/email), ReportsModule.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    BusinessModule,
    ClientsModule,
    JobsModule,
    QuotesModule,
    CatalogsModule,
    PaymentsModule,
    AdminModule,
    SyncModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  // Non-breaking auth bridge: if a request carries a valid Bearer JWT, this
  // sets req.user/req.businessId; it never rejects, so existing
  // x-business-id header requests are completely unaffected. See
  // @BusinessId() in ./common/business-id.decorator.ts for how the two
  // auth paths are reconciled.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthContextMiddleware).forRoutes("*");
  }
}
