/**
 * Turns the API's regulatory feed (GET /regulatory) into the shape the
 * dashboard's "Regulatory" card renders.
 *
 * The API sends the raw row — a title, a summary and a date — and deliberately
 * no severity or human label: how urgent a change is depends on when you are
 * looking at it, and a server-rendered "Effective in 9 days" is wrong as soon
 * as it is cached. So the derivation lives here, pure and testable, with `now`
 * injected rather than read from the clock.
 */
import type { ApiRegulatoryUpdate } from "./api-client";
import type { RegulatoryAlert } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Thresholds for how loudly a pending change is flagged. Deliberately coarse:
 * the card is a nudge to go read the notice, not a countdown. */
const CRITICAL_WITHIN_DAYS = 14;
const WARN_WITHIN_DAYS = 60;

/**
 * `effectiveDate` is a CALENDAR date the authority published (stored as UTC
 * midnight), not a moment in time. Formatting or differencing it in the
 * viewer's zone shifts it a day west of Greenwich — a change effective the 1st
 * would read as the 31st for every user in Jamaica (UTC-5). Everything below
 * therefore works in UTC.
 */
function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function parseEffective(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Whole days from `now` until the change takes effect; negative once it has.
 * Returns null when the update carries no date. */
export function daysUntilEffective(effectiveDate: string | null, now: Date): number | null {
  const d = parseEffective(effectiveDate);
  if (!d) return null;
  return Math.round((utcMidnight(d) - utcMidnight(now)) / DAY_MS);
}

/**
 * Something already in force is informational, not urgent — the contractor
 * either absorbed it or did not, and shouting about it every day would train
 * them to ignore the card.
 */
export function regulatorySeverity(
  effectiveDate: string | null,
  now: Date,
): RegulatoryAlert["severity"] {
  const days = daysUntilEffective(effectiveDate, now);
  if (days === null || days < 0) return "info";
  if (days <= CRITICAL_WITHIN_DAYS) return "critical";
  if (days <= WARN_WITHIN_DAYS) return "warn";
  return "info";
}

export function regulatoryEffectiveLabel(effectiveDate: string | null, now: Date): string {
  const d = parseEffective(effectiveDate);
  if (!d) return "No date set";
  const on = d.toLocaleDateString("en-JM", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const days = daysUntilEffective(effectiveDate, now);
  return days !== null && days < 0 ? `In effect since ${on}` : `Effective ${on}`;
}

export function mapRegulatoryUpdate(update: ApiRegulatoryUpdate, now: Date): RegulatoryAlert {
  return {
    id: update.id,
    title: update.title,
    detail: update.summary,
    effectiveLabel: regulatoryEffectiveLabel(update.effectiveDate, now),
    severity: regulatorySeverity(update.effectiveDate, now),
    sourceUrl: update.sourceUrl,
  };
}

/**
 * Soonest-to-take-effect first, so the thing the contractor still has time to
 * act on outranks one that already landed. The API orders by publication date,
 * which is the right order for a staff review queue and the wrong one here.
 * Updates with no date sort last.
 */
export function sortRegulatoryAlerts(
  updates: ApiRegulatoryUpdate[],
  now: Date,
): RegulatoryAlert[] {
  return [...updates]
    .sort((a, b) => {
      const da = daysUntilEffective(a.effectiveDate, now);
      const db = daysUntilEffective(b.effectiveDate, now);
      if (da === null) return db === null ? 0 : 1;
      if (db === null) return -1;
      // Pending changes ascending; already-effective ones fall below them,
      // most recent first.
      if (da >= 0 && db >= 0) return da - db;
      if (da < 0 && db < 0) return db - da;
      return da >= 0 ? -1 : 1;
    })
    .map((u) => mapRegulatoryUpdate(u, now));
}
