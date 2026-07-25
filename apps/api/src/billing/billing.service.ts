import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { startOfCurrentMonth } from "../common/month.util.js";
import { PricingService, type PricingSnapshot } from "./pricing.service.js";

export interface BillingStatus {
  plan: "free" | "pro";
  isPro: boolean;
  quotesThisMonth: number;
  freeQuotesPerMonth: number;
  renewsAt: Date | null;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
  ) {}

  /** Public pricing read — GET /billing/plans. */
  plans(): Promise<PricingSnapshot> {
    return this.pricing.get();
  }

  /** Per-business billing status — GET /billing/status. */
  async status(businessId: string): Promise<BillingStatus> {
    const [subscription, { freeQuotesPerMonth }, quotesThisMonth] = await Promise.all([
      this.prisma.subscription.findUnique({ where: { businessId } }),
      this.pricing.get(),
      this.prisma.quote.count({
        where: { businessId, createdAt: { gte: startOfCurrentMonth() } },
      }),
    ]);

    const plan: "free" | "pro" = subscription?.plan === "pro" ? "pro" : "free";
    return {
      plan,
      isPro: plan === "pro",
      quotesThisMonth,
      freeQuotesPerMonth,
      renewsAt: subscription?.renewsAt ?? null,
    };
  }
}
