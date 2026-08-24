-- The public link for an invoice, mirroring Quote's.
-- A payment reminder that names a figure but cannot show the document is the
-- first thing a chased client queries.
ALTER TABLE "Invoice" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "sharedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "firstViewedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Invoice_shareToken_key" ON "Invoice"("shareToken");
