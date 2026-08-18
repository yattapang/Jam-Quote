-- A regulatory update can be marked reviewed.
--
-- The staff console has always counted "Applied (YTD)" on this feed, but
-- nothing could ever set that state: a row was "needs review" when it carried
-- an actionNeeded string and "monitoring" otherwise, with no third option. The
-- stat was therefore permanently zero, and staff had no way to record that a
-- change had actually been dealt with.
--
-- Nullable and unset: every existing row stays unreviewed, which is accurate —
-- none of them has been.
ALTER TABLE "RegulatoryUpdate" ADD COLUMN "reviewedAt" TIMESTAMP(3);
ALTER TABLE "RegulatoryUpdate" ADD COLUMN "reviewedByUserId" TEXT;

-- The console lists newest-first and filters on review state.
CREATE INDEX "RegulatoryUpdate_reviewedAt_idx" ON "RegulatoryUpdate"("reviewedAt");
