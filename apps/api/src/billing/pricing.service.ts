import { Injectable, Logger } from "@nestjs/common";
import type { PricingConfig } from "@prisma/client";
import { PlanTier } from "@jamquote/core";
import { PrismaService } from "../prisma/prisma.service.js";
import type { UpdatePricingInput } from "./billing.dto.js";

/** Fixed id of the one-and-only PricingConfig row. */
export const PRICING_CONFIG_ID = "default";

/** Phase-1 defaults — mirrors the seed row in the pricing_config migration. */
export const DEFAULT_PRICING: PricingSnapshot = {
  // The free tier IS the trial: it never expires, so a contractor keeps
  // quoting small jobs indefinitely and only pays when volume justifies it. It
  // is also what a lapsed subscription reverts to, so it must stay genuinely
  // usable rather than punitive.
  //
  // Only a DEFAULT — it applies when no PricingConfig row exists. The live
  // value is editable in the staff console (Pricing), and every quota check
  // reads the row, so changing it there takes effect immediately without a
  // deploy.
  //
  // 3, per PLANNING.md ("No trial. The free tier IS the trial: 3 quotes a
  // month, indefinitely.") and the owner decision recorded there
  // (2026-08-18): "Trial | None. Free tier is 3 quotes/month." This constant
  // used to read 5 with a comment justifying it; that was the stale value,
  // not the decision.
  freeQuotesPerMonth: 3,
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

    // WRITE THROUGH to the free tier's quote allowance in PlanTierConfig.
    //
    // Since ADR 0007 the quote gate asks EntitlementsService, which reads
    // PlanTierConfig.quoteMonthlyAllowance (seeded from this row) and falls back to core's
    // baseline. This screen is still the only live control for the allowance until part B
    // moves the editor onto PlanTierConfig per country, so without this an admin editing
    // "free quotes per month" here would change the number the Settings card SHOWS and not
    // the one the gate ENFORCES — the exact "3 of 5 and then a refusal" drift ADR 0004 is
    // about, and the reason this mirror exists rather than two readers of two rows.
    //
    // Every country's free row, not JM's: no country literal in product code (BUILD-RULES
    // rule 5), and this screen is not per country yet, so an edit here means "everywhere
    // this tier is sold". Part B replaces both sides of this with a per-country editor.
    if (patch.freeQuotesPerMonth !== undefined) {
      await this.prisma.planTierConfig.updateMany({
        where: { tierCode: PlanTier.FREE },
        data: { quoteMonthlyAllowance: patch.freeQuotesPerMonth },
      });
    }

    return toSnapshot(updated);
  }
}
