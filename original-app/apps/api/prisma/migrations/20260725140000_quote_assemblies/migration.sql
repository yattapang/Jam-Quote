-- Quote assemblies: a quote can contain "assembly lines" (a job type
-- dropped in at a quantity), and the whole quote has a detail level
-- controlling how those lines render (SUMMARY = single priced line,
-- DETAILED = expanded into their component snapshot). Additive/safe on
-- existing rows — detailLevel defaults to SUMMARY and the new
-- QuoteLineItem columns are nullable (a normal, non-assembly line leaves
-- them null). assemblyId is a plain reference back to Assembly, not a FK:
-- it's a point-in-time snapshot, so editing/deleting the source Assembly
-- must never alter historical quotes. Pricing (quantity x unitPriceCents)
-- is unchanged; assemblyComponents is display-only.

-- CreateEnum
CREATE TYPE "QuoteDetailLevel" AS ENUM ('SUMMARY', 'DETAILED');

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN "detailLevel" "QuoteDetailLevel" NOT NULL DEFAULT 'SUMMARY';

-- AlterTable
ALTER TABLE "QuoteLineItem" ADD COLUMN "assemblyId" TEXT;
ALTER TABLE "QuoteLineItem" ADD COLUMN "assemblyName" TEXT;
ALTER TABLE "QuoteLineItem" ADD COLUMN "assemblyUnit" TEXT;
ALTER TABLE "QuoteLineItem" ADD COLUMN "assemblyComponents" JSONB;
