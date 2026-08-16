-- Tenants can hide catalog vocabulary they never use, to shorten their pickers.
--
-- Reported as wanting to REMOVE entries from the dropdowns that can create
-- them. Deleting is the wrong verb for three reasons:
--
--   1. The goal is a shorter list, not destroyed data. An entry used by forty
--      materials should stop being OFFERED, not vanish from under them.
--   2. Deleting is already blocked in practice — those foreign keys are
--      ON DELETE RESTRICT in production, so removing an in-use row errors.
--   3. Sent documents snapshot their unit/category as TEXT, so hiding can
--      never alter a quote a customer already holds. Deleting could not
--      either, which is precisely why deleting buys nothing.
--
-- WHY A SEPARATE TABLE, AND NOT A FLAG ON EACH ROW.
--
-- The catalog uses the curated/tenant-extension pattern: businessId NULL means
-- a platform-curated row that EVERY tenant shares. Adding `archivedAt` to
-- MaterialCategoryDef and setting it on curated "Cement" would hide cement for
-- every contractor on the platform — the same class of failure as #19, where
-- an ON DELETE SET NULL would have promoted a tenant's private rows to public
-- ones. A tenant's opinion about a shared row cannot live on the shared row.
--
-- Scoping the hide by businessId makes the safe thing the only expressible
-- thing: there is no way to write "hidden" without saying who hid it.
--
-- `rowId` is deliberately NOT a foreign key. It points into one of several
-- catalog tables depending on `kind`, and Postgres cannot express that. The
-- cost is that deleting a catalog row leaves an orphaned hide record; that is
-- harmless (it hides an id that no longer exists) and cheaper than four
-- near-identical join tables.
CREATE TABLE "CatalogHidden" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogHidden_pkey" PRIMARY KEY ("id")
);

-- Hiding is idempotent: one row per tenant per catalog entry.
CREATE UNIQUE INDEX "CatalogHidden_businessId_kind_rowId_key"
    ON "CatalogHidden"("businessId", "kind", "rowId");

-- Every read filters by (businessId, kind).
CREATE INDEX "CatalogHidden_businessId_kind_idx" ON "CatalogHidden"("businessId", "kind");

-- CASCADE, like every other business-scoped table: deleting a tenant must take
-- their preferences with them, and there is nothing here worth orphaning.
ALTER TABLE "CatalogHidden" ADD CONSTRAINT "CatalogHidden_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
