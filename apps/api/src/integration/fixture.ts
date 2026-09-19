/**
 * The shared fixture for the cross-section integration suite.
 *
 * Every service here is the REAL class from src/, wired by hand exactly as its
 * Nest module wires it, over the REAL `PrismaService` pointed at an in-process
 * Postgres (PGlite, every migration applied — see pglite-server.ts). Only true
 * externals are replaced:
 *
 * - WiPay (`WiPayService`) — a network payment gateway.
 * - the subscription mailer (`SubscriptionMailerService`) — Resend.
 * - `RESEND_API_KEY` is removed from the environment, so every best-effort
 *   email path in the services returns before it reaches the network.
 * - `AuthService`, which AdminService takes only for impersonation (JWT minting);
 *   no flow here calls it.
 *
 * Why wired by hand rather than `Test.createTestingModule`: vitest compiles with
 * esbuild, which does not emit `design:paramtypes`, so Nest's constructor
 * injection cannot resolve these classes under vitest. Hand wiring is the same
 * object graph, and a constructor that grows a dependency fails typecheck here.
 */
import { vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service.js";
import { BusinessService } from "../business/business.service.js";
import { PricingService } from "../billing/pricing.service.js";
import { CatalogHiddenService } from "../catalogs/catalog-hidden.service.js";
import { MaterialSchemaService } from "../catalogs/material-schema.service.js";
import { MaterialFavouritesService } from "../catalogs/material-favourites.service.js";
import { MaterialPricesService } from "../catalogs/material-prices.service.js";
import { LabourRatesService } from "../catalogs/labour-rates.service.js";
import { EquipmentService } from "../catalogs/equipment.service.js";
import { SuppliersService } from "../catalogs/suppliers.service.js";
import { ClientsService } from "../clients/clients.service.js";
import { ProjectsService } from "../projects/projects.service.js";
import { JobsService } from "../jobs/jobs.service.js";
import { QuotesService } from "../quotes/quotes.service.js";
import { InvoicesService } from "../invoices/invoices.service.js";
import { PaymentsService } from "../payments/payments.service.js";
import type { WiPayService } from "../payments/wipay.service.js";
import { ReportsService } from "../reports/reports.service.js";
import { ExportsService } from "../exports/exports.service.js";
import { AuditService } from "../admin/audit.service.js";
import { SubscriptionPaymentsService } from "../admin/subscription-payments.service.js";
import { SubscriptionSweepService } from "../admin/subscription-sweep.service.js";
import type { SubscriptionMailerService } from "../admin/subscription-mailer.service.js";
import { AdminService } from "../admin/admin.service.js";
import type { AuthService } from "../auth/auth.service.js";
import { PublicQuotesController } from "../quotes/public-quotes.controller.js";
import { PublicInvoicesController } from "../invoices/public-invoices.controller.js";
import { startPglite, type PgliteServer } from "./pglite-server.js";

export interface Tenant {
  id: string;
  name: string;
}

export type Integration = Awaited<ReturnType<typeof startIntegration>>;

let seq = 0;

export async function startIntegration() {
  delete process.env.RESEND_API_KEY;
  const pg: PgliteServer = await startPglite();
  process.env.DATABASE_URL = pg.url;
  process.env.DIRECT_URL = pg.url;

  const prisma = new PrismaService();
  await prisma.onModuleInit();

  const business = new BusinessService(prisma);
  const pricing = new PricingService(prisma);
  const hidden = new CatalogHiddenService(prisma);
  const materialSchema = new MaterialSchemaService(prisma, hidden);
  const wipay = {
    createPaymentRequest: vi.fn(async () => ({ paymentUrl: "https://wipay.test/pay", providerRef: "wp-1" })),
    verifyCallback: vi.fn(() => true),
    isSuccessful: vi.fn(() => true),
  };
  const mailer = { send: vi.fn(async () => true) };
  const audit = new AuditService(prisma);
  const quotes = new QuotesService(prisma, business, pricing);
  const invoices = new InvoicesService(prisma, business);

  const svc = {
    business,
    pricing,
    materials: new MaterialFavouritesService(prisma, materialSchema, hidden),
    materialPrices: new MaterialPricesService(prisma),
    labour: new LabourRatesService(prisma, hidden),
    equipment: new EquipmentService(prisma, hidden),
    suppliers: new SuppliersService(prisma),
    clients: new ClientsService(prisma),
    projects: new ProjectsService(prisma),
    jobs: new JobsService(prisma),
    quotes,
    invoices,
    payments: new PaymentsService(prisma, wipay as unknown as WiPayService),
    reports: new ReportsService(prisma),
    exports: new ExportsService(prisma),
    audit,
    subscriptionPayments: new SubscriptionPaymentsService(prisma, pricing, audit),
    sweep: new SubscriptionSweepService(prisma, pricing, mailer as unknown as SubscriptionMailerService),
    admin: new AdminService(prisma, pricing, audit, {} as AuthService),
    publicQuotes: new PublicQuotesController(quotes, business),
    publicInvoices: new PublicInvoicesController(invoices, business),
  };

  /**
   * Two fresh businesses per call: A is GCT-registered at 15%, B is not.
   * Each has an owner with an email, so the renewal sweep has somewhere to send,
   * and a Pro plan with no term (see below).
   */
  async function tenants(): Promise<{ a: Tenant; b: Tenant }> {
    const n = ++seq;
    const a = await business.create({ name: `Tenant A ${n}`, trn: "102458963", gctRegistered: true, defaultGctRate: 15 });
    const b = await business.create({ name: `Tenant B ${n}`, gctRegistered: false });
    for (const t of [a, b]) {
      await prisma.user.create({ data: { businessId: t.id, email: `owner-${t.id}@example.test`, role: "OWNER" } });
      // Pro with no term, so the free plan's three-quotes-a-month gate does not cut a
      // flow short. Nothing here is about that gate; quote-allowance tests own it.
      await prisma.subscription.create({ data: { businessId: t.id, plan: "pro" } });
    }
    return { a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name } };
  }

  async function staffUser(): Promise<string> {
    const u = await prisma.user.create({
      data: { email: `staff-${++seq}@jamquote.test`, isSuperAdmin: true },
    });
    return u.id;
  }

  return {
    prisma,
    svc,
    wipay,
    mailer,
    tenants,
    staffUser,
    async close() {
      await prisma.$disconnect();
      await pg.close();
    },
  };
}

/** The status and message a rejected call carries, so two 404s can be compared whole. */
export async function failure(p: Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await p;
  } catch (e) {
    const err = e as { getStatus?: () => number; message: string };
    return { status: err.getStatus ? err.getStatus() : -1, message: err.message };
  }
  throw new Error("expected the call to be refused, and it succeeded");
}
