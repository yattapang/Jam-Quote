import { describe, expect, it } from "vitest";
import {
  DUE_SOON_DAYS,
  NoticeKind,
  SubscriptionStanding,
  dueNotices,
  nextTermEnd,
  shouldRevertToFree,
  subscriptionStanding,
} from "./subscription.js";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const pro = (renewsAt: string | null, interval = "monthly") => ({
  plan: "pro",
  interval,
  renewsAt,
});

describe("subscriptionStanding", () => {
  it("is FREE for a free plan whatever the dates say", () => {
    expect(subscriptionStanding({ plan: "free", interval: "monthly", renewsAt: inDays(-99) }, NOW))
      .toBe(SubscriptionStanding.FREE);
  });

  it("is CURRENT well before the cutoff", () => {
    expect(subscriptionStanding(pro(inDays(45)), NOW)).toBe(SubscriptionStanding.CURRENT);
  });

  it("turns DUE_SOON exactly at the reminder window", () => {
    // The badge and the first email must not disagree about when "soon" is.
    expect(subscriptionStanding(pro(inDays(DUE_SOON_DAYS)), NOW)).toBe(SubscriptionStanding.DUE_SOON);
    expect(subscriptionStanding(pro(inDays(DUE_SOON_DAYS + 1)), NOW)).toBe(SubscriptionStanding.CURRENT);
  });

  it("is PAST_DUE once the cutoff has gone by", () => {
    expect(subscriptionStanding(pro(inDays(-1)), NOW)).toBe(SubscriptionStanding.PAST_DUE);
  });

  it("treats a paid plan with NO renewal date as current, not overdue", () => {
    // That is the manual-upgrade path: staff set a plan without a term. Reading
    // it as overdue would chase someone who was never billed.
    expect(subscriptionStanding(pro(null), NOW)).toBe(SubscriptionStanding.CURRENT);
  });
});

describe("nextTermEnd", () => {
  it("advances a month from today for a lapsed term", () => {
    // Already a month past due: they should not be billed for the month they
    // spent lapsed.
    const end = nextTermEnd("monthly", inDays(-30), NOW);
    expect(end.toISOString().slice(0, 10)).toBe("2026-09-18");
  });

  it("adds to the EXISTING end when paying early, so no days are lost", () => {
    const end = nextTermEnd("monthly", inDays(10), NOW);
    expect(end.toISOString().slice(0, 10)).toBe("2026-09-28");
  });

  it("advances a year on an annual term", () => {
    expect(nextTermEnd("annual", null, NOW).toISOString().slice(0, 10)).toBe("2027-08-18");
  });

  it("keeps the day of month rather than adding 30 days", () => {
    const feb = new Date("2026-01-31T12:00:00.000Z");
    // Calendar arithmetic, so this lands in the right month rather than
    // drifting a day every renewal.
    expect(nextTermEnd("monthly", null, feb).getUTCMonth()).not.toBe(0);
  });

  it("starts from today when there is no current term", () => {
    expect(nextTermEnd("monthly", null, NOW).toISOString().slice(0, 10)).toBe("2026-09-18");
  });
});

