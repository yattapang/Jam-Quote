-- Phase-1 subscription tiers: admin-editable pricing, stored as a single
-- singleton row (fixed id "default") so there is always exactly one config
-- to read/update. Seed it with the current free/Pro defaults so the app
-- keeps working immediately after this migration runs.

-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "freeQuotesPerMonth" INTEGER NOT NULL,
    "proMonthlyPriceCents" INTEGER NOT NULL,
    "proAnnualPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JMD',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- Seed the singleton row with Phase-1 defaults.
INSERT INTO "PricingConfig" ("id", "freeQuotesPerMonth", "proMonthlyPriceCents", "proAnnualPriceCents", "currency", "updatedAt")
VALUES ('default', 5, 200000, 2000000, 'JMD', CURRENT_TIMESTAMP);
