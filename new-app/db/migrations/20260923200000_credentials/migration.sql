-- Credentials move out of app_user into their own table.
--
-- Rule 6: never edited once applied.
--
-- WHY A SEPARATE TABLE
--
-- Sign-in must find a user BY EMAIL before any tenant is known, and app_user is
-- protected by row-level security that requires app.tenant_id. So the lookup that
-- starts authentication cannot read app_user at all. This is the same boundary
-- app_session hit, and it gets the same explicit treatment rather than a workaround.
--
-- What the split buys beyond making sign-in possible:
--
--   * app_user, the row every module reads, no longer carries a password hash at all.
--     A widened SELECT in some future reporting query cannot leak one, because there
--     is nothing there to leak.
--   * The credential row is thin and boring: an email, a hash, and who it belongs to.
--   * Exactly two tables sit outside row-level security, both of them authentication
--     bootstrap, both named with their reason in db/test/policy-parity.test.ts. A
--     third cannot appear quietly.
--
-- EMAIL IS GLOBALLY UNIQUE HERE, and that is a real trade-off, recorded in ADR 0015:
-- it means a person cannot use one email address at two contracting businesses, and
-- it means registration must answer "this email is taken" in a way that does not
-- confirm it. app_user keeps its per-tenant unique on email for display purposes.

CREATE TABLE "app_credential" (
    "id"      UUID NOT NULL,
    -- One credential per user. A second sign-in method (an OAuth identity, a passkey)
    -- will be its own table, not another row here, so this stays "the password".
    "user_id" UUID NOT NULL,
    -- Denormalised for the same reason app_session does it: the tenant must be known
    -- before row-level security can be satisfied, and this is where it comes from.
    "tenant_id" UUID NOT NULL,
    -- Stored already lower-cased and trimmed by core/auth. Normalisation happens in
    -- ONE place so this index means what it appears to mean.
    "email"         VARCHAR(320) NOT NULL,
    -- scrypt$N$r$p$salt$hash — the parameters travel with the hash so the cost can be
    -- raised later on successful sign-in (ADR 0014).
    "password_hash" TEXT NOT NULL,
    "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"    TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "app_credential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "app_credential_user_id_key" ON "app_credential" ("user_id");
CREATE UNIQUE INDEX "app_credential_email_key" ON "app_credential" ("email");

ALTER TABLE "app_credential"
    ADD CONSTRAINT "app_credential_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_credential"
    ADD CONSTRAINT "app_credential_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- app_user no longer holds a hash. Dropped rather than left behind: a column that
-- still exists is a column something will eventually write to, and then there are two
-- places a password lives. There are no rows in any deployed database yet, so nothing
-- is lost; from the first deploy, a change like this would need a backfill first.
ALTER TABLE "app_user" DROP COLUMN "password_hash";
