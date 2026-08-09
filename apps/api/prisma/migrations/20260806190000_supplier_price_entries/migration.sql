-- Per-supplier pricing linked to tenant materials (#26 Phase 2b, closes #25/7).
--
-- MaterialPriceEntry existed since the initial migration but was orphaned:
-- supplierId required, no businessId, no link to MaterialFavourite. It was
-- written only by prisma/seed.ts and read only as a per-supplier count in the
-- admin console, so tenant materials could not show supplier price comparison
-- at all.
--
-- Two kinds of row after this:
--   businessId NULL = platform-curated lookup price (reference data)
--   businessId set  = a price this contractor recorded themselves
--
-- Deliberately NO unique constraint on (supplierId, materialFavouriteId):
-- repeated rows over time ARE the price history, ordered by fetchedAt.

-- AlterTable
ALTER TABLE "MaterialPriceEntry" ADD COLUMN "businessId" TEXT;
ALTER TABLE "MaterialPriceEntry" ADD COLUMN "materialFavouriteId" TEXT;
ALTER TABLE "MaterialPriceEntry" ADD COLUMN "note" TEXT;

-- CreateIndex
CREATE INDEX "MaterialPriceEntry_businessId_idx" ON "MaterialPriceEntry"("businessId");
CREATE INDEX "MaterialPriceEntry_materialFavouriteId_idx" ON "MaterialPriceEntry"("materialFavouriteId");

-- AddForeignKey
-- ON DELETE CASCADE on businessId is REQUIRED and matters more here than
-- anywhere else in this schema: under Prisma's inferred SET NULL, deleting a
-- tenant would convert that tenant's privately-recorded supplier prices into
-- curated rows visible to EVERY other contractor — publishing what they pay
-- their suppliers. Same class of bug as #19, far worse blast radius.
ALTER TABLE "MaterialPriceEntry" ADD CONSTRAINT "MaterialPriceEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialPriceEntry" ADD CONSTRAINT "MaterialPriceEntry_materialFavouriteId_fkey" FOREIGN KEY ("materialFavouriteId") REFERENCES "MaterialFavourite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
