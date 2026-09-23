-- PlanTierConfig: the per-country commercial layer of the tier ladder (ADR 0007).
--
-- What a tier INCLUDES stays in @jamquote/core (billing/entitlements.ts). This table holds
-- only the commercial slice — price per term, and any numeric-limit override — keyed by
-- (countryCode, tierCode), the same way RulePackConfig holds the editable slice of a
-- jurisdiction. Every value column is nullable and means "no override", so a country with
-- no row, or a half-filled row, falls back to core rather than entitling everyone or no one.
--
-- Platform-wide, so no businessId (BUILD-RULES rule 7 exception, stated in schema.prisma).
CREATE TABLE "PlanTierConfig" (
    "countryCode" TEXT NOT NULL,
    "tierCode" TEXT NOT NULL,
    "monthlyPriceCents" INTEGER,
    "annualPriceCents" INTEGER,
    "currency" TEXT,
    "quoteMonthlyAllowance" INTEGER,
    "usersAllowed" INTEGER,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanTierConfig_pkey" PRIMARY KEY ("countryCode", "tierCode")
);

-- Jamaica's three rows, SEEDED FROM THE LIVE PricingConfig ROW so that no tenant's
-- behaviour changes on deploy.
--
-- PricingConfig is the singleton (id 'default') the staff console's Pricing screen edits
-- today: freeQuotesPerMonth is the live free-tier allowance the quote gate enforces, and
-- proMonthly/proAnnual are what a Pro term costs. An admin may already have moved any of
-- them, so this reads the row rather than restating the in-code defaults; COALESCE over a
-- LEFT JOIN supplies the defaults from apps/api/src/billing/pricing.service.ts
-- (DEFAULT_PRICING) only when the row is absent, and the LEFT JOIN onto a one-row
-- subquery means all three rows are written either way.
--
-- PricingConfig is NOT dropped and NOT changed here. The subscription mailer and the
-- renewal sweep read it for the wording of their emails, and /billing/plans reads it for
-- the Settings card; those keep working untouched. Part B moves the editor onto this table
-- per country, at which point the column becomes redundant and can be retired in its own
-- migration with its own backfill.
INSERT INTO "PlanTierConfig" (
    "countryCode", "tierCode", "monthlyPriceCents", "annualPriceCents", "currency",
    "quoteMonthlyAllowance", "usersAllowed", "updatedAt"
)
SELECT
    'JM', t."tierCode",
    -- Free is priced at 0, not NULL: it IS sold, at nothing (the free tier is the trial).
    CASE t."tierCode"
        WHEN 'free' THEN 0
        WHEN 'pro' THEN COALESCE(p."proMonthlyPriceCents", 200000)
        -- Business has no agreed price yet. NULL means "not sold here", which the admin
        -- screen must show as unpriced rather than as free.
        ELSE NULL
    END,
    CASE t."tierCode"
        WHEN 'free' THEN 0
        WHEN 'pro' THEN COALESCE(p."proAnnualPriceCents", 2000000)
        ELSE NULL
    END,
    COALESCE(p."currency", 'JMD'),
    -- The only limit override that carries live data: today's free allowance. Pro and
    -- Business are unlimited, which is core's baseline and cannot be said in this column
    -- (NULL here means "ask core"), so they are left NULL deliberately.
    CASE t."tierCode" WHEN 'free' THEN COALESCE(p."freeQuotesPerMonth", 3) ELSE NULL END,
    -- Seats are not enforced anywhere yet; these match core's baseline so that when the
    -- seat check ships it refuses exactly what the published matrix says.
    CASE t."tierCode" WHEN 'business' THEN 10 ELSE 1 END,
    CURRENT_TIMESTAMP
FROM (VALUES ('free'), ('pro'), ('business')) AS t("tierCode")
LEFT JOIN "PricingConfig" p ON p."id" = 'default';
