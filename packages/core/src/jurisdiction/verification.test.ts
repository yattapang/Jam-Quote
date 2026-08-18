import { describe, expect, it } from "vitest";
import {
  RULE_PACK_AGING_DAYS,
  RULE_PACK_STALE_DAYS,
  rulePackVerification,
} from "./verification.js";

const NOW = new Date("2026-08-18T15:00:00.000Z");
const daysBefore = (n: number) =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("rulePackVerification", () => {
  it("reports never verified when no date is stored", () => {
    expect(rulePackVerification(null, NOW)).toEqual({
      freshness: "never",
      ageDays: null,
      label: "Never verified",
    });
  });

  it("treats an unparseable date as never verified rather than crashing", () => {
    expect(rulePackVerification("not-a-date", NOW).freshness).toBe("never");
  });

  it("is fresh just before the aging threshold", () => {
    const v = rulePackVerification(daysBefore(RULE_PACK_AGING_DAYS - 1), NOW);
    expect(v.freshness).toBe("fresh");
  });

  it("ages exactly on the threshold", () => {
    expect(rulePackVerification(daysBefore(RULE_PACK_AGING_DAYS), NOW).freshness).toBe("aging");
  });

  it("goes stale at a year, when rates have had a budget cycle to move", () => {
    expect(rulePackVerification(daysBefore(RULE_PACK_STALE_DAYS), NOW).freshness).toBe("stale");
  });

  it("counts whole days from the stored date", () => {
    expect(rulePackVerification(daysBefore(30), NOW).ageDays).toBe(30);
  });

  it("treats a future date as today — it is a typo, not negative age", () => {
    // "Verified in -30 days" helps nobody.
    const future = new Date(NOW.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
    const v = rulePackVerification(future, NOW);
    expect(v.ageDays).toBe(0);
    expect(v.freshness).toBe("fresh");
  });
});

describe("rulePackVerification — the label a human reads", () => {
  it("says today and yesterday rather than 0 and 1 days", () => {
    expect(rulePackVerification(daysBefore(0), NOW).label).toBe("Verified today");
    expect(rulePackVerification(daysBefore(1), NOW).label).toBe("Verified yesterday");
  });

  it("counts in days below a month", () => {
    expect(rulePackVerification(daysBefore(12), NOW).label).toBe("Verified 12 days ago");
  });

  it("switches to months, singular where it should be", () => {
    expect(rulePackVerification(daysBefore(31), NOW).label).toBe("Verified 1 month ago");
    expect(rulePackVerification(daysBefore(200), NOW).label).toContain("months ago");
  });

  it("switches to years past two", () => {
    expect(rulePackVerification(daysBefore(800), NOW).label).toBe("Verified 2 years ago");
  });
});
