-- Platform billing: a record of what tenants have paid JamQuote, and of what
-- they have been told about it.
--
-- SubscriptionPayment is NOT the existing Payment table. That one is a
-- contractor's client paying the contractor's invoice — tenant revenue. This
-- is a tenant paying JamQuote — platform revenue. Two separate books of
-- account that must never be summed; the names are deliberately distinct so a
-- future join cannot be written by accident.
--
-- Both tables cascade on businessId. A hard-deleted tenant must not strand
-- billing rows pointing at a business that no longer exists (the #19 failure
-- mode).
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JMD',
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- The term this payment bought. Whole terms only, so these are exactly one
    -- interval apart and reconcile with Subscription.renewsAt.
    "coversFrom" TIMESTAMP(3) NOT NULL,
    "coversUntil" TIMESTAMP(3) NOT NULL,
    "recordedByUserId" TEXT NOT NULL,
    "note" TEXT,
    -- Voided, never deleted: a mis-keyed receipt is history, not an accident
    -- to erase. Matches how invoice payments already behave.
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionPayment_businessId_paidAt_idx" ON "SubscriptionPayment"("businessId", "paidAt");

ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per notice actually sent. The UNIQUE constraint is the idempotency:
-- the sweep runs on a host that sleeps, so it is expected to run from the cron,
-- on boot, and from an admin button, and must never double-send.
CREATE TABLE "SubscriptionNotice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SubscriptionNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionNotice_businessId_kind_periodEnd_key" ON "SubscriptionNotice"("businessId", "kind", "periodEnd");

ALTER TABLE "SubscriptionNotice" ADD CONSTRAINT "SubscriptionNotice_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Where renewal mail goes. Maintained by the SUBSCRIBER, not by staff: the
-- person who owns the login is often not the person who pays the bills.
ALTER TABLE "Business" ADD COLUMN "billingContactName" TEXT;
ALTER TABLE "Business" ADD COLUMN "billingContactEmail" TEXT;
