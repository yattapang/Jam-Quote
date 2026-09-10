import { JAMAICA_UTC_OFFSET_MS } from "@jamquote/core";

/**
 * Start of the current calendar month in JAMAICA time, as a real instant.
 *
 * ## Why not the server's clock
 *
 * This used to be `new Date(now.getFullYear(), now.getMonth(), 1)` — local
 * accessors and a local-time constructor — described as "deliberately simple (no
 * timezone handling)… an hour either side of a boundary is harmless".
 *
 * It is not harmless, for the same reason the identical arithmetic in `nextTermEnd`
 * was a bug rather than a preference. On a UTC production host the boundary lands at
 * 00:00Z, which is 7pm Jamaica on the LAST EVENING of the month — so between 7pm and
 * midnight on the 31st a contractor's free-quote counter had already reset and they
 * got a fresh allowance five hours early. The allowance is the product's only
 * conversion lever, so five hours a month of free quotes is not rounding.
 *
 * The admin console already had this right, privately, with a comment explaining that
 * a figure labelled "this month" must not mean two different months in two places.
 * It was the only copy; now there is one definition and both callers use it.
 */
export function startOfJamaicaMonth(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + JAMAICA_UTC_OFFSET_MS);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - JAMAICA_UTC_OFFSET_MS,
  );
}
