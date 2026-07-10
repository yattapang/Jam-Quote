import { describe, expect, it } from "vitest";
import {
  applyPct,
  formatJmd,
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

describe("jmdToUsdReference", () => {
  it("converts at the given rate for display only", () => {
    expect(jmdToUsdReference(15_600_000, 156)).toBe("US$1,000.00");
  });

  it("returns empty string for a non-positive rate", () => {
    expect(jmdToUsdReference(100_000, 0)).toBe("");
    expect(jmdToUsdReference(100_000, -3)).toBe("");
  });
});
