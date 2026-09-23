/**
 * How stale a jurisdiction rule-pack's verification is.
 *
 * Setting a "verified as of" date by hand is data entry, not verification —
 * the console let an admin type a date but never told them one was overdue,
 * which is what "I can't check for updates" meant when it was reported. This
 * turns the stored date into a prompt: how long has it been, and does it need
 * looking at.
 *
 * There is deliberately no automated check. A real one needs a machine-readable
 * feed of Jamaican tax and statutory rates, and no such source exists — TAJ
 * publishes prose. Inventing a scraper against a page that can be reworded at
 * any time would produce confident wrong answers about tax rates, which is
 * worse than an honest "last checked 14 months ago". The sources are surfaced
 * as links for a human to check instead.
 */

/** Days after which a pack is worth re-checking. A tax year is the natural
 * cadence — rates move at budget time — so anything older than roughly a year
 * is overdue, and the warning starts a quarter before that. */
export const RULE_PACK_AGING_DAYS = 275;
export const RULE_PACK_STALE_DAYS = 365;

export type RulePackFreshness = "never" | "fresh" | "aging" | "stale";

export interface RulePackVerification {
  freshness: RulePackFreshness;
  /** Whole days since verification; null when it has never been verified. */
  ageDays: number | null;
  /** Ready to render — "Verified 12 days ago", "Never verified". */
  label: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param verifiedAsOf ISO date (YYYY-MM-DD) or null when never verified.
 *
 * A future date is treated as verified today rather than as a negative age:
 * it is a typo, and reporting "verified in -30 days" helps nobody.
 */
export function rulePackVerification(
  verifiedAsOf: string | null | undefined,
  now: Date = new Date(),
): RulePackVerification {
  if (!verifiedAsOf) {
    return { freshness: "never", ageDays: null, label: "Never verified" };
  }

  const then = new Date(`${verifiedAsOf.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(then.getTime())) {
    return { freshness: "never", ageDays: null, label: "Never verified" };
  }

  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const ageDays = Math.max(0, Math.round((today.getTime() - then.getTime()) / DAY_MS));

  const freshness: RulePackFreshness =
    ageDays >= RULE_PACK_STALE_DAYS ? "stale" : ageDays >= RULE_PACK_AGING_DAYS ? "aging" : "fresh";

  return { freshness, ageDays, label: `Verified ${describeAge(ageDays)}` };
}

function describeAge(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.round(days / 365.25)} years ago`;
}
