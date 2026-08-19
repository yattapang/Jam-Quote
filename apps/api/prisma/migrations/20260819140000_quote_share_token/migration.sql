-- A public, unguessable link to one quote.
--
-- WhatsApp delivery already existed and already sent a link — to
-- /quotes/<id>, which sits behind the auth middleware. The client is not
-- logged in, so they reached a login wall rather than the quote, and the
-- contractor had no way to know. The same silent non-delivery the email path
-- had, on the channel most Jamaican contractors actually use.
--
-- The token is NOT the quote id. Ids are sequential-ish and appear in staff
-- URLs; a share link is handed to an outside party over an unencrypted-ish
-- channel and must be independently random, revocable, and useless for
-- guessing any other quote.
--
-- Nullable: generated only when a quote is actually shared, so a quote that
-- was never sent has no public surface at all.
ALTER TABLE "Quote" ADD COLUMN "shareToken" TEXT;
ALTER TABLE "Quote" ADD COLUMN "sharedAt" TIMESTAMP(3);
-- First time the client opened it. Drives QuoteStatus VIEWED, which until now
-- nothing in the app could ever set.
ALTER TABLE "Quote" ADD COLUMN "firstViewedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Quote_shareToken_key" ON "Quote"("shareToken");
