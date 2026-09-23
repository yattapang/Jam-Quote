-- A record of every subscription sweep that ran.
--
-- Without this, silence is ambiguous: a console showing no reminders sent
-- cannot distinguish "swept, nothing was due" from "the sweep has not run in
-- three weeks". That distinction matters here more than usual because the API
-- runs on a host that sleeps, so the daily cron genuinely may not fire.
--
-- Counts rather than a log: enough to see the sweep working at a glance, and
-- the SubscriptionNotice rows are the detail if anyone needs it.
CREATE TABLE "SubscriptionSweepRun" (
    "id" TEXT NOT NULL,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- trigger: "cron" | "boot" | "manual" — which fired this run.
    "trigger" TEXT NOT NULL,
    "noticesSent" INTEGER NOT NULL DEFAULT 0,
    "reverted" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SubscriptionSweepRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionSweepRun_ranAt_idx" ON "SubscriptionSweepRun"("ranAt");
