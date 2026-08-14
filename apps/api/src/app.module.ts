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
import { TradesModule } from "./trades/trades.module.js";
import { JobsModule } from "./jobs/jobs.module.js";
import { QuotesModule } from "./quotes/quotes.module.js";
import { InvoicesModule } from "./invoices/invoices.module.js";
import { CatalogsModule } from "./catalogs/catalogs.module.js";
import { AssembliesModule } from "./assemblies/assemblies.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { AdminModule } from "./admin/admin.module.js";
import { SyncModule } from "./sync/sync.module.js";
import { BillingModule } from "./billing/billing.module.js";
import { RegulatoryModule } from "./regulatory/regulatory.module.js";
import { ReportsModule } from "./reports/reports.module.js";

/**
 * Root module. Feature modules are registered here as the Sonnet builders
 * deliver them. Still TODO: DocumentsModule (PDF), MessagingModule
 * (whatsapp/email).
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
    TradesModule,
    JobsModule,
    QuotesModule,
    InvoicesModule,
    CatalogsModule,
    AssembliesModule,
    PaymentsModule,
    AdminModule,
    SyncModule,
    BillingModule,
    RegulatoryModule,
    ReportsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Apply the ThrottlerModule's rate limiting to every route globally.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  // Best-effort auth bridge: if a request carries a valid Bearer JWT, this
  // sets req.user for optional-auth routes; it never rejects and never sets
  // req.businessId (that's TenantAuthGuard's job — see auth/tenant-auth.guard.ts
  // and auth/auth-context.middleware.ts for why the two are kept separate).
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthContextMiddleware).forRoutes("*");
  }
}
