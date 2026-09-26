-- The table the rest of the schema already points at (finding J9).
--
-- ## WHAT WAS WRONG
--
-- `acceptance` carries `document_render_id`, with the comment "What was signed: the render, whose
-- hash is the document. Not a hash of its own (finding F17)." **No migration creates a
-- `document_render` table.** The column has no foreign key, so nothing refused the reference, and
-- three documents describe the row it points at: PRD R1.16a ("the hash is recorded once, on
-- `document_render`"), N3 (it has no UPDATE path), and the domain model's entity table.
--
-- F17's fix — stop copying the hash onto `acceptance`, reference the render instead — was therefore
-- half applied: the copy was removed and the target was never built. An acceptance could only ever
-- have carried a null there, which means **the one thing an acceptance is supposed to bind itself to
-- was unbindable**, and the column made it look otherwise.
--
-- This is the same class as M18 and M14: a name that reads as evidence. The new guard,
-- `tools/check_schema_citations.py`, now refuses any UUID `*_id` column that has neither a foreign
-- key nor a table of that name — which is how this was found rather than argued about.
--
-- ## THE DIRECTION OF THE REFERENCE, WHICH THE DOCUMENTS HAD BACKWARDS
--
-- The domain model said the hash "is what `acceptance` and `quote_issue` point at". A `quote_issue`
-- cannot point at it: the issue is **sealed first and rendered afterwards**, and a sealed row has no
-- UPDATE path by which to gain a pointer. So the render points at its issue, not the reverse, and
-- the document is amended to say so. An acceptance genuinely does point at a render, because an
-- acceptance is created after both.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- - It does not choose object storage. `storage_key` is deliberately provider-agnostic text; the
--   provider is an owner decision still outstanding and it blocks R1.36, not this table.
-- - It does not render anything. Producing the PDF, hashing it and writing the row is application
--   work, and this migration only makes the row possible and immutable.
-- - It does not cover invoice renders. Invoices will need one too, and it will be a second nullable
--   foreign key column on this table rather than a polymorphic `subject_id` — a polymorphic
--   reference is precisely the unenforced kind that produced this finding.
-- - It does not backfill. There are no acceptances yet, so there is nothing to bind.

CREATE TABLE "document_render" (
    "id"        UUID NOT NULL,
    "tenant_id" UUID NOT NULL,

    -- The sealed document this render is OF. Not null: a render with no subject is a file, not a
    -- record of what a client was shown.
    "issue_id"  UUID NOT NULL,

    -- Where the bytes are. Provider-agnostic on purpose — see the note above.
    "storage_key" TEXT NOT NULL,
    -- The document, for every purpose that matters later. Lowercase hex, fixed length, checked:
    -- a hash column that accepts anything is a hash column that will one day hold "pending".
    "sha256"      TEXT NOT NULL,
    "byte_size"   BIGINT NOT NULL,

    -- The settings the render was produced with — logo, terms version, tax configuration. Kept so a
    -- later re-render can be compared like with like, and so "why does the reissued PDF differ" is
    -- answerable rather than a matter of memory.
    "settings"    JSONB NOT NULL,

    "rendered_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rendered_by_user_id" UUID,

    CONSTRAINT "document_render_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "document_render_sha256_check"
        CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "document_render_byte_size_check"
        CHECK ("byte_size" > 0)
);

-- One row per distinct set of bytes per issue. A re-render that produces an identical PDF is not a
-- new fact, and R1.16a's "recorded once" is this index rather than a convention.
CREATE UNIQUE INDEX "document_render_issue_sha256_key"
    ON "document_render" ("issue_id", "sha256");
CREATE INDEX "document_render_issue_idx" ON "document_render" ("issue_id");

ALTER TABLE "document_render" ADD CONSTRAINT "document_render_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_render" ADD CONSTRAINT "document_render_issue_id_fkey"
    FOREIGN KEY ("issue_id") REFERENCES "quote_issue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_render" ADD CONSTRAINT "document_render_rendered_by_user_id_fkey"
    FOREIGN KEY ("rendered_by_user_id") REFERENCES "app_user" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The reference that was dangling. This is the line finding J9 is about.
ALTER TABLE "acceptance" ADD CONSTRAINT "acceptance_document_render_id_fkey"
    FOREIGN KEY ("document_render_id") REFERENCES "document_render" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- >>> BEGIN db/policies/003-document-render.sql
-- Tenant isolation for `document_render`, as row-level security.
--
-- Separate from `002-documents-isolation.sql` for a mechanical reason rather than a conceptual one:
-- 002 is embedded verbatim in a migration that is already committed, and Rule 6 forbids editing a
-- committed migration. A new table therefore brings its own policies file, embedded verbatim in the
-- migration that creates it, and `db/test/policy-parity.test.ts` checks this copy against that one.
--
-- `document_render` is **append-only**, expressed the way every other sealed document here expresses
-- it (ADR 0020): a SELECT policy, an INSERT policy, and no UPDATE or DELETE policy at all. With
-- FORCE ROW LEVEL SECURITY a row that no policy permits cannot be updated even by the table owner,
-- so the immutability is enforced rather than requested. Two separate policies rather than one
-- FOR ALL, because a FOR ALL policy would grant UPDATE and DELETE as well — which is finding J16's
-- defect in `rejected_seal`, and it is not repeated here.
ALTER TABLE "document_render" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_render" FORCE ROW LEVEL SECURITY;
CREATE POLICY document_render_read ON "document_render" FOR SELECT
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY document_render_append ON "document_render" FOR INSERT
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- <<< END db/policies/003-document-render.sql
