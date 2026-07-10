import { describe, expect, it } from "vitest";
import {
  applyPct,
  CURRENCIES,
  formatJmd,
  formatMoney,
  getCurrency,
  jmdToUsdReference,
  lineExtension,
  roundCents,
} from "./money.js";

describe("roundCents", () => {
  it("rounds half-up at the cent", () => {
    expect(roundCents(1.4)).toBe(1);
    expect(roundCents(1.5)).toBe(2);
    expect(roundCents(2.5)).toBe(3);
    expect(roundCents(0.5)).toBe(1);
  });

  it("rounds negatives away from zero and normalises -0", () => {
    expect(roundCents(-1.5)).toBe(-2);
    expect(roundCents(-1.4)).toBe(-1);
    expect(Object.is(roundCents(-0.2), 0)).toBe(true); // never -0
  });
});

describe("lineExtension", () => {
  it("multiplies a decimal quantity by a unit price, rounded", () => {
    expect(lineExtension(10, 120_000)).toBe(1_200_000);
    expect(lineExtension(2.5, 100)).toBe(250);
  });

  it("rounds fractional results half-up", () => {
    // 0.333 * 100000 = 33300 exactly
    expect(lineExtension(0.333, 100_000)).toBe(33_300);
    // 3 * 33 = 99
    expect(lineExtension(3, 33)).toBe(99);
  });
});

describe("applyPct", () => {
  it("applies a percentage to a cents amount", () => {
    expect(applyPct(100_000, 15)).toBe(15_000);
    expect(applyPct(1_000, 10)).toBe(100);
    expect(applyPct(1_000, 0)).toBe(0);
  });
});

describe("formatJmd", () => {
  it("formats cents as grouped JMD with two decimals", () => {
    expect(formatJmd(125_000_000)).toBe("$1,250,000.00");
    expect(formatJmd(100)).toBe("$1.00");
    expect(formatJmd(1_234)).toBe("$12.34");
    expect(formatJmd(0)).toBe("$0.00");
  });

  it("handles negatives and the no-symbol option", () => {
    expect(formatJmd(-5_000)).toBe("-$50.00");
    expect(formatJmd(1_234, false)).toBe("12.34");
  });
});

describe("formatMoney", () => {
  it("formats with the currency's own symbol", () => {
    expect(formatMoney(125_000_000, CURRENCIES.JMD)).toBe("$1,250,000.00");
    expect(formatMoney(125_000_000, CURRENCIES.TTD)).toBe("TT$1,250,000.00");
    expect(formatMoney(5_000, CURRENCIES.BBD)).toBe("Bds$50.00");
  });

  it("honours the no-symbol option and negatives", () => {
    expect(formatMoney(1_234, CURRENCIES.TTD, false)).toBe("12.34");
    expect(formatMoney(-5_000, CURRENCIES.JMD)).toBe("-$50.00");
  });

  it("formatJmd stays identical to the JMD path", () => {
    expect(formatJmd(1_234)).toBe(formatMoney(1_234, CURRENCIES.JMD));
  });
});

describe("getCurrency", () => {
  it("resolves a known ISO code", () => {
    expect(getCurrency("JMD").symbol).toBe("$");
    expect(getCurrency("TTD").code).toBe("TTD");
  });

  it("throws on an unknown code", () => {
    expect(() => getCurrency("ZZZ")).toThrow();
  });
});

describe("jmdToUsdReference", () => {
  it("converts at the given rate for display only", () => {
    expect(jmdToUsdReference(15_600_000, 156)).toBe("US$1,000.00");
  });

  it("returns empty string for a non-positive rate", () => {
    expect(jmdToUsdReference(100_000, 0)).toBe("");
    expect(jmdToUsdReference(100_000, -3)).toBe("");
  });
});
