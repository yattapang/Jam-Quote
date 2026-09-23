-- Job costing: what a contractor SPENT, and which job it was for.
--
-- Until now the app recorded only what work was sold. Materials carry a price
-- they are sold AT, never a cost they were bought FOR, so "did this job make
-- money?" — the question contractors actually ask — had no answer, and an
-- accountant could get output tax but never input tax.
--
-- Purchase is its own ledger, deliberately NOT a field on MaterialFavourite.
-- A material is a price-list entry; a purchase is a dated event with a
-- supplier, an amount and a tax treatment. Conflating them is how a price list
-- starts lying about history.
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    -- NULLABLE, and that is the whole design. Fuel, phone, insurance and tools
    -- are real costs with no job behind them. A required project would make
    -- contractors invent one, which poisons every job-profit figure after.
    "projectId" TEXT,
    "supplierId" TEXT,
    "description" TEXT NOT NULL,
    -- What was actually paid, GCT included — this is what the receipt says.
    "amountCents" INTEGER NOT NULL,
    -- The GCT portion of that amount, for input tax. Zero for an exempt or
    -- zero-rated purchase, and for a supplier who is not GCT-registered.
    "gctCents" INTEGER NOT NULL DEFAULT 0,
    -- Free text, matching how material categories work: a contractor's own
    -- words ("Cement", "Fuel", "Tool hire") beat a fixed list nobody agrees on.
    "category" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    -- Soft-delete, matching every other tenant-owned record, so an offline
    -- client doing a delta sync can observe the tombstone.
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Purchase_businessId_purchasedAt_idx" ON "Purchase"("businessId", "purchasedAt");
CREATE INDEX "Purchase_projectId_idx" ON "Purchase"("projectId");

-- Cascade on the tenant (the #19 failure mode). SET NULL on the project: a
-- deleted job must not take the spend with it — the money still left the
-- business and still belongs in the accounts.
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Revenue must be attributable to a project or costs are only half the answer.
-- Only Quote carried projectId, so an invoice raised from scratch (#27) had no
-- route to a job at all — and those ad-hoc extras are often what decides
-- whether a job made money.
ALTER TABLE "Invoice" ADD COLUMN "projectId" TEXT;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Invoice_projectId_idx" ON "Invoice"("projectId");

-- Backfill from the source quote, so existing invoices join their job without
-- anyone re-keying them.
UPDATE "Invoice" i
   SET "projectId" = q."jobId"
  FROM "Quote" q
 WHERE i."quoteId" = q."id" AND q."jobId" IS NOT NULL;
