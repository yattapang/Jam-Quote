-- The client's own accept/decline through the public share link.
-- Kept separate from a contractor setting the status by hand: that difference
-- is the whole evidential value of the record.
ALTER TABLE "Quote" ADD COLUMN "decidedAt" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN "decidedByName" TEXT;
ALTER TABLE "Quote" ADD COLUMN "declineReason" TEXT;
