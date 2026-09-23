-- Platform capabilities, and the second factor that guards them.
--
-- Rule 6: never edited once applied.
--
-- WHO OUR STAFF ARE, STRUCTURALLY
--
-- Pryvis is itself a tenant, and our employees are users of that tenant. That is a
-- deliberate choice (ADR 0017): it reuses one identity, one credential path and one
-- session model rather than building a parallel admin authentication system that would
-- be tested half as well and audited half as carefully.
--
-- What makes someone staff is not a flag on their row but a GRANT in
-- platform_capability - a named capability, given by another named person, with a
-- timestamp. Rule 5.1: no "admin" role that means everything.
--
-- Reading another tenant's data is therefore not something staff can do by being staff.
-- It is impersonation: an explicit, capability-gated, audited, time-bounded act that
-- crosses the tenancy boundary on purpose. Row-level security still applies to our own
-- staff, which is the property this shape buys.

-- ---------------------------------------------------------------------------
-- platform_capability
-- ---------------------------------------------------------------------------
CREATE TABLE "platform_capability" (
    "id"      UUID NOT NULL,
    "user_id" UUID NOT NULL,

    -- A named capability, e.g. "impersonate_tenant", "manage_pricing", "read_audit".
    -- Text rather than an enum: capabilities grow, and a new one should not need a
    -- migration (ADR 0002).
    "capability" TEXT NOT NULL,

    -- Who granted it. NOT NULL for every grant but the first: least privilege is only
    -- real if a grant has an author (Rule 5.1). The bootstrap grant, created by the
    -- seed before any person exists, is the sole exception and is visible as a NULL.
    "granted_by_user_id" UUID,
    "granted_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Revoked rather than deleted: who could do what, and when, is history.
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "platform_capability_pkey" PRIMARY KEY ("id")
);

-- One live grant per capability per person. Partial, so a revoked grant does not block
-- a later re-grant of the same capability.
CREATE UNIQUE INDEX "platform_capability_live_key"
    ON "platform_capability" ("user_id", "capability")
    WHERE "revoked_at" IS NULL;

CREATE INDEX "platform_capability_user_id_idx" ON "platform_capability" ("user_id");

ALTER TABLE "platform_capability"
    ADD CONSTRAINT "platform_capability_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- mfa_totp
--
-- THE SECRET IS ENCRYPTED AT REST, and that is not belt-and-braces.
--
-- A TOTP secret is a credential equal to the password: anyone holding it can generate
-- valid codes forever. Passwords are stored as slow hashes precisely so a database dump
-- is not a list of credentials - storing the second factor in plaintext beside them
-- would hand an attacker with that dump both factors, and the second factor would have
-- bought nothing at all.
--
-- AES-256-GCM, with the key in configuration and never in the database, so a dump alone
-- is useless. The honest limit is stated in ADR 0017: with no key-management service,
-- an attacker who takes both the database AND the environment has the secrets. That is
-- a meaningfully harder bar than one dump, and it is the best available without a KMS.
-- ---------------------------------------------------------------------------
CREATE TABLE "mfa_totp" (
    "user_id" UUID NOT NULL,

    -- AES-256-GCM. The IV and the authentication tag are stored beside the ciphertext
    -- because they are not secret, and GCM cannot detect tampering without the tag.
    "secret_ciphertext" BYTEA NOT NULL,
    "secret_iv"         BYTEA NOT NULL,
    "secret_tag"        BYTEA NOT NULL,

    -- Set when the person has proved they can generate a code. An unconfirmed factor
    -- protects nobody: it means a secret was issued and may never have reached an
    -- authenticator app.
    "confirmed_at" TIMESTAMPTZ(6),

    -- The last 30-second step this factor was used for. A TOTP code stays valid for its
    -- whole step, so without this a code shoulder-surfed or captured in transit can be
    -- replayed within the same window. Stored, not inferred.
    "last_used_step" BIGINT,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mfa_totp_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "mfa_totp"
    ADD CONSTRAINT "mfa_totp_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- mfa_recovery_code
--
-- Hashed with SHA-256 and no salt, which looks wrong beside the scrypt used for
-- passwords and is deliberate: a recovery code is 20 random base32 characters, about
-- 100 bits, generated by us rather than chosen by a person. There is no dictionary to
-- try and no reuse across sites, so a slow hash defends against nothing here - while
-- generating ten of them at scrypt's cost would mean 670 MB of work to enrol one
-- person. The reasoning is recorded so the next reader does not "fix" it.
-- ---------------------------------------------------------------------------
CREATE TABLE "mfa_recovery_code" (
    "id"        UUID NOT NULL,
    "user_id"   UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    -- Single use. Marked rather than deleted, so "a recovery code was used" is a fact
    -- the audit trail can point at.
    "used_at"   TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_code_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mfa_recovery_code_user_id_idx" ON "mfa_recovery_code" ("user_id");
CREATE UNIQUE INDEX "mfa_recovery_code_hash_key" ON "mfa_recovery_code" ("code_hash");

ALTER TABLE "mfa_recovery_code"
    ADD CONSTRAINT "mfa_recovery_code_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- A session that has passed the password but not the second factor.
--
-- Default TRUE would be wrong (every existing tenant session would become pending);
-- default FALSE is right because a session is only created after every check its route
-- requires, and sign-in sets this explicitly when a second factor is owed.
-- ---------------------------------------------------------------------------
ALTER TABLE "app_session" ADD COLUMN "mfa_pending" BOOLEAN NOT NULL DEFAULT false;
