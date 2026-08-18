-- What KIND of term each payment bought.
--
-- Paid-through is recomputed by chaining terms from where the run began, and
-- chaining needs calendar arithmetic: Aug->Sep is 31 days and Sep->Oct is 30,
-- so summing raw durations drifts a day per month and lands a renewal on the
-- wrong date. Storing the interval lets the recompute re-apply nextTermEnd
-- rather than add milliseconds.
--
-- Backfilled by span: anything close to a year was an annual term.
ALTER TABLE "SubscriptionPayment" ADD COLUMN "interval" TEXT NOT NULL DEFAULT 'monthly';
UPDATE "SubscriptionPayment"
   SET "interval" = 'annual'
 WHERE "coversUntil" - "coversFrom" > INTERVAL '300 days';
