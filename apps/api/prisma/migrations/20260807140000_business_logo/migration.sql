-- Tenant logo storage (#27).
--
-- Bytes in Postgres rather than object storage: the deployment is Render +
-- Neon with no bucket configured, and one small row per tenant beats adopting
-- a storage vendor for a single feature.
--
-- A separate table from Business, not a column on it: Business is read on
-- nearly every page, and carrying image bytes into all of those reads would be
-- a steady invisible cost. One row per business (businessId is the PK), so
-- replacing a logo is an upsert and there is no way to accumulate orphans.

-- CreateTable
CREATE TABLE "BusinessLogo" (
    "businessId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessLogo_pkey" PRIMARY KEY ("businessId")
);

-- AddForeignKey
-- Cascade: a deleted tenant's logo has no meaning and must not outlive them.
ALTER TABLE "BusinessLogo" ADD CONSTRAINT "BusinessLogo_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
