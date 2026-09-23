-- Tenant-owned suppliers (#26 Phase 2b follow-on, closes #28).
--
-- Supplier was a global platform table with no owner: every row was part of a
-- curated directory the admin console managed, so a contractor could not
-- record the corner hardware shop they actually buy from without an admin
-- adding it for everyone.
--
-- Suppliers are now TENANT-ONLY. businessId identifies the one business that
-- can see and manage the row; the curated directory concept is gone (the
-- admin supplier CRUD endpoints are removed in the same change).
--
-- The column stays NULLABLE rather than NOT NULL: rows already in production
-- have no owner to assign, and they are FK-referenced by MaterialPriceEntry
-- and QuoteLineItem, so backfilling an invented owner or dropping them would
-- break live data. A NULL row is legacy platform data that no tenant's API
-- ever returns — nullable in the DB, tenant-scoped in the API.
--
-- Deliberately NO unique constraint on (businessId, name): de-duping is
-- case-insensitive, which a DB constraint cannot express. SuppliersService
-- .create does it (same convention as Trade).

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "businessId" TEXT;

-- CreateIndex
CREATE INDEX "Supplier_businessId_idx" ON "Supplier"("businessId");

-- AddForeignKey
-- ON DELETE CASCADE is REQUIRED and load-bearing. Under Prisma's inferred SET
-- NULL, deleting a tenant would set businessId back to NULL on their private
-- suppliers, stranding that tenant's merchant list as ownerless rows that
-- outlive the tenant and no tenant can reach to clean up — and NULL is what
-- the sibling catalog tables (MaterialCategoryDef, MaterialUnit) treat as
-- "visible to everyone". Same class of bug as #19.
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
