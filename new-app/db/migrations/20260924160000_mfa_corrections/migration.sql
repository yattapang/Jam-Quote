-- Corrections to the MFA schema, from the staff-MFA design (Rule 1.2).
--
-- Rule 6: the earlier migrations are NOT edited. These are the corrections, as their own
-- migration, which is what Rule 6 asks for and also what makes the reasoning reviewable.
--
-- The three columns below are not refinements. Each one closes a gap that would have made the
-- feature either unmaintainable or unable to meet Rule 5.1, and each was found by designing from
-- what the product needs rather than from what the tables already had.

-- ---------------------------------------------------------------------------
-- 1. A key identifier, so the encryption key can ever be rotated
--
-- Without it, rotating the key makes every enrolled secret undecryptable and forces every staff
-- member to re-enrol. The practical consequence is that the key is never rotated, and "encrypted
-- at rest" quietly becomes "encrypted with a key we can never change".
--
-- With it, two keys can be live at once: new secrets use the current key, existing rows decrypt
-- with the key they name, and a background re-encryption becomes possible without downtime.
--
-- DEFAULT 'k1' names the first key rather than leaving existing rows ambiguous. There are no rows
-- yet, so this is a label for the key the first enrolment will use, not a backfill.
-- ---------------------------------------------------------------------------
ALTER TABLE "mfa_totp" ADD COLUMN "secret_key_id" TEXT NOT NULL DEFAULT 'k1';

-- ---------------------------------------------------------------------------
-- 2. When the factor was last proved, so "recently" is answerable
--
-- app_session.mfa_pending answers "has this session EVER passed a factor". Rule 5.1 asks for
-- RE-authentication before impersonation, a price change, or reading unredacted money detail -
-- and "ever" cannot answer that. A laptop walked away from has a session that passed a factor
-- hours ago.
--
-- NULL means never verified, which for a session carrying mfa_pending = true is the normal state.
-- ---------------------------------------------------------------------------
ALTER TABLE "app_session" ADD COLUMN "mfa_verified_at" TIMESTAMPTZ(6);

-- ---------------------------------------------------------------------------
-- 3. Consecutive verification failures, so guessing is bounded per factor
--
-- The rate limiter bounds attempts per session and per IP, and it is the first line. This column
-- is the second: it survives a new session, so an attacker cannot reset their budget by signing in
-- again with a password they have already stolen. A 6-digit code is a million possibilities, which
-- is nothing without a limit.
--
-- Reset to zero on a successful verification.
-- ---------------------------------------------------------------------------
ALTER TABLE "mfa_totp" ADD COLUMN "failed_attempts" INTEGER NOT NULL DEFAULT 0;

-- Locked until this moment, after too many consecutive failures. Distinct from a session refusal:
-- this follows the person, not the session.
ALTER TABLE "mfa_totp" ADD COLUMN "locked_until" TIMESTAMPTZ(6);
