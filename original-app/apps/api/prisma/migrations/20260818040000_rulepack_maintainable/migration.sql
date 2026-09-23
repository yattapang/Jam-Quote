-- Let a staff admin maintain the rule-pack without a code change.
--
-- The editable slice was rates for statutory contributions the CODE already
-- knew about, plus one source URL. So a new levy, a withdrawn one, a rename,
-- or a changed set of pages to check against all needed a release. A tax
-- authority introducing a charge should not be blocked on a deploy.
--
-- statutoryCustom  — contributions the baseline has never heard of (a custom
--                    entry whose code matches a baseline one replaces it, so a
--                    rename is a rename and not a duplicate row).
-- statutoryRetired — baseline codes to stop showing. A withdrawal is recorded
--                    as a retirement rather than by editing the baseline, so
--                    the code stays documented and the decision is reversible.
-- sources          — the list of pages to check when verifying. Previously a
--                    single sourceUrl, which is kept as the primary link.
ALTER TABLE "RulePackConfig" ADD COLUMN "statutoryCustom" JSONB;
ALTER TABLE "RulePackConfig" ADD COLUMN "statutoryRetired" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "RulePackConfig" ADD COLUMN "sources" TEXT[] DEFAULT ARRAY[]::TEXT[];
