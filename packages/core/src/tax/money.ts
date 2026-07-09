/**
 * Money is stored and computed as integer JMD cents to avoid float drift.
 * All rounding is half-up at the cent. Never do money math with plain floats
 * in app code — route it through here.
 */

export type Cents = number; // integer

/** Half-up rounding to the nearest integer cent. */
export function roundCents(value: number): Cents {
  // Guard against -0 and floating error near .5
  const r = Math.floor(Math.abs(value) + 0.5) * Math.sign(value);
  return Object.is(r, -0) ? 0 : r;
}

/** quantity (decimal) * unitPriceCents -> cents, rounded half-up. */
export function lineExtension(quantity: number, unitPriceCents: Cents): Cents {
  return roundCents(quantity * unitPriceCents);
}

/** Apply a percentage (e.g. markup or discount) to a cents amount. */
export function applyPct(amount: Cents, pct: number): Cents {
  return roundCents(amount * (pct / 100));
}

/** Format JMD for display. cents -> "$1,250,000.00". */
export function formatJmd(cents: Cents, withSymbol = true): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = dollars.toLocaleString("en-JM");
  const body = `${grouped}.${rem.toString().padStart(2, "0")}`;
  return `${sign}${withSymbol ? "$" : ""}${body}`;
}

/** Optional USD reference display for diaspora clients. Never used for billing. */
export function jmdToUsdReference(cents: Cents, jmdPerUsd: number): string {
  if (jmdPerUsd <= 0) return "";
  const usd = cents / 100 / jmdPerUsd;
  return `US$${usd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
