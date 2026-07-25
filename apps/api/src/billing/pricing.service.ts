import { Injectable, Logger } from "@nestjs/common";
import type { PricingConfig } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdatePricingInput } from "./billing.dto.js";

/** Fixed id of the one-and-only PricingConfig row. */
export const PRICING_CONFIG_ID = "default";

/** Phase-1 defaults — mirrors the seed row in the pricing_config migration. */
export const DEFAULT_PRICING: PricingSnapshot = {
  freeQuotesPerMonth: 5,
  proMonthlyPriceCents: 200_000, // JMD 2,000
  proAnnualPriceCents: 2_000_000, // JMD 20,000
  currency: "JMD",
};

export interface PricingSnapshot {
  freeQuotesPerMonth: number;
  proMonthlyPriceCents: number;
  proAnnualPriceCents: number;
  currency: string;
}

function toSnapshot(row: PricingConfig): PricingSnapshot {
  return {
    freeQuotesPerMonth: row.freeQuotesPerMonth,
    proMonthlyPriceCents: row.proMonthlyPriceCents,
    proAnnualPriceCents: row.proAnnualPriceCents,
    currency: row.currency,
  };
}

/**
 * Admin-editable Phase-1 pricing, stored as a singleton row (PricingConfig,
 * fixed id "default"). Read by the public /billing/plans endpoint and the
 * free-tier quote-creation gate; written only via /admin/pricing.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resilient by design: if the PricingConfig table doesn't exist yet (e.g.
   * this migration hasn't been applied against this DB) or the singleton
   * row is somehow missing, this falls back to (and — when possible —
   * persists) the in-code defaults rather than throwing. Callers like
   * GET /billing/plans must stay a 200 regardless of migration state.
   */
  async get(): Promise<PricingSnapshot> {
    try {
      const existing = await this.prisma.pricingConfig.findUnique({
        where: { id: PRICING_CONFIG_ID },
      });
      if (existing) return toSnapshot(existing);

      const created = await this.prisma.pricingConfig.upsert({
        where: { id: PRICING_CONFIG_ID },
        create: { id: PRICING_CONFIG_ID, ...DEFAULT_PRICING },
        update: {},
      });
      return toSnapshot(created);
    } catch (err) {
      this.logger.warn(
        `PricingConfig read failed (table/row missing?) — falling back to in-code defaults: ${String(err)}`,
      );
      return { ...DEFAULT_PRICING };
    }
  }

  async update(patch: UpdatePricingInput): Promise<PricingSnapshot> {
    const updated = await this.prisma.pricingConfig.upsert({
      where: { id: PRICING_CONFIG_ID },
      create: { id: PRICING_CONFIG_ID, ...DEFAULT_PRICING, ...patch },
      update: patch,
    });
    return toSnapshot(updated);
  }
}
