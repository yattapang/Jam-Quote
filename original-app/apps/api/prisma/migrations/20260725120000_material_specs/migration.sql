-- Structured material catalog: add optional category + spec attributes to
-- MaterialFavourite. Both columns are nullable and no backfill is needed —
-- existing rows simply have category/specs = NULL, which the app treats as
-- "uncategorized" (see apps/web/lib/material-categories.ts).

-- AlterTable
ALTER TABLE "MaterialFavourite" ADD COLUMN "category" TEXT;
ALTER TABLE "MaterialFavourite" ADD COLUMN "specs" JSONB;
