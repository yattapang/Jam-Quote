-- PLANNING.md owner decision: no trial; the free tier is 3 quotes a month.
-- The original pricing_config migration seeded 5. That migration has already been
-- applied, so it is not edited (Prisma would reject the checksum change); this one
-- moves the live row instead.
--
-- Only a row still holding the old seeded 5 is changed: if an admin has since set a
-- different value through the console, that decision stands.
UPDATE "PricingConfig"
SET "freeQuotesPerMonth" = 3, "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'default' AND "freeQuotesPerMonth" = 5;
