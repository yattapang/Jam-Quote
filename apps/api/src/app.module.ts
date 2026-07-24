import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
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
    // Global default rate limit: 120 requests / 60s per client IP. Stricter
    // per-route limits (e.g. auth login/register) override this via the
    // @Throttle decorator. Requires `trust proxy` in main.ts to see real
    // client IPs behind Render's load balancer, not the proxy IP.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
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
  providers: [
    // Apply the ThrottlerModule's rate limiting to every route globally.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
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
