import { describe, expect, it } from "vitest";
import { startOfJamaicaMonth } from "./month.util.js";

/**
 * The month boundary a contractor's free allowance resets on.
 *
 * ## The defect this locks down
 *
 * The old implementation was `new Date(now.getFullYear(), now.getMonth(), 1)` —
 * local accessors and a local-time constructor — annotated "deliberately simple (no
 * timezone handling)... an hour either side of a boundary is harmless".
 *
 * On a UTC production host the boundary lands at 00:00Z, which is 7pm Jamaica on the
 * LAST EVENING of the month. Between 7pm and midnight on the 31st the counter had
 * already reset and the contractor got a fresh five quotes five hours early. The free
 * allowance is the product's only conversion lever, so that is not rounding.
 *
 * ## Why the assertions are on the instant, not on a formatted date
 *
 * `toISOString()` is the same string everywhere. A test written with
 * `getMonth()`/`getDate()` would assert the host's opinion of the instant and pass on
 * any host — which is precisely the bug class. The vitest config pins
 * `TZ=America/Jamaica`, but these assertions hold without that pin, which is the
 * point: a guard against a timezone bug must not itself depend on the timezone.
 */

describe("startOfJamaicaMonth", () => {
  it("is 05:00Z on the 1st, because Jamaica midnight is UTC-5", () => {
    expect(startOfJamaicaMonth(new Date("2026-06-15T12:00:00Z")).toISOString()).toBe(
      "2026-06-01T05:00:00.000Z",
    );
  });

  it("still says the old month at 7pm Jamaica on the last evening", () => {
    // 2026-04-01T00:00Z is 2026-03-31 19:00 in Jamaica. The old local-accessor
    // version returned April here, and reset the allowance five hours early.
    expect(startOfJamaicaMonth(new Date("2026-04-01T00:00:00Z")).toISOString()).toBe(
      "2026-03-01T05:00:00.000Z",
    );
    // And at 11pm Jamaica, one minute before the real rollover.
    expect(startOfJamaicaMonth(new Date("2026-04-01T04:59:00Z")).toISOString()).toBe(
      "2026-03-01T05:00:00.000Z",
    );
  });

  it("rolls over at 05:00Z exactly, and not before", () => {
    expect(startOfJamaicaMonth(new Date("2026-04-01T04:59:59.999Z")).toISOString()).toBe(
      "2026-03-01T05:00:00.000Z",
    );
    expect(startOfJamaicaMonth(new Date("2026-04-01T05:00:00Z")).toISOString()).toBe(
      "2026-04-01T05:00:00.000Z",
    );
  });

  it("crosses a year boundary without changing the year early", () => {
    // 2027-01-01T02:00Z is 2026-12-31 21:00 Jamaica — still December, still 2026.
    expect(startOfJamaicaMonth(new Date("2027-01-01T02:00:00Z")).toISOString()).toBe(
      "2026-12-01T05:00:00.000Z",
    );
    expect(startOfJamaicaMonth(new Date("2027-01-01T05:00:00Z")).toISOString()).toBe(
      "2027-01-01T05:00:00.000Z",
    );
  });

  it("handles a short month and a leap February", () => {
    expect(startOfJamaicaMonth(new Date("2028-02-29T18:00:00Z")).toISOString()).toBe(
      "2028-02-01T05:00:00.000Z",
    );
    // 1 March 2028 at 00:00Z is 29 February 21:00 Jamaica.
    expect(startOfJamaicaMonth(new Date("2028-03-01T00:00:00Z")).toISOString()).toBe(
      "2028-02-01T05:00:00.000Z",
    );
  });

  it("returns an instant at or before the moment asked about", () => {
    // A start-of-month later than `now` would make `createdAt: { gte: start }`
    // exclude everything and report zero quotes used, handing out an unlimited
    // allowance. Swept across a year at 37-minute steps to catch a sign error in
    // the offset, which would put the boundary in the future for part of each day.
    const from = Date.UTC(2026, 0, 1);
    const step = 37 * 60 * 1000;
    for (let t = from; t < from + 366 * 24 * 60 * 60 * 1000; t += step) {
      const now = new Date(t);
      const start = startOfJamaicaMonth(now);
      expect(start.getTime(), now.toISOString()).toBeLessThanOrEqual(now.getTime());
      // And never more than 31 days before it.
      expect(now.getTime() - start.getTime(), now.toISOString()).toBeLessThan(
        32 * 24 * 60 * 60 * 1000,
      );
    }
  });

  it("defaults to now, which is what both callers rely on", () => {
    // `admin.service.ts` calls it with no argument.
    const start = startOfJamaicaMonth();
    expect(start.getTime()).toBeLessThanOrEqual(Date.now());
    expect(start.toISOString()).toMatch(/-01T05:00:00\.000Z$/);
  });
});
