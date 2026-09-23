-- A subscription now records HOW LONG it runs for, and what was actually agreed.
--
-- Until now a tenant was simply "pro". There was no way to put one on a
-- yearly term, and MRR was computed as proCount x the standard monthly price —
-- so an annual subscriber, or one on a negotiated rate, was reported at the
-- list price regardless of what they pay.
--
-- interval   — "monthly" | "annual". Plain text, matching plan/status beside
--              it, so adding a term (quarterly) needs no enum migration.
-- priceCents — what THIS tenant agreed to pay per term. NULL means "use the
--              standard price for the interval", so the common case stays
--              driven by pricing config and only a negotiated discount is
--              stored per tenant.
ALTER TABLE "Subscription" ADD COLUMN "interval" TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE "Subscription" ADD COLUMN "priceCents" INTEGER;

-- Financials sums across every tenant's own term and price.
CREATE INDEX "Subscription_plan_interval_idx" ON "Subscription"("plan", "interval");
