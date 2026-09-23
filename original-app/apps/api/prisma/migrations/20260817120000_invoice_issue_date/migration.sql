-- An invoice needs a date of its own.
--
-- Reports previously bucketed revenue by createdAt, the row-creation
-- timestamp. That is not the invoice's date: a contractor writing up June's
-- work in July had it counted as July revenue, with no way to say otherwise,
-- and back-dating was impossible. dueDate could not stand in — an invoice due
-- on the 1st and one issued on the 1st are different facts.
--
-- Backfilled from createdAt so every existing invoice keeps exactly the date
-- the reports already attributed it to. No figure moves on deploy.
ALTER TABLE "Invoice" ADD COLUMN "issueDate" TIMESTAMP(3);
UPDATE "Invoice" SET "issueDate" = "createdAt" WHERE "issueDate" IS NULL;
ALTER TABLE "Invoice" ALTER COLUMN "issueDate" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "issueDate" SET DEFAULT CURRENT_TIMESTAMP;

-- Reports filter and bucket on this column for a whole business.
CREATE INDEX "Invoice_businessId_issueDate_idx" ON "Invoice"("businessId", "issueDate");
