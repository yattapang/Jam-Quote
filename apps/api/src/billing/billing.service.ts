import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { quoteAllowanceWhere } from "../common/quote-allowance.js";
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
      // The SAME clause the gate enforces. This counted every row, so a
      // contractor's revisions inflated the figure on the Settings card while the
      // gate counted originals — the number shown was not the number enforced.
      this.prisma.quote.count({ where: quoteAllowanceWhere(businessId) }),
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
