-- Display unit snapshot on quote/invoice lines (#26 Phase 2a, final item).
--
-- QuoteLineItem.rateUnit is the labour-time vocabulary
-- (HOUR/DAY/WEEK/MONTH/JOB/UNIT) and cannot express how a MATERIAL is sold, so
-- a material sold by the bag printed as "UNIT" on the document the customer
-- reads. RateUnit is deliberately NOT widened — it is shared with LabourRate
-- and must stay a labour-time vocabulary.
--
-- Nullable with no backfill: existing lines keep falling back to rateUnit's
-- label, which is exactly what they render today. A plain string rather than a
-- FK to MaterialUnit, so a quote already sent to a customer cannot change
-- because the contractor later renamed or deleted that unit.

-- AlterTable
ALTER TABLE "QuoteLineItem" ADD COLUMN "unitLabel" TEXT;
ALTER TABLE "InvoiceLineItem" ADD COLUMN "unitLabel" TEXT;
