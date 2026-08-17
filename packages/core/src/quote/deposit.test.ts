import { describe, expect, it } from "vitest";
import { DepositMode, depositCentsFrom } from "./deposit.js";

const TOTAL = 100_000; // $1,000.00

describe("depositCentsFrom — flat amount", () => {
  it("converts dollars to cents", () => {
    expect(depositCentsFrom(DepositMode.AMOUNT, "250.50", TOTAL)).toBe(25_050);
  });

  it("treats a blank or unparseable field as no deposit", () => {
    expect(depositCentsFrom(DepositMode.AMOUNT, "", TOTAL)).toBe(0);
    expect(depositCentsFrom(DepositMode.AMOUNT, "abc", TOTAL)).toBe(0);
  });

  it("tolerates padding", () => {
    expect(depositCentsFrom(DepositMode.AMOUNT, "  100 ", TOTAL)).toBe(10_000);
  });
});

describe("depositCentsFrom — percentage", () => {
  it("takes the percentage of the total", () => {
    expect(depositCentsFrom(DepositMode.PERCENT, "50", TOTAL)).toBe(50_000);
  });

  it("rounds to a whole cent rather than leaving a fraction", () => {
    // 33% of $1,000.01 is 33000.33 cents — not a payable figure.
    expect(depositCentsFrom(DepositMode.PERCENT, "33", 100_001)).toBe(33_000);
  });

  it("accepts a fractional percentage", () => {
    expect(depositCentsFrom(DepositMode.PERCENT, "12.5", TOTAL)).toBe(12_500);
  });

  it("caps at 100% — a 150% deposit is a typo, not a request", () => {
    expect(depositCentsFrom(DepositMode.PERCENT, "150", TOTAL)).toBe(TOTAL);
  });
});

describe("depositCentsFrom — guards the document's coherence", () => {
  it("never exceeds the total, so balance due cannot go negative", () => {
    // A negative balance due reads as the contractor owing their client.
    expect(depositCentsFrom(DepositMode.AMOUNT, "5000", TOTAL)).toBe(TOTAL);
  });

  it("never returns a negative deposit", () => {
    expect(depositCentsFrom(DepositMode.AMOUNT, "-100", TOTAL)).toBe(0);
    expect(depositCentsFrom(DepositMode.PERCENT, "-10", TOTAL)).toBe(0);
  });

  it("is zero on an empty quote, in either mode", () => {
    // Asking for 50% of nothing must not produce a deposit to collect.
    expect(depositCentsFrom(DepositMode.PERCENT, "50", 0)).toBe(0);
    expect(depositCentsFrom(DepositMode.AMOUNT, "50", 0)).toBe(0);
  });
});