describe("dueNotices", () => {
  const none = new Set<string>();

  it("says nothing for a free plan", () => {
    expect(dueNotices({ plan: "free", interval: "monthly", renewsAt: inDays(1) }, none, NOW)).toEqual([]);
  });

  it("says nothing when the cutoff is far off", () => {
    expect(dueNotices(pro(inDays(60)), none, NOW)).toEqual([]);
  });

  it("sends the 14-day notice on a monthly term", () => {
    expect(dueNotices(pro(inDays(14)), none, NOW)).toEqual([NoticeKind.RENEWAL_14]);
  });

  it("does NOT send the 30-day notice on a monthly term", () => {
    // It would arrive before the previous month had even been paid for.
    expect(dueNotices(pro(inDays(30)), none, NOW)).toEqual([]);
  });

  it("sends the 30-day notice on an annual term", () => {
    // A year's fee is a budgeting decision; a fortnight is not enough warning.
    expect(dueNotices(pro(inDays(30), "annual"), none, NOW)).toEqual([NoticeKind.RENEWAL_30]);
  });

  it("never repeats a notice already sent for this term", () => {
    const sent = new Set<string>([NoticeKind.RENEWAL_14]);
    expect(dueNotices(pro(inDays(14)), sent, NOW)).toEqual([]);
  });

  it("sends at most ONE reminder per run, even after a long gap", () => {
    // The host sleeps, so a sweep can be missed for days. The tenant should get
    // the notice that fits where they are now, not a burst catching up.
    const out = dueNotices(pro(inDays(2)), none, NOW);
    expect(out).toHaveLength(1);
    expect(out).toEqual([NoticeKind.RENEWAL_3]);
  });

  it("moves on to the next step once the earlier one is sent", () => {
    const sent = new Set<string>([NoticeKind.RENEWAL_14]);
    expect(dueNotices(pro(inDays(3)), sent, NOW)).toEqual([NoticeKind.RENEWAL_3]);
  });

  it("sends the cutoff-day notice", () => {
    const sent = new Set<string>([NoticeKind.RENEWAL_14, NoticeKind.RENEWAL_3]);
    expect(dueNotices(pro(inDays(0)), sent, NOW)).toEqual([NoticeKind.RENEWAL_0]);
  });

  it("switches to REVERTED past the cutoff, and stops reminding", () => {
    expect(dueNotices(pro(inDays(-1)), none, NOW)).toEqual([NoticeKind.REVERTED]);
  });

  it("does not repeat REVERTED", () => {
    const sent = new Set<string>([NoticeKind.REVERTED]);
    expect(dueNotices(pro(inDays(-5)), sent, NOW)).toEqual([]);
  });
});

describe("shouldRevertToFree", () => {
  it("is true once a paid term has ended", () => {
    expect(shouldRevertToFree(pro(inDays(-1)), NOW)).toBe(true);
  });

  it("is false before the cutoff", () => {
    expect(shouldRevertToFree(pro(inDays(1)), NOW)).toBe(false);
  });

  it("is false for a paid plan with no term — nothing was ever billed", () => {
    expect(shouldRevertToFree(pro(null), NOW)).toBe(false);
  });

  it("is false for an already-free plan, so the sweep is idempotent", () => {
    expect(shouldRevertToFree({ plan: "free", interval: "monthly", renewsAt: inDays(-9) }, NOW)).toBe(false);
  });
});

/**
 * A term is exactly one calendar month or year, wherever the host is.
 *
 * `nextTermEnd` used local `getMonth`/`setMonth` on UTC-midnight instants. In
 * America/Jamaica — UTC-5, where this ships — a UTC midnight is the previous day
 * locally, so the arithmetic overflowed or undershot: 1 Feb ended 4 March (31
 * days) while 1 March ended 29 March (28 days). It went both ways, in every month,
 * and the answer depended on the server's `TZ`.
 *
 * It was recorded as an owner question about whether "monthly" should mean the same
 * day each month. It was not a preference. A review showed it also broke the void
 * re-anchoring that `reallocateTerms`'s lapse rule depends on, in the shipping
 * timezone — so the two behaviours the rule was written to hold at once did not.
 */
