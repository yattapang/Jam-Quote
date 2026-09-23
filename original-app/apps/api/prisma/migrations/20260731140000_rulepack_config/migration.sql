-- RulePackConfig: admin-editable overrides on top of the static @jamquote/core
-- jurisdiction baseline. One row per country (JM today). Only the editable slice
-- lives here — consumption-tax rate + label, provenance (verified date + source),
-- and statutory payroll split rates; everything else (currency, taxpayer-id,
-- regions, payment rails) stays code-owned. Every override column is nullable so
-- a partial edit falls back to the baseline. Written only via /admin/rulepack.
CREATE TABLE "RulePackConfig" (
    "countryCode" TEXT NOT NULL,
    "taxLabel" TEXT,
    "defaultTaxRatePct" DECIMAL(5,2),
    "verifiedAsOf" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "statutoryRates" JSONB,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RulePackConfig_pkey" PRIMARY KEY ("countryCode")
);
