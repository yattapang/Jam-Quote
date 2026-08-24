-- Square and cubic metre, as the symbols a contractor actually writes.
--
-- "Square Metre" was already curated but printed in full on the quote line —
-- "30 Square Metre" rather than "30 m²". Cubic metre was missing entirely,
-- which is the unit concrete is sold in here.
--
-- Existing quote and invoice lines snapshot their own unitLabel, so relabelling
-- the curated row changes nothing a client has already been sent.
UPDATE "MaterialUnit" SET label = 'm²' WHERE "businessId" IS NULL AND key = 'sqm';

INSERT INTO "MaterialUnit" (id, "businessId", key, label, sort, "createdAt")
SELECT '3f2b91c4-77de-4a1e-9b30-6c8e5d2a0f11', NULL, 'cum', 'm³', 17, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "MaterialUnit" WHERE "businessId" IS NULL AND key = 'cum'
);
