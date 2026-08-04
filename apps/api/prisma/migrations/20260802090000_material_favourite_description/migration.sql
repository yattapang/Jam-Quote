-- Materials Phase 1: add a free-text description to MaterialFavourite so it
-- can be searched alongside name + specs (see MaterialFavouritesService.findAll).
-- Nullable, additive, no backfill needed — existing rows simply have
-- description = NULL.

-- AlterTable
ALTER TABLE "MaterialFavourite" ADD COLUMN "description" TEXT;
