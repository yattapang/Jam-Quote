-- Variations, and retention.
--
-- VARIATION: extra work agreed after a quote was accepted — the commonest
-- source of unpaid work in construction, because the job grows and nobody
-- writes it down.
--
-- Deliberately NOT the same as parentQuoteId, which already exists for
-- revisions. A revision REPLACES a quote that has not been agreed; a variation
-- ADDS to one that has. Same shape, opposite meaning: rewriting the accepted
-- quote would destroy the record of what the client actually agreed to, which
-- is the only thing that settles a dispute.
ALTER TABLE "Quote" ADD COLUMN "variationOfQuoteId" TEXT;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_variationOfQuoteId_fkey"
    FOREIGN KEY ("variationOfQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Quote_variationOfQuoteId_idx" ON "Quote"("variationOfQuoteId");

-- RETENTION: a percentage withheld until the work is signed off, normal in
-- Jamaican construction contracts.
--
-- Per INVOICE, defaulted from the project. A project-only field would silently
-- restate invoices already sent the moment the terms changed mid-job.
ALTER TABLE "Job" ADD COLUMN "retentionPct" DECIMAL(5,2);
ALTER TABLE "Invoice" ADD COLUMN "retentionPct" DECIMAL(5,2);
-- Snapshot of the withheld amount at issue time, so it cannot drift from the
-- document the client holds if the percentage is ever edited.
ALTER TABLE "Invoice" ADD COLUMN "retentionCents" INTEGER NOT NULL DEFAULT 0;
-- When the withheld money was released and became payable.
ALTER TABLE "Invoice" ADD COLUMN "retentionReleasedAt" TIMESTAMP(3);
