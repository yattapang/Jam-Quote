-- Rate-limit buckets.
--
-- Rule 6: never edited once applied.
--
-- WHY IN THE DATABASE AND NOT IN MEMORY
--
-- A limiter in process memory is faster and is wrong in two ways that matter here.
-- The API sleeps on the free tier and restarts often, so an in-memory counter is
-- cleared by exactly the event an attacker can trigger by waiting. And the moment
-- there are two instances, each one enforces its own limit, so the real limit is
-- whatever we wrote times the number of instances.
--
-- Postgres is already a dependency (Rule 10: no new provider-shaped service without a
-- reason), and the volume on the endpoints this protects is tiny. Redis becomes right
-- when a limiter is needed on high-volume read paths; ADR 0016 records that trigger.
--
-- NOT TENANT-SCOPED, and deliberately outside the isolation rule's remit: this table
-- is consulted BEFORE anyone is identified, which is the whole point of it. It carries
-- no tenant_id, so it is not a hole in row-level security - there is nothing
-- tenant-owned in it to protect. What it must never hold is personal data; see below.

CREATE TABLE "rate_limit_bucket" (
    -- "<action>:<dimension>:<value>", e.g. "signin:ip:203.0.113.4" or
    -- "signin:email:<sha256>". The email is HASHED, never stored: this table would
    -- otherwise become a list of every address anyone has ever typed into our login
    -- form, which is personal data we have no reason to keep (Rule 5). The hash is
    -- unsalted and therefore reversible by guessing a known address - it defeats
    -- casual disclosure and a database dump being a mailing list, not a determined
    -- attacker, and that limit is stated rather than implied.
    "key" TEXT NOT NULL,

    -- Token bucket. Fractional on purpose: tokens refill continuously, so a bucket
    -- holding 2.7 tokens is a real state and rounding it would either give attempts
    -- away or swallow them.
    "tokens" DOUBLE PRECISION NOT NULL,

    -- When `tokens` was last correct. Refill is computed from the gap, so no
    -- background job sweeps this table and an idle bucket costs nothing.
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key")
);

-- Old buckets are deleted by whatever housekeeping runs later; nothing depends on them
-- existing, because an absent bucket is a full one. Indexed so that cleanup can find
-- them without scanning.
CREATE INDEX "rate_limit_bucket_updated_at_idx" ON "rate_limit_bucket" ("updated_at");
