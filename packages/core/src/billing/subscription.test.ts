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
