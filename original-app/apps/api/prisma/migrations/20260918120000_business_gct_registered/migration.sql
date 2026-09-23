-- Owner decision: whether a business is registered with TAJ to charge GCT is an
-- explicit yes/no, not something inferred from the TRN. Every Jamaican has a
-- TRN, so a sole trader who entered a personal one was treated as registered —
-- input tax netted off and their job margin overstated.
--
-- New businesses default to NOT registered (the column default).
--
-- Backfill: an EXISTING business is marked registered exactly when it has a
-- non-blank TRN. That is the rule the app applied until now
-- (Boolean(business.trn?.trim()) in purchases.service), so on deploy no
-- tenant's profit figures change silently. Contractors who are not actually
-- registered correct it themselves in Settings, where the question is now asked.
ALTER TABLE "Business" ADD COLUMN "gctRegistered" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Business"
SET "gctRegistered" = true
WHERE "trn" IS NOT NULL AND trim("trn") <> '';
