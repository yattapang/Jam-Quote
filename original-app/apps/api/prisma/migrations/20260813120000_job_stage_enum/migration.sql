-- Job.stage becomes a real workflow (#36): free text -> the JobStage enum.
--
-- Until now `stage` was TEXT DEFAULT 'Quoted' that NOTHING in api, web or
-- mobile ever wrote. It was rendered on three screens, so every job has read
-- "Quoted" since the day it was created — a field that looks like a workflow
-- and is actually a constant. Making it an enum is what lets the UI offer a
-- fixed set of stages to set, and stops the next writer inventing a sixth
-- spelling of "in progress".
--
-- There is deliberately NO Invoiced/Paid stage. That is billing state, it
-- lives on Invoice.status, and storing the same fact twice guarantees the two
-- eventually disagree. Legacy 'Invoiced' therefore maps to WON — an invoice
-- proves the job was won; it does not prove the block work is finished, and
-- claiming COMPLETE here would be inventing knowledge this database has never
-- held.
--
-- Which values can actually be in production: the column default ('Quoted'),
-- whatever prisma/seed.ts wrote from the core demo fixtures ('Quoted',
-- 'In progress', 'Awaiting approval', 'Complete', 'Invoiced'), and anything an
-- offline client pushed through POST /sync, whose DTO accepted a bare string.
-- The CASE below covers all of those plus the obvious spelling variants, is
-- case- and separator-insensitive, and falls back to QUOTED.
--
-- Non-destructive in the sense that matters: no row, column or table is
-- dropped and progressPct is untouched. The conversion IS in place, so an
-- unrecognized free-text stage is not recoverable afterwards — hence the
-- RAISE NOTICE below, which prints every value about to be folded onto QUOTED
-- so the deploy log keeps a record instead of losing it silently. Reversing
-- this migration is `ALTER COLUMN "stage" TYPE TEXT` with the labels; no data
-- has to be reconstructed for that to work.

-- CreateEnum
CREATE TYPE "JobStage" AS ENUM ('QUOTED', 'WON', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED');

-- Log anything the mapping does not recognise BEFORE it is folded onto QUOTED.
-- Notice-only: an unmappable stage is not an error and must not block a
-- production deploy over a field nothing could set in the first place.
DO $$
DECLARE
  v_unmapped text;
BEGIN
  SELECT string_agg(DISTINCT quote_literal("stage"), ', ')
    INTO v_unmapped
    FROM "Job"
   -- Must list exactly the values the CASE below names, or this notice lies.
   WHERE lower(regexp_replace(btrim(coalesce("stage", '')), '[\s_-]+', ' ', 'g')) NOT IN (
     'quoted', 'awaiting approval',
     'won', 'accepted', 'approved', 'invoiced',
     'in progress', 'started', 'ongoing',
     'complete', 'completed', 'done', 'finished',
     'cancelled', 'canceled', 'abandoned'
   );
  IF v_unmapped IS NOT NULL THEN
    RAISE NOTICE 'job stage enum: unrecognized stages defaulted to QUOTED: %', v_unmapped;
  END IF;
END $$;

-- AlterTable
-- The old TEXT default has to go first: Postgres cannot cast 'Quoted' to the
-- new type while the default is still attached to the column.
ALTER TABLE "Job" ALTER COLUMN "stage" DROP DEFAULT;

ALTER TABLE "Job"
  ALTER COLUMN "stage" TYPE "JobStage"
  USING (
    CASE lower(regexp_replace(btrim(coalesce("stage", '')), '[\s_-]+', ' ', 'g'))
      WHEN 'won'      THEN 'WON'
      WHEN 'accepted' THEN 'WON'
      WHEN 'approved' THEN 'WON'
      -- Billing state, not work state: the job was certainly won, and nothing
      -- here knows whether the work is done. See the header.
      WHEN 'invoiced' THEN 'WON'
      WHEN 'in progress' THEN 'IN_PROGRESS'
      WHEN 'started'     THEN 'IN_PROGRESS'
      WHEN 'ongoing'     THEN 'IN_PROGRESS'
      WHEN 'complete'  THEN 'COMPLETE'
      WHEN 'completed' THEN 'COMPLETE'
      WHEN 'done'      THEN 'COMPLETE'
      WHEN 'finished'  THEN 'COMPLETE'
      WHEN 'cancelled' THEN 'CANCELLED'
      WHEN 'canceled'  THEN 'CANCELLED'
      WHEN 'abandoned' THEN 'CANCELLED'
      WHEN 'quoted' THEN 'QUOTED'
      -- 'Awaiting approval' is a quote that has been sent and not yet
      -- answered — the job itself has not been won, so it stays QUOTED.
      WHEN 'awaiting approval' THEN 'QUOTED'
      -- Everything unrecognized (and NULL/empty) lands here, after being
      -- named in the notice above.
      ELSE 'QUOTED'
    END
  )::"JobStage";

ALTER TABLE "Job" ALTER COLUMN "stage" SET DEFAULT 'QUOTED';
