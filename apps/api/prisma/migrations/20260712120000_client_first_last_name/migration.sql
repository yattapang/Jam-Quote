-- Split Client.name into firstName/lastName. Backfill from the existing
-- "name" column (first token -> firstName, remainder -> lastName, empty
-- string when there's no space), then drop "name".

-- AlterTable: add nullable columns first so we can backfill.
ALTER TABLE "Client" ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT;

-- Backfill from "name".
UPDATE "Client" SET
  "firstName" = split_part("name", ' ', 1),
  "lastName" = CASE
    WHEN position(' ' in "name") > 0 THEN substring("name" from position(' ' in "name") + 1)
    ELSE ''
  END;

-- Enforce NOT NULL now that every row is backfilled; lastName also gets the
-- app-level default so future inserts without an explicit lastName succeed.
ALTER TABLE "Client" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "Client" ALTER COLUMN "lastName" SET NOT NULL;
ALTER TABLE "Client" ALTER COLUMN "lastName" SET DEFAULT '';

-- Drop the old combined column.
ALTER TABLE "Client" DROP COLUMN "name";
