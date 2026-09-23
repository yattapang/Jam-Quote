-- BusinessEntitlementGrant: one entitlement added to one tenant beyond its tier (ADR 0007
-- §5). A tenant's effective set is tier ∪ grants.
CREATE TABLE "BusinessEntitlementGrant" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,
    "reason" TEXT NOT NULL,
    CONSTRAINT "BusinessEntitlementGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BusinessEntitlementGrant_businessId_feature_key"
    ON "BusinessEntitlementGrant"("businessId", "feature");
CREATE INDEX "BusinessEntitlementGrant_businessId_idx"
    ON "BusinessEntitlementGrant"("businessId");

ALTER TABLE "BusinessEntitlementGrant" ADD CONSTRAINT "BusinessEntitlementGrant_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────── GRANDFATHERING
--
-- "Existing users must not lose a feature they already use when it becomes paid" (ADR
-- 0007, context). So the question this backfill answers is not "what should a free tenant
-- have?" but "what can a free tenant DO TODAY, in the code as it stands?".
--
-- Worked out from the code, not from the tier table: before this migration the ONLY
-- entitlement check anywhere in the product was the free-plan quote allowance in
-- QuotesService.assertCanCreateQuote (Subscription.plan === "pro" short-circuit plus
-- PricingConfig.freeQuotesPerMonth). Nothing else consulted `plan` — not invoices, not
-- payments, not reminders, not the WiPay card link, not job costing, not retention, not the
-- CSV exports, not the mobile sync endpoints, not the job (recipe) editor, not the material
-- price entries. Every one of those was reachable by a tenant on the free plan.
--
-- Therefore each of those capabilities is granted explicitly to every business that is NOT
-- already on a tier which includes it. The grants below are exactly the features that (a)
-- exist in the product today and (b) sit above Free on the new ladder:
--
--   recipe.edit, invoice.manage, payment.record, payment.reminders, payment.cardLink,
--   project.costing, retention.track, export.csv, offline.sync, priceIndex.read
--
-- Features on the ladder that are NOT granted, because nothing in the product implements
-- them and so no tenant can be losing them: role.approvals, crew.manage,
-- report.consolidated, priceIndex.alerts, branding.colours, branding.perClientTerms,
-- whatsapp.businessSend, api.access.
--
-- Only tenants whose tier does not already include these get rows: a Pro tenant needs no
-- grant (its tier includes all ten), and giving it one would mean that if it later dropped
-- to Free it would keep Pro features for ever — the opposite of what the sweep's revert is
-- for. COALESCE over a LEFT JOIN because a business with no Subscription row at all reads
-- as free (planTier() in core does the same).
--
-- Soft-deleted businesses are included on purpose: a restore must not quietly return a
-- tenant with fewer capabilities than it had when it was suspended.
--
-- The monthly quote allowance is NOT grandfathered. It is a limit, not a feature, and
-- today's live value is carried forward in PlanTierConfig by the previous migration, so a
-- free tenant's allowance is the same number after this deploy as before it.
INSERT INTO "BusinessEntitlementGrant" ("id", "businessId", "feature", "grantedAt", "grantedBy", "reason")
SELECT
    -- md5 of business+feature, not gen_random_uuid(), so re-running this on a copy of the
    -- database produces the same ids (the convention set by the trades migration).
    md5('entitlement-grant:' || b."id" || ':' || f."feature")::uuid::text,
    b."id",
    f."feature",
    CURRENT_TIMESTAMP,
    -- NULL: the platform granted this, not a staff user. The admin console must render
    -- that as "Grandfathered" rather than inventing an actor.
    NULL,
    'Grandfathered at the tier launch: this tenant could already do this before entitlements existed (ADR 0007).'
FROM "Business" b
CROSS JOIN (VALUES
    ('recipe.edit'),
    ('invoice.manage'),
    ('payment.record'),
    ('payment.reminders'),
    ('payment.cardLink'),
    ('project.costing'),
    ('retention.track'),
    ('export.csv'),
    ('offline.sync'),
    ('priceIndex.read')
) AS f("feature")
LEFT JOIN "Subscription" s ON s."businessId" = b."id"
WHERE COALESCE(lower(btrim(s."plan")), 'free') NOT IN ('pro', 'business');
