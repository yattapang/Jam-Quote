import { describe, expect, it } from "vitest";
import type { EquipmentItem, LabourRate } from "@/lib/types";
import { lineUnitLabel } from "@/lib/quote-totals";
import { equipmentLabel, keptUnit, labourDescription, labourLabel } from "./job-component-units";

/**
 * The unit a job recipe row carries, and the unit a picker prints.
 *
 * Two defects, both of which a source guard could not see because they sit inside
 * functions rather than in rendered JSX:
 *
 * - The "add new equipment" path stamped `created.rateUnit.toLowerCase()` — a word
 *   invented from the billing cadence, e.g. "day" — into the recipe when the item had
 *   no unit of its own. The picker path had already been fixed not to; the add-new
 *   path could not reach that fix and kept an inline copy of the old rule.
 * - The labour picker printed `r.rateUnit.toLowerCase()` and ignored the rate's own
 *   `unitLabel`, so a rate sold per job still showed its cadence.
 */

/** What the cadence fallback would print — computed, not guessed. */
const HOUR_CADENCE = lineUnitLabel({ rateUnit: "HOUR" as LabourRate["rateUnit"] });

describe("keptUnit", () => {
  it("never overwrites a unit the contractor typed", () => {
    expect(keptUnit("bag", "kg")).toEqual({});
  });

  it("carries the item's own unit onto an empty row, trimmed", () => {
    expect(keptUnit("", " sheet ")).toEqual({ unitLabel: "sheet" });
  });

  it("treats a whitespace-only typed unit as empty", () => {
    expect(keptUnit("   ", "bag")).toEqual({ unitLabel: "bag" });
  });

  it("invents nothing when neither has a unit — the add-new-equipment defect", () => {
    // The old inline rule produced the cadence word here. There is no cadence
    // parameter at all now, which is the structural half of the fix.
    expect(keptUnit("", undefined)).toEqual({});
    expect(keptUnit(null, null)).toEqual({});
    expect(keptUnit(undefined, "   ")).toEqual({});
  });
});

describe("labourLabel", () => {
  const rate = (over: Partial<LabourRate>): LabourRate =>
    ({
      trade: "Mason",
      skillTier: null,
      rateDollars: 4000,
      rateUnit: "HOUR",
      unitLabel: null,
      ...over,
    }) as unknown as LabourRate;

  it("prints the rate's OWN unit, not its billing cadence", () => {
    const label = labourLabel(rate({ unitLabel: "job" }));
    expect(label).toContain("/job");
    expect(label).not.toContain(`/${HOUR_CADENCE}`);
  });

  it("falls back to the cadence label only when the rate has no unit", () => {
    expect(labourLabel(rate({}))).toContain(`/${HOUR_CADENCE}`);
  });

  it("includes the skill tier when there is one", () => {
    expect(labourLabel(rate({ skillTier: "Senior" }))).toContain("Mason — Senior");
  });
});

describe("labourDescription", () => {
  // Both ways of adding a labour component — picking a saved rate
  // (JobForm.pickLabour) and creating one inline (JobForm's "Add labour
  // rate" modal onSubmit) — must produce the exact same description text.
  // They used to disagree: "Mason (Senior)" vs "Mason — Senior".
  it("joins trade and skill tier with an em dash, no price", () => {
    expect(labourDescription({ trade: "Mason", skillTier: "Senior" })).toBe("Mason — Senior");
  });

  it("is just the trade when there is no skill tier", () => {
    expect(labourDescription({ trade: "Mason", skillTier: null })).toBe("Mason");
    expect(labourDescription({ trade: "Mason" })).toBe("Mason");
  });

  it("never includes a price, unlike labourLabel", () => {
    const rate = { trade: "Mason", skillTier: "Senior" };
    expect(labourDescription(rate)).not.toMatch(/\$/);
  });
});

describe("equipmentLabel", () => {
  const item = (over: Partial<EquipmentItem>): EquipmentItem =>
    ({ name: "Mixer", rateDollars: 1500, rateUnit: "HOUR", unitLabel: null, ...over }) as unknown as EquipmentItem;

  it("prints the item's own unit when it has one", () => {
    expect(equipmentLabel(item({ unitLabel: "load" }))).toContain("/load");
  });

  it("falls back to the cadence label when it has none", () => {
    expect(equipmentLabel(item({}))).toContain(`/${HOUR_CADENCE}`);
  });
});
