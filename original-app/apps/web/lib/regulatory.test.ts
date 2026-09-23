import { describe, expect, it } from "vitest";
import type { ApiRegulatoryUpdate } from "./api-client";
import {
  daysUntilEffective,
  mapRegulatoryUpdate,
  regulatoryEffectiveLabel,
  regulatorySeverity,
  sortRegulatoryAlerts,
} from "./regulatory";

const NOW = new Date("2026-07-20T14:30:00.000Z");

function update(patch: Partial<ApiRegulatoryUpdate> = {}): ApiRegulatoryUpdate {
  return {
    id: "reg-1",
    title: "GCT registration threshold increases to JMD 15M",
    category: "GCT",
    summary: "Tax Administration Jamaica raised the mandatory GCT registration threshold.",
    effectiveDate: "2026-08-01T00:00:00.000Z",
    sourceUrl: "https://www.jamaicatax.gov.jm",
    ...patch,
  };
}

describe("daysUntilEffective", () => {
  it("counts whole days to the effective date", () => {
    expect(daysUntilEffective("2026-08-01T00:00:00.000Z", NOW)).toBe(12);
  });

  it("goes negative once the change is in force", () => {
    expect(daysUntilEffective("2026-06-01T00:00:00.000Z", NOW)).toBe(-49);
  });

  it("is zero on the day itself, regardless of the time of day now", () => {
    // Both sides are compared at UTC midnight, so a mid-afternoon `now` does
    // not round the day the contractor is warned about up or down.
    expect(daysUntilEffective("2026-07-20T00:00:00.000Z", NOW)).toBe(0);
  });

  it("returns null for an update with no date, and for an unparseable one", () => {
    expect(daysUntilEffective(null, NOW)).toBeNull();
    expect(daysUntilEffective("not-a-date", NOW)).toBeNull();
  });
});

describe("regulatorySeverity", () => {
  it("flags a change landing within a fortnight as critical", () => {
    expect(regulatorySeverity("2026-07-28T00:00:00.000Z", NOW)).toBe("critical");
    expect(regulatorySeverity("2026-08-03T00:00:00.000Z", NOW)).toBe("critical"); // day 14, inclusive
  });

  it("warns on a change inside the next two months", () => {
    expect(regulatorySeverity("2026-08-04T00:00:00.000Z", NOW)).toBe("warn"); // day 15
    expect(regulatorySeverity("2026-09-18T00:00:00.000Z", NOW)).toBe("warn"); // day 60, inclusive
  });

  it("treats a distant change as informational", () => {
    expect(regulatorySeverity("2026-09-19T00:00:00.000Z", NOW)).toBe("info"); // day 61
  });

  it("drops an already-effective change back to informational rather than shouting forever", () => {
    expect(regulatorySeverity("2026-06-01T00:00:00.000Z", NOW)).toBe("info");
  });

  it("treats a dateless update as informational", () => {
    expect(regulatorySeverity(null, NOW)).toBe("info");
  });
});

describe("regulatoryEffectiveLabel", () => {
  it("renders the calendar date in UTC, not the viewer's zone", () => {
    // Stored as UTC midnight; formatting in Jamaica (UTC-5) would print the
    // previous day, so an update effective the 1st would read as the 31st for
    // every user. Day-month order is the en-JM locale's, same as BillingCard.
    expect(regulatoryEffectiveLabel("2026-08-01T00:00:00.000Z", NOW)).toBe("Effective 1 Aug 2026");
  });

  it("reads in the past tense once the change is in force", () => {
    expect(regulatoryEffectiveLabel("2026-06-01T00:00:00.000Z", NOW)).toBe("In effect since 1 Jun 2026");
  });

  it("still says 'Effective' on the day it lands", () => {
    expect(regulatoryEffectiveLabel("2026-07-20T00:00:00.000Z", NOW)).toBe("Effective 20 Jul 2026");
  });

  it("says so plainly when the authority set no date", () => {
    expect(regulatoryEffectiveLabel(null, NOW)).toBe("No date set");
  });
});

describe("mapRegulatoryUpdate", () => {
  it("carries the summary and source link through to the card", () => {
    expect(mapRegulatoryUpdate(update(), NOW)).toEqual({
      id: "reg-1",
      title: "GCT registration threshold increases to JMD 15M",
      detail: "Tax Administration Jamaica raised the mandatory GCT registration threshold.",
      effectiveLabel: "Effective 1 Aug 2026",
      severity: "critical", // 12 days out

      sourceUrl: "https://www.jamaicatax.gov.jm",
    });
  });

  it("keeps a missing source URL null rather than inventing a link target", () => {
    expect(mapRegulatoryUpdate(update({ sourceUrl: null }), NOW).sourceUrl).toBeNull();
  });
});

describe("sortRegulatoryAlerts", () => {
  it("puts the soonest pending change first", () => {
    const sorted = sortRegulatoryAlerts(
      [
        update({ id: "far", effectiveDate: "2026-11-01T00:00:00.000Z" }),
        update({ id: "soon", effectiveDate: "2026-07-25T00:00:00.000Z" }),
        update({ id: "mid", effectiveDate: "2026-09-01T00:00:00.000Z" }),
      ],
      NOW,
    );
    expect(sorted.map((a) => a.id)).toEqual(["soon", "mid", "far"]);
  });

  it("ranks already-effective changes below everything still pending", () => {
    const sorted = sortRegulatoryAlerts(
      [
        update({ id: "past-old", effectiveDate: "2026-01-01T00:00:00.000Z" }),
        update({ id: "past-recent", effectiveDate: "2026-06-01T00:00:00.000Z" }),
        update({ id: "pending", effectiveDate: "2026-10-01T00:00:00.000Z" }),
      ],
      NOW,
    );
    // Pending first; among those in force, the most recent one first.
    expect(sorted.map((a) => a.id)).toEqual(["pending", "past-recent", "past-old"]);
  });

  it("sorts dateless updates last", () => {
    const sorted = sortRegulatoryAlerts(
      [
        update({ id: "undated", effectiveDate: null }),
        update({ id: "past", effectiveDate: "2026-01-01T00:00:00.000Z" }),
        update({ id: "pending", effectiveDate: "2026-08-01T00:00:00.000Z" }),
      ],
      NOW,
    );
    expect(sorted.map((a) => a.id)).toEqual(["pending", "past", "undated"]);
  });

  it("does not mutate the caller's array", () => {
    const input = [
      update({ id: "b", effectiveDate: "2026-11-01T00:00:00.000Z" }),
      update({ id: "a", effectiveDate: "2026-07-25T00:00:00.000Z" }),
    ];
    sortRegulatoryAlerts(input, NOW);
    expect(input.map((u) => u.id)).toEqual(["b", "a"]);
  });

  it("returns an empty list when the feed is empty", () => {
    expect(sortRegulatoryAlerts([], NOW)).toEqual([]);
  });
});
