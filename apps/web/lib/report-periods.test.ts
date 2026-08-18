import { describe, expect, it } from "vitest";
import { customRange, isReportPeriod, periodRange } from "./report-periods";

/** Jamaica is UTC-5, so local midnight is 05:00Z the same day. */
const JA_MIDNIGHT = "T05:00:00.000Z";

describe("periodRange — this week", () => {
  it("runs Monday to the following Monday", () => {
    // Thursday 20 Aug 2026, mid-afternoon Jamaica time.
    const range = periodRange("week", new Date("2026-08-20T19:00:00.000Z"));
    expect(range.from).toBe(`2026-08-17${JA_MIDNIGHT}`); // Mon
    expect(range.to).toBe(`2026-08-24${JA_MIDNIGHT}`); // exclusive
  });

  it("treats Sunday as the END of the week, not the start", () => {
    // Sunday 23 Aug: a Sunday-start week would push this into the NEXT window
    // and report the contractor's Sunday work separately from their week.
    const range = periodRange("week", new Date("2026-08-23T19:00:00.000Z"));
    expect(range.from).toBe(`2026-08-17${JA_MIDNIGHT}`);
  });

  it("keeps Monday itself inside its own week", () => {
    const range = periodRange("week", new Date("2026-08-17T19:00:00.000Z"));
    expect(range.from).toBe(`2026-08-17${JA_MIDNIGHT}`);
  });

  it("crosses a month boundary without breaking", () => {
    // Tuesday 1 Sep 2026 — that week starts on 31 Aug.
    const range = periodRange("week", new Date("2026-09-01T19:00:00.000Z"));
    expect(range.from).toBe(`2026-08-31${JA_MIDNIGHT}`);
  });

  it("uses the Jamaica day, not the UTC one", () => {
    // 01:00Z Monday is still 8pm SUNDAY in Jamaica, so it belongs to the week
    // that began the previous Monday.
    const range = periodRange("week", new Date("2026-08-24T01:00:00.000Z"));
    expect(range.from).toBe(`2026-08-17${JA_MIDNIGHT}`);
  });

  it("is a recognised period", () => {
    expect(isReportPeriod("week")).toBe(true);
  });
});

describe("customRange", () => {
  it("includes the whole of the end day", () => {
    // "1 Jul to 31 Jul" means July. Taking `to` literally would cut the range
    // at midnight on the 31st and drop that day's invoices entirely.
    const range = customRange("2026-07-01", "2026-07-31");
    expect(range).toEqual({ from: `2026-07-01${JA_MIDNIGHT}`, to: `2026-08-01${JA_MIDNIGHT}` });
  });

  it("handles a single day", () => {
    const range = customRange("2026-07-15", "2026-07-15");
    expect(range).toEqual({ from: `2026-07-15${JA_MIDNIGHT}`, to: `2026-07-16${JA_MIDNIGHT}` });
  });

  it("rolls the end past a month boundary", () => {
    expect(customRange("2026-01-01", "2026-01-31")?.to).toBe(`2026-02-01${JA_MIDNIGHT}`);
  });

  it("rolls the end past a year boundary", () => {
    expect(customRange("2026-12-01", "2026-12-31")?.to).toBe(`2027-01-01${JA_MIDNIGHT}`);
  });

  it("rejects a backwards range rather than showing an empty report", () => {
    expect(customRange("2026-07-31", "2026-07-01")).toBeNull();
  });

  it("rejects missing or malformed dates", () => {
    expect(customRange(undefined, "2026-07-01")).toBeNull();
    expect(customRange("2026-07-01", undefined)).toBeNull();
    expect(customRange("07/01/2026", "2026-07-31")).toBeNull();
    expect(customRange("", "")).toBeNull();
  });
});
