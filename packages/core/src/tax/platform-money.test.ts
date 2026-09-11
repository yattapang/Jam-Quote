import { describe, expect, it } from "vitest";
import { CURRENCIES, CURRENCY_CODES, formatPlatformMoney, getCurrency } from "./money.js";

/**
 * Rendering an amount in whatever currency the platform is actually configured for.
 *
 * ## The defect
 *
 * The staff console rendered all seven of its money figures through `formatJmd`,
 * while the platform currency was an eight-character free-text field on the pricing
 * form with no ISO check. Setting it to USD produced a JMD symbol beside the letters
 * "USD" on the Financials tile — and "usd", "banana" or an empty string were all
 * accepted by the server.
 *
 * The one-helper rule was being followed. The helper simply was not parameterised.
 */

describe("formatPlatformMoney", () => {
  it("spends the symbol of the currency it was given", () => {
    expect(formatPlatformMoney(125_000_00, "JMD")).toBe("$125,000.00");
    expect(formatPlatformMoney(125_000_00, "USD")).toBe("US$125,000.00");
    expect(formatPlatformMoney(125_000_00, "TTD")).toBe("TT$125,000.00");
  });

  it("names an unknown code instead of asserting a symbol", () => {
    // The honest degradation: a screen renders whatever the database holds, and a
    // confident "$" on a currency nobody recognises is the defect, not the fix.
    expect(formatPlatformMoney(1_000_00, "XYZ")).toBe("1,000.00 XYZ");
    expect(formatPlatformMoney(1_000_00, "usd")).toBe("1,000.00 usd");
  });

  it("falls back to a bare amount when there is no code at all", () => {
    // Pricing failed to load, or financials came back null. Better an unlabelled
    // number than a wrong label.
    expect(formatPlatformMoney(1_000_00, null)).toBe("1,000.00");
    expect(formatPlatformMoney(1_000_00, undefined)).toBe("1,000.00");
    expect(formatPlatformMoney(1_000_00, "")).toBe("1,000.00");
  });

  it("keeps the sign, so a negative figure is not silently positive", () => {
    expect(formatPlatformMoney(-5_00, "JMD")).toBe("-$5.00");
    expect(formatPlatformMoney(-5_00, "XYZ")).toBe("-5.00 XYZ");
  });

  it("agrees with formatJmd for JMD, so nothing changed for the default", () => {
    // Every screen in the app was rendering JMD through the old helper. If this
    // disagreed by a character, the fix would be a regression everywhere.
    for (const cents of [0, 1, 99, 100, 1_234_56, -7_89]) {
      expect(formatPlatformMoney(cents, "JMD")).toBe(
        (cents < 0 ? "-$" : "$") + Math.abs(cents / 100).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
      );
    }
  });
});

describe("CURRENCY_CODES", () => {
  it("is exactly the currencies the platform knows, with nothing typed twice", () => {
    // The pricing DTO is `z.enum(CURRENCY_CODES)`, and the console's dropdown maps
    // the same array. Derived from CURRENCIES rather than written out again, so a
    // new currency is added in one place — this asserts the derivation holds.
    expect([...CURRENCY_CODES].sort()).toEqual(Object.keys(CURRENCIES).sort());
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
  });

  it("every code it offers actually resolves", () => {
    // An entry here that `getCurrency` throws on would be a dropdown option that
    // the server accepts and every screen then fails to render.
    for (const code of CURRENCY_CODES) {
      expect(() => getCurrency(code), code).not.toThrow();
      expect(formatPlatformMoney(100, code), code).not.toContain(code);
    }
  });

  it("includes JMD, because that is what the platform bills in", () => {
    expect(CURRENCY_CODES).toContain("JMD");
  });
});
