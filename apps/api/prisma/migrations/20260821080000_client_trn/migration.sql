-- The client's own tax number, for the accountant's customer listing.
-- Nullable: most of a jobbing contractor's customers are households with no
-- TRN to give, and requiring one would make the client form unusable.
ALTER TABLE "Client" ADD COLUMN "trn" TEXT;
