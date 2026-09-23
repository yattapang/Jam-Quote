-- Town/city as a first-class address field (#30).
--
-- `parish` is the JURISDICTION region (14 in Jamaica) and is wired to the
-- rule-pack via getJurisdiction — it selects tax rules and taxpayer-id format.
-- It was never a substitute for a town, so contractors have been burying
-- "Ocho Rios" inside the free-text addressLine where it cannot be searched,
-- grouped, or laid out properly on a quote or invoice.
--
-- Nullable with NO backfill, deliberately: existing addresses keep working with
-- town unset. Parsing a town out of existing addressLine strings would be a
-- guess dressed up as a migration, and a wrong guess is worse than a blank
-- field on a document a customer reads.
--
-- Supplier is intentionally NOT included. It has `parish` but no addressLine,
-- and is a tenant's own merchant list (#31) rather than a mailing address.

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "town" TEXT;
ALTER TABLE "Client" ADD COLUMN "town" TEXT;
ALTER TABLE "Job" ADD COLUMN "town" TEXT;
