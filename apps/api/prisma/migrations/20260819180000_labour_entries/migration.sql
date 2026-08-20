-- Time worked on a job — usually the LARGEST cost on it.
--
-- Purchases capture money that left the business for goods. Labour is a
-- different fact: hours or days at a rate, often recorded before it is paid
-- (the crew works this week and is paid Friday), and worth knowing in HOURS
-- rather than only in dollars. Recording it as a purchase would lose the
-- quantity, which is the part that tells a contractor whether a job overran.
--
-- Until this existed, every job-profit figure overstated: costs counted the
-- cement and not the men who laid it.
CREATE TABLE "LabourEntry" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    -- Nullable for the same reason as Purchase.projectId: office and admin
    -- time is a real cost with no job behind it, and a required field would
    -- make contractors attach it to whatever job was open.
    "projectId" TEXT,
    -- The rate book entry this came from, when it came from one. Nullable
    -- because a contractor must be able to type a one-off rate for a day
    -- labourer who is not in the book.
    "labourRateId" TEXT,
    -- Who did the work, in the contractor's own words ("Devon", "3 masons").
    "description" TEXT NOT NULL,
    -- Hours or days, matching the unit below. Decimal because half-days and
    -- part-hours are normal.
    "quantity" DECIMAL(12,3) NOT NULL,
    -- SNAPSHOT of the rate at the time. Never re-read from LabourRate: raising
    -- your day rate must not silently rewrite what last month's jobs cost.
    "rateCents" INTEGER NOT NULL,
    -- What the quantity counts — "day", "hour", or the contractor's own word.
    "unitLabel" TEXT NOT NULL DEFAULT 'day',
    "workedOn" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "LabourEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LabourEntry_businessId_workedOn_idx" ON "LabourEntry"("businessId", "workedOn");
CREATE INDEX "LabourEntry_projectId_idx" ON "LabourEntry"("projectId");

ALTER TABLE "LabourEntry" ADD CONSTRAINT "LabourEntry_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL on both: deleting a job must not erase the wage bill, and removing
-- a rate from the book must not delete the history of work done at it.
ALTER TABLE "LabourEntry" ADD CONSTRAINT "LabourEntry_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabourEntry" ADD CONSTRAINT "LabourEntry_labourRateId_fkey"
    FOREIGN KEY ("labourRateId") REFERENCES "LabourRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
