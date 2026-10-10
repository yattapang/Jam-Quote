-- A number series never resets in release 1 (finding B20 of PRD review 5; the owner's decision, ADR 0027
-- D11, 2026-10-02).
--
-- ## THE DEFECT
--
-- `20260925120000_documents_core` let `number_series.reset_rule` be 'yearly' or 'monthly', but kept one
-- series per tenant and document kind (`number_series_tenant_kind_key`) and made `issue_number` unique on
-- (series_id, number) with no period. So a reset was unrepresentable: executed by the reviewer on PGlite,
-- a yearly series numbered 1 in 2026 and then refused 1 in 2027 (duplicate key on
-- `issue_number_series_number_key`), and a second series for 2027 was refused too. A tenant could choose a
-- setting the schema stored and could not honour.
--
-- ## WHAT CHANGES
--
-- The CHECK accepts only 'never'. A tenant who wants the year in a number puts it in the prefix
-- ("INV-2027-"). The column stays, so a later release that adds a period to `issue_number`'s uniqueness
-- can widen the CHECK again rather than add a column. No row can hold another value today: nothing writes
-- a series yet, and the owner confirmed no deployed database holds real data.
--
-- ## WHAT THIS DOES NOT DO (Rule 21.4)
--
-- It does not build allocation, and so proves nothing about gaplessness (PRD R1.14 names that test as
-- owed with the allocation code).
ALTER TABLE "number_series" DROP CONSTRAINT "number_series_reset_rule_check";
ALTER TABLE "number_series" ADD CONSTRAINT "number_series_reset_rule_check"
    CHECK ("reset_rule" = 'never');
