/**
 * Money is stored and computed as integer minor units (cents) to avoid float
 * drift. All rounding is half-up at the cent. Never do money math with plain
 * floats in app code — route it through here.
 *
 * The system currency is per-business (JMD today; TTD/BBD/XCD/… as JamQuote
 * expands across the Caribbean). Amounts are currency-agnostic integers;
 * only *display* is currency-aware, via `formatMoney`. The currency for a
 * business comes from its jurisdiction rule-pack (see jurisdiction.ts).
 */

export type Cents = number; // integer minor units

export interface Currency {
  /** ISO 4217 code, e.g. "JMD". */
  code: string;
  /** Display symbol, e.g. "$" for JMD, "TT$" for TTD. */
  symbol: string;
  /** Decimal places (minor units). Every Caribbean currency here uses 2. */
  minorUnits: number;
}

/** Known currencies. Extend as jurisdictions are added. */
export const CURRENCIES = {
  JMD: { code: "JMD", symbol: "$", minorUnits: 2 },
  USD: { code: "USD", symbol: "US$", minorUnits: 2 },
  TTD: { code: "TTD", symbol: "TT$", minorUnits: 2 },
  BBD: { code: "BBD", symbol: "Bds$", minorUnits: 2 },
  GYD: { code: "GYD", symbol: "G$", minorUnits: 2 },
  XCD: { code: "XCD", symbol: "EC$", minorUnits: 2 },
} as const satisfies Record<string, Currency>;
export type CurrencyCode = keyof typeof CURRENCIES;

/**
 * The currency codes the platform will accept, as a runtime array.
 *
 * Exists so the pricing DTO can be `z.enum(CURRENCY_CODES)` instead of
 * `z.string().max(8)`. The admin pricing form accepted any eight characters, and
 * money on the staff console renders through a currency descriptor — so setting the
 * platform currency to "USD" (or to "usd", or to "banana") left every figure
 * carrying a JMD symbol beside the letters that said otherwise.
 *
 * Derived from CURRENCIES rather than typed out again, so a new currency is added in
 * one place.
 */
export const CURRENCY_CODES = Object.keys(CURRENCIES) as [CurrencyCode, ...CurrencyCode[]];

/**
 * A currency descriptor for a code that may not be valid.
 *
 * `getCurrency` throws, which is right for code that has already validated. A screen
 * rendering whatever the database holds needs to degrade instead: an unknown code
 * shows the amount with the code beside it and no symbol, which is honest, rather
 * than a confident symbol for the wrong currency.
 */
export function formatPlatformMoney(cents: Cents, code: string | null | undefined): string {
  // `Object.hasOwn` before the read: a legacy free-text value of "valueOf" or
  // "toString" is a truthy inherited Function, and would have been formatted as
  // though it were a currency descriptor. Both fit the old eight-character limit.
  const currency =
    code && Object.hasOwn(CURRENCIES, code)
      ? (CURRENCIES as Record<string, Currency>)[code]
      : undefined;
  if (!currency) {
    const body = formatMoney(cents, CURRENCIES.JMD, false);
    return code ? `${body} ${code}` : body;
  }
  return formatMoney(cents, currency);
}

/** Resolve a currency descriptor by ISO code; throws on an unknown code. */
export function getCurrency(code: string): Currency {
  const c = (CURRENCIES as Record<string, Currency>)[code];
  if (!c) throw new Error(`Unknown currency code '${code}'`);
  return c;
}

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

/**
 * Format an integer amount for display in the given currency.
 * e.g. formatMoney(125_000_000, CURRENCIES.JMD) -> "$1,250,000.00".
 */
export function formatMoney(
  amount: Cents,
  currency: Currency,
  withSymbol = true,
): string {
  const sign = amount < 0 ? "-" : "";
  const factor = 10 ** currency.minorUnits;
  const abs = Math.abs(amount);
  const major = Math.floor(abs / factor);
  const minor = abs % factor;
  const grouped = major.toLocaleString("en-US");
  const body =
    currency.minorUnits > 0
      ? `${grouped}.${minor.toString().padStart(currency.minorUnits, "0")}`
      : grouped;
  return `${sign}${withSymbol ? currency.symbol : ""}${body}`;
}

/** Format JMD for display. cents -> "$1,250,000.00". Thin wrapper over formatMoney. */
export function formatJmd(cents: Cents, withSymbol = true): string {
  return formatMoney(cents, CURRENCIES.JMD, withSymbol);
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
