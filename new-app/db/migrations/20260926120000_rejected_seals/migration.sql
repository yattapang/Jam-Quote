-- A refused seal is its own kind of thing, not an issue waiting to be renumbered (finding H7).
--
-- ## WHAT WAS WRONG
--
-- The two-devices answer said the loser's snapshot is "kept and offered as a revision". Traced, that
-- needs one of three things, and the same release forbade all three:
--
--   1. change its revision number at sync — an UPDATE on a sealed financial document, and the whole
--      model rests on `quote_issue` having no UPDATE path at all;
--   2. insert a fresh `quote_issue` at the next revision from the same snapshot — then `sealed_at`
--      either lies about when the seal happened or is reset to sync time, destroying the one fact the
--      snapshot exists to record, and the render hash covers a document whose revision differs from
--      the one sealed;
--   3. let the device create the next revision itself — forbidden by the very sentence that promised it.
--
-- There was an ordering problem underneath as well: the loser may have sealed EARLIER in wall-clock
-- time, so promoting it to the next revision would mark the winner superseded by a document sealed
-- before it, and the audit trail would state the opposite of what happened.
--
-- ## THE RESOLUTION: IT WAS NEVER AN ISSUE
--
-- The impossibility came from trying to force a rejected attempt into the issue sequence. A refused
-- seal is a **rejected seal** — its own append-only row, outside `quote_issue`, recording exactly what
-- the device priced, when it priced it, and why the server refused it.
--
-- That answers the product need without any of the three routes: **the price the contractor gave the
-- client at the gate is preserved and inspectable**, which is all "offered as a revision" was ever
-- reaching for. Nothing is renumbered, nothing is mutated, no `sealed_at` lies, and the winner is not
-- superseded by anything.
--
-- What the tenant can then do is ordinary work: discard it as a duplicate of what a colleague already
-- sealed, or open a new draft from it and seal that ONLINE as the next revision — whose `sealed_at` is
-- honestly the moment of that new seal, with the rejected row remaining as the record of what was
-- quoted at the gate.
--
-- ## WHY FIRST-TO-SYNC WINS, AND NOT EARLIEST-SEALED
--
-- Earliest-sealed looks fairer and is worse: it means a device that syncs on Friday can retroactively
-- take the identity of a job a colleague has already issued, numbered and sent to the client. First-to-
-- sync is explainable to a contractor in one sentence — "your colleague's version got there first" —
-- and both `sealed_at` values are preserved, so who priced it first is always answerable even though it
-- is not what decides.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not deduplicate. Two devices that price the same job produce one issue and one rejected
--   seal, and deciding they were the same job is the tenant's judgement, not the schema's.
-- - It does not carry the rejected lines into a new draft. Copying them is application work, and it is
--   a copy rather than a move, because the rejected row is append-only.
-- - It says nothing about what a screen shows. The refusal message matters and is not schema.

CREATE TABLE "rejected_seal" (
    "id"        UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quote_id"  UUID NOT NULL,

    -- The revision the device believed it was sealing. Kept as a fact, not as a claim on the sequence:
    -- there is deliberately NO unique index on (quote_id, revision_attempted), because several devices
    -- may all lose the same race and every attempt is worth keeping.
    "revision_attempted" INTEGER NOT NULL,

    -- Why the server refused it. Text rather than an enum: reasons will grow (a suspended tenant, a
    -- deleted client, a lapsed entitlement), and a new reason should not need a migration (ADR 0002).
    "refusal_reason" TEXT NOT NULL,

    -- What the device actually priced, frozen exactly as it was sealed. The point of the row.
    "client_id"            UUID NOT NULL,
    "client_name"          TEXT NOT NULL,
    "title"                TEXT NOT NULL,
    "currency"             TEXT NOT NULL,
    "subtotal_minor"       BIGINT NOT NULL,
    "tax_minor"            BIGINT NOT NULL,
    "total_minor"          BIGINT NOT NULL,

    -- The true moment of the seal, on the device, with no signal. Never rewritten to sync time — that
    -- rewriting is exactly what route 2 above would have required.
    "sealed_at"          TIMESTAMPTZ(6) NOT NULL,
    "sealed_by_user_id"  UUID NOT NULL,
    "catalog_synced_at"  TIMESTAMPTZ(6) NOT NULL,
    -- When it reached the server and was refused. The pair (sealed_at, pushed_at) is what makes "who
    -- priced it first" answerable even though first-to-sync is what decides.
    "pushed_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- The tenant's explicit decision about it, later. Null means nobody has looked yet.
    --
    -- This is the one thing on the row that is written after insert, so it is the one thing that needs
    -- a concurrency control: two people looking at the same list can resolve the same rejected seal,
    -- and `version` makes the second write fail rather than silently win.
    "resolved_at"        TIMESTAMPTZ(6),
    "resolution"         TEXT,
    "version"            INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "rejected_seal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rejected_seal_total_check"
        CHECK ("total_minor" = "subtotal_minor" + "tax_minor"),
    CONSTRAINT "rejected_seal_resolution_check"
        CHECK ("resolution" IS NULL OR "resolution" IN ('discarded', 'reissued'))
);
CREATE INDEX "rejected_seal_quote_id_idx" ON "rejected_seal" ("quote_id");
CREATE INDEX "rejected_seal_unresolved_idx"
    ON "rejected_seal" ("tenant_id") WHERE "resolved_at" IS NULL;
ALTER TABLE "rejected_seal" ADD CONSTRAINT "rejected_seal_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rejected_seal" ADD CONSTRAINT "rejected_seal_quote_id_fkey"
    FOREIGN KEY ("quote_id") REFERENCES "quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "rejected_seal_line" (
    "id"          UUID NOT NULL,
    "tenant_id"   UUID NOT NULL,
    "rejected_seal_id" UUID NOT NULL,
    "section_title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position"    INTEGER NOT NULL,
    "quantity_thousandths" BIGINT NOT NULL,
    "unit_price_minor"     BIGINT NOT NULL,
    "line_total_minor"     BIGINT NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rejected_seal_line_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "rejected_seal_line_seal_idx" ON "rejected_seal_line" ("rejected_seal_id");
ALTER TABLE "rejected_seal_line" ADD CONSTRAINT "rejected_seal_line_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rejected_seal_line" ADD CONSTRAINT "rejected_seal_line_seal_fkey"
    FOREIGN KEY ("rejected_seal_id") REFERENCES "rejected_seal" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-level security.
--
-- `rejected_seal` is append-only for its facts and its `resolution` is the one thing a tenant later
-- sets — so unlike the sealed documents it needs an UPDATE policy, and unlike `issue_balance` that
-- update is ordinary tenant work rather than something only a function may do.
--
-- A column-level restriction would be better and Postgres policies cannot express one: the honest
-- statement is that a tenant who can resolve a rejected seal can also, at the database level, rewrite
-- the price it recorded. What prevents that is the application, and `db/test/documents-core.test.ts`
-- asserts the policy set rather than claiming more.
-- ---------------------------------------------------------------------------
ALTER TABLE "rejected_seal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rejected_seal" FORCE ROW LEVEL SECURITY;
CREATE POLICY rejected_seal_tenant_isolation ON "rejected_seal"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE "rejected_seal_line" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "rejected_seal_line" FORCE ROW LEVEL SECURITY;
CREATE POLICY rejected_seal_line_read ON "rejected_seal_line" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY rejected_seal_line_append ON "rejected_seal_line" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