describe("nextTermEnd is timezone-independent", () => {
  // Fixtures are Jamaica-local midnight (05:00Z) and results are read as the Jamaica
  // calendar date: the calendar step now runs on the Jamaica date, so a UTC-midnight
  // fixture (19:00 the previous day in Kingston) would be testing a different day.
  // The expected dates are unchanged.
  const day = (d: string) => new Date(d.length === 10 ? `${d}T05:00:00.000Z` : d);
  const local = (d: Date) => new Date(d.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
  const term = (interval: string, from: string) =>
    local(nextTermEnd(interval, day(from).toISOString(), day(from)));

  it.each([
    ["2026-01-01", "2026-02-01"],
    // The one that used to give 4 March.
    ["2026-02-01", "2026-03-01"],
    // The one that used to give 29 March — a 28-day "month", the other direction.
    ["2026-03-01", "2026-04-01"],
    ["2026-05-01", "2026-06-01"],
    ["2026-12-01", "2027-01-01"],
  ])("monthly: %s -> %s", (from, expected) => {
    expect(term("monthly", from)).toBe(expected);
  });

  it("annual lands on the same date a year later", () => {
    expect(term("annual", "2026-02-01")).toBe("2027-02-01");
  });

  it("does not drift over a long chain of monthly terms", () => {
    // Fourteen renewals from 1 January must land on 1 March, not somewhere near it.
    // The old arithmetic walked the day-of-month, giving away days in some months
    // and taking them in others.
    let at = day("2026-01-01");
    for (let i = 0; i < 14; i += 1) at = nextTermEnd("monthly", at.toISOString(), at);
    expect(local(at)).toBe("2027-03-01");
  });

  it("clamps a month-end start to the last day of the short month, not an overflow into the next one", () => {
    // 31 January + one month has no 31 February. Raw setUTCMonth overflows to
    // 3 March (28 days late Feb, then 3 more spill into March); the correct
    // calendar-month answer clamps to the actual last day of February.
    expect(term("monthly", "2026-01-31")).toBe("2026-02-28");
  });

  it("clamps 31 August to 30 September", () => {
    expect(term("monthly", "2026-08-31")).toBe("2026-09-30");
  });

  it("clamps 29 Feb 2028 (leap) annual renewal to 28 Feb 2029 (non-leap)", () => {
    expect(term("annual", "2028-02-29")).toBe("2029-02-28");
  });

  it("a chain of monthly renewals from 31 Jan drifts to the 28th and stays anchored there", () => {
    // There is no separate "billing anchor day" column — only `renewsAt` is
    // persisted — so a renewal computed from an already-clamped date cannot
    // recover the original 31st. This pins that consequence rather than
    // asserting (incorrectly) that it snaps back once a 31-day month recurs.
    let at = day("2026-01-31");
    const ends: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      at = nextTermEnd("monthly", at.toISOString(), at);
      ends.push(local(at));
    }
    expect(ends).toEqual(["2026-02-28", "2026-03-28", "2026-04-28", "2026-05-28"]);
  });

  it("steps the Jamaica-local calendar date, so an evening purchase does not end a day early", () => {
    // 23:30 on 30 Jan in Kingston is 04:30 on 31 Jan UTC. Stepping UTC fields clamped
    // 31 -> 28 and ended the term at 23:30 on 27 Feb local — measured before the fix.
    const at = new Date("2026-01-31T04:30:00.000Z");
    expect(nextTermEnd("monthly", at.toISOString(), at).toISOString()).toBe("2026-03-01T04:30:00.000Z");
  });

  it.each([
    // [Jamaica-local start, Jamaica-local end], all at 23:30 local (04:30Z next day).
    ["2026-01-29", "2026-02-28"],
    ["2026-01-30", "2026-02-28"],
    ["2026-01-31", "2026-02-28"],
    ["2028-01-30", "2028-02-29"],
    ["2026-03-31", "2026-04-30"],
    ["2026-08-31", "2026-09-30"],
    ["2026-12-31", "2027-01-31"],
  ])("month-end at 23:30 Jamaica time: %s -> %s", (from, expected) => {
    const at = new Date(new Date(`${from}T23:30:00.000Z`).getTime() + 5 * 3_600_000);
    const out = nextTermEnd("monthly", at.toISOString(), at);
    expect(local(out)).toBe(expected);
    expect(new Date(out.getTime() - 5 * 3_600_000).toISOString().slice(11, 16)).toBe("23:30");
  });

  it("a UTC-midnight instant is 19:00 the previous Jamaica day, and steps as that day", () => {
    // 2026-01-31T00:00Z is 19:00 on 30 Jan local -> 19:00 on 28 Feb local.
    const at = new Date("2026-01-31T00:00:00.000Z");
    expect(nextTermEnd("monthly", at.toISOString(), at).toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});
