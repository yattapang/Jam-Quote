import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isIsoDate } from "./date.js";

const zodDate = z.string().date();

describe("isIsoDate", () => {
  it("accepts a real calendar date", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // leap year
  });

  it("refuses a date that matches the shape but not the calendar", () => {
    // The exact gap: the DTO uses z.string().date() (calendar-checked), while the
    // web client used to check with /^\d{4}-\d{2}-\d{2}$/, which "2026-02-31"
    // passes despite February never having 31 days.
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2023-02-29")).toBe(false); // not a leap year
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-00-10")).toBe(false);
  });

  it("refuses anything not shaped like YYYY-MM-DD", () => {
    for (const value of ["", "2026-2-3", "2026/02/03", "not a date", "2026-02-03T00:00:00Z"]) {
      expect(isIsoDate(value), value).toBe(false);
    }
  });

  /**
   * `isIsoDate` and `z.string().date()` are two independent implementations of
   * "is this a real calendar date", spent by the same field (`verifiedAsOf`).
   * If they ever disagree, one of them accepts what the other rejects and the
   * DTO's field-level message and the client's pre-flight check contradict each
   * other. The regression this guards: `Date.UTC(year, ...)` special-cases any
   * two-digit-or-fewer `year` (0-99) onto 1900-1999 per the JS spec, which
   * `z.string().date()` does not do — so the OLD `isIsoDate`, built on
   * `Date.UTC`, silently disagreed with Zod on every year below 100.
   */
  it("agrees with z.string().date() on a table of edge cases", () => {
    const cases = [
      "0000-01-01",
      "0000-02-29",
      "0099-12-31",
      "2024-02-29",
      "2023-02-29",
      "2026-02-31",
      "2026-1-1",
      "2026-01-01T00:00",
      " 2026-01-01",
      "+002026-01-01",
      "9999-12-31",
    ];
    for (const value of cases) {
      const zodResult = zodDate.safeParse(value).success;
      expect(isIsoDate(value), value).toBe(zodResult);
    }
  });
});
