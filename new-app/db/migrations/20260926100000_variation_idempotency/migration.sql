-- Gives `variation` the idempotency key its own comment already claimed it had.
--
-- ## WHY A SECOND MIGRATION RATHER THAN AN EDIT
--
-- Rule 6: a committed migration is never modified, only added to. No database has applied
-- `20260925120000_documents_core` yet, so editing it would be harmless *today* — and that is exactly
-- the reasoning that makes the rule worth keeping, because the day it is not harmless looks identical
-- from here. The cost of obeying it is eleven lines.
--
-- ## WHAT WENT WRONG, BECAUSE IT IS THE SAME DEFECT AS M14
--
-- The previous migration's comment on `variation` said, in the present tense:
--
--     `client_reference` is the idempotency key, and it exists because a variation can be recorded
--     OFFLINE and replayed from an outbox (finding H11).
--
-- **The column did not exist.** A comment crediting a mechanism that is not there is the M14 class
-- exactly — a claim that reads as evidence — and it was committed in the same batch that built
-- `tools/check_citations.py` to catch that class. The checker missed it because it looks for cited
-- filenames and for "`symbol` in file.ts", and this was a snake_case identifier in a SQL comment. The
-- checker is extended in the same commit as this migration, and it now fails on exactly this.
--
-- ## WHAT THE KEY IS FOR
--
-- A variation can be recorded with no signal and pushed from an outbox later. Without a key, a
-- retried queue entry inserts a second row — and because `variation` is append-only and its amount
-- feeds the invoiceable ceiling, the duplicate raises how much may be billed **permanently**, and the
-- nightly reconciliation job then certifies the inflated figure as correct. That is the worst shape a
-- defect can take here: self-ratifying.
--
-- The key is supplied by the device, not the server, because the server cannot tell a retry from a
-- genuine second variation of the same amount on the same day — only the client knows it is the same
-- act. Same reasoning as the client-generated row ids (ADR 0019).
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- It does not make the offline variation path safe by itself: the application must send the same key
-- on every retry, and nothing in the database can check that it does. What the database guarantees is
-- that the same key cannot produce two rows.

ALTER TABLE "variation" ADD COLUMN "client_reference" TEXT;

-- Per issue, not global: two different jobs may legitimately carry the same reference from the same
-- device, and scoping it to the issue is the narrowest thing that stops the duplicate that matters.
--
-- Partial, because the column is nullable: a variation recorded while online has no outbox entry and
-- needs no key, and requiring one would be ceremony for a path that cannot double-submit.
CREATE UNIQUE INDEX "variation_issue_client_reference_key"
    ON "variation" ("issue_id", "client_reference")
    WHERE "client_reference" IS NOT NULL;
