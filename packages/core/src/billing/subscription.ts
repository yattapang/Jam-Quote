/**
 * Subscription lifecycle maths for the platform's own billing.
 *
 * Pure and clock-injectable on purpose: the cadence that decides when a
 * contractor is warned their subscription is ending, and when it lapses, is
 * exactly the kind of logic that is impossible to test through a cron and a
 * mailbox. Everything here is a function of dates.
 *
 * NOTE ON SCOPE: this is JamQuote billing ITS tenants. It has nothing to do
 * with the `Payment` model, which is a contractor's client paying the
 * contractor. Two separate books of account — never sum them.
 */

export const SubscriptionInterval = {
  MONTHLY: "monthly",
  ANNUAL: "annual",
} as const;
export type SubscriptionInterval =
  (typeof SubscriptionInterval)[keyof typeof SubscriptionInterval];

/**
 * Where a subscription stands right now.
 *
 * DERIVED from renewsAt, never stored. A stored status drifts from the dates
 * that produce it — which is exactly what happened before: `Subscription.status`
 * was written once as "active" and never updated, so every tenant read Active
 * forever and the console filtered on states nothing could set.
 */
export const SubscriptionStanding = {
  /** Paid, and the cutoff is not close. */
  CURRENT: "CURRENT",
  /** Paid, but inside the reminder window — renewal is coming up. */
  DUE_SOON: "DUE_SOON",
  /** The cutoff has passed while still on a paid plan: payment is late and
   * the sweep has not reverted them yet. */
  PAST_DUE: "PAST_DUE",
  /** Not on a paid plan at all. */
  FREE: "FREE",
} as const;
export type SubscriptionStanding =
  (typeof SubscriptionStanding)[keyof typeof SubscriptionStanding];

/** How far ahead of the cutoff a subscription starts reading as DUE_SOON —
 * the same 14 days as the first monthly reminder, so the badge and the first
 * email cannot disagree about when "soon" begins. */
export const DUE_SOON_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SubscriptionLike {
  plan: string;
  interval: string;
  /** ISO instant, or null when the tenant has never been on a paid term. */
  renewsAt: string | null;
}

const isPaid = (plan: string): boolean => plan.trim().toLowerCase() === "pro";

/** Whole days from `now` until `iso`; negative once it has passed. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS);
}

/**
 * A subscription's standing.
 *
 * A paid plan with no renewal date reads CURRENT rather than PAST_DUE: it
 * means a staff member set the plan without a term (the manual-upgrade path),
 * and treating that as an overdue account would chase someone who was never
 * billed.
 */
export function subscriptionStanding(
  sub: SubscriptionLike,
  now: Date = new Date(),
): SubscriptionStanding {
  if (!isPaid(sub.plan)) return SubscriptionStanding.FREE;
  if (!sub.renewsAt) return SubscriptionStanding.CURRENT;

  const days = daysUntil(sub.renewsAt, now);
  if (days < 0) return SubscriptionStanding.PAST_DUE;
  return days <= DUE_SOON_DAYS ? SubscriptionStanding.DUE_SOON : SubscriptionStanding.CURRENT;
}

/**
 * The end of the next term.
 *
 * Advances from the LATER of `now` and the current `renewsAt`, so a contractor
 * who pays a week early keeps that week instead of losing it — while one
 * paying a month late does not get billed for the month they had already
 * lapsed through.
 *
 * Uses calendar arithmetic (setMonth/setFullYear) rather than adding fixed
 * days, so a renewal keeps its day-of-month and does not drift across a leap
 * year.
 */
export function nextTermEnd(
  interval: string,
  currentRenewsAt: string | null,
  now: Date = new Date(),
): Date {
  const currentMs = currentRenewsAt ? new Date(currentRenewsAt).getTime() : 0;
  const base = new Date(Math.max(currentMs, now.getTime()));

  const end = new Date(base);
  if (interval === SubscriptionInterval.ANNUAL) end.setFullYear(end.getFullYear() + 1);
  else end.setMonth(end.getMonth() + 1);
  return end;
}

/** The notices the platform can send about a subscription. */
export const NoticeKind = {
  /** Annual terms only — a year's fee is a budgeting decision. */
  RENEWAL_30: "RENEWAL_30",
  RENEWAL_14: "RENEWAL_14",
  RENEWAL_3: "RENEWAL_3",
  RENEWAL_0: "RENEWAL_0",
  /** Sent when the term ended unpaid and the plan dropped to free. Reports a
   * change that already happened — deliberately not a fifth reminder. */
  REVERTED: "REVERTED",
} as const;
export type NoticeKind = (typeof NoticeKind)[keyof typeof NoticeKind];

/**
 * Lead times, TIGHTEST first. The order is the logic, not presentation.
 *
 * Scanning widest-first returns the earliest unsent notice, which is wrong
 * after a missed sweep: a tenant two days from cutoff would be sent the
 * fortnight warning. Tightest-first picks the window they are actually in.
 */
const RENEWAL_STEPS: { kind: NoticeKind; days: number; annualOnly: boolean }[] = [
  { kind: NoticeKind.RENEWAL_0, days: 0, annualOnly: false },
  { kind: NoticeKind.RENEWAL_3, days: 3, annualOnly: false },
  { kind: NoticeKind.RENEWAL_14, days: 14, annualOnly: false },
  { kind: NoticeKind.RENEWAL_30, days: 30, annualOnly: true },
];

/**
 * Which notices are due for one subscription right now.
 *
 * `alreadySent` is the set of kinds already recorded for THIS term, which is
 * what makes the sweep idempotent. That matters more than it looks: the API
 * runs on a host that sleeps, so the daily cron cannot be trusted to fire
 * exactly once — the sweep is expected to run on boot, on a timer, and from an
 * admin button, and must never double-send.
 *
 * Returns at most ONE renewal reminder per run: if a sweep is missed for a
 * week, the tenant should get the notice that fits where they are now, not a
 * burst of three catching up.
 */
export function dueNotices(
  sub: SubscriptionLike,
  alreadySent: ReadonlySet<string>,
  now: Date = new Date(),
): NoticeKind[] {
  if (!isPaid(sub.plan) || !sub.renewsAt) return [];

  const days = daysUntil(sub.renewsAt, now);

  // Past the cutoff: the term is over, so the only thing left to say is that
  // the plan has reverted. Reminders no longer apply.
  if (days < 0) {
    return alreadySent.has(NoticeKind.REVERTED) ? [] : [NoticeKind.REVERTED];
  }

  const annual = sub.interval === SubscriptionInterval.ANNUAL;
  for (const step of RENEWAL_STEPS) {
    if (step.annualOnly && !annual) continue;
    if (days > step.days) continue;
    // The tightest window they have entered. If it has already gone out there
    // is nothing to send — deliberately no fallback to a wider one, because
    // sending "14 days left" to someone with 2 is worse than sending nothing.
    return alreadySent.has(step.kind) ? [] : [step.kind];
  }
  return [];
}

/**
 * Whether a subscription's term has ended and it should drop to free.
 *
 * Reverting sets the plan and NOTHING else. It must never touch suspension:
 * non-payment is not misconduct, and a contractor who is behind on a bill
 * keeps their data, keeps invoicing, and keeps collecting money — they simply
 * drop to the free quota until they pay.
 */
export function shouldRevertToFree(sub: SubscriptionLike, now: Date = new Date()): boolean {
  return isPaid(sub.plan) && !!sub.renewsAt && daysUntil(sub.renewsAt, now) < 0;
}
