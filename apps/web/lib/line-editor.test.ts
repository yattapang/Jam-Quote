import { describe, expect, it } from "vitest";
import {
  JobComponentKind,
  GctTreatment,
  LineCategory,
  RateUnit,
} from "@jamquote/core";
import {
  assemblyLine,
  categoryForLabel,
  computeCoverageQuantity,
  coverageConfigForLine,
  coverageConfigFromFavourite,
  customHeadingsFromInitial,
  draftLineFromInitial,
  fromCents,
  groupLinesIntoSections,
  headingFromSectionTitle,
  headingTitle,
  headingToValue,
  labourLine,
  lineToInvoiceLineInput,
  lineToLineInput,
  linesFromInitial,
  newLine,
  patchLine,
  removeLineByKey,
  savableLines,
  applyUnitChoice,
  unitOptions,
  unitValue,
  toCents,
  valueToHeading,
  type CoverageConfig,
  type DraftLine,
  type Heading,
  type InitialLine,
  LineKind,
  categoryForKind,
  kindFromSaved,
  applyKindChange,
  applyJobPick,
  applyJobUnitEdit,
  applyLabourRatePick,
  jobPickerOptions,
  materialPickPatch,
  applyEquipmentPick,
  equipmentPickerOptions,
} from "./line-editor";
import type { Job, LabourRate, MaterialFavourite } from "./types";

function line(over: Partial<DraftLine> = {}): DraftLine {
  return { ...newLine(), ...over };
}

function initial(over: Partial<InitialLine> = {}): InitialLine {
  return {
    category: LineCategory.MATERIAL,
    description: "Cement",
    quantity: 3,
    rateUnit: RateUnit.UNIT,
    unitPriceCents: 125_000,
    gctTreatment: GctTreatment.STANDARD,
    ...over,
  };
}

describe("heading values round-trip through the dropdown", () => {
  it("encodes built-in categories and custom titles distinctly", () => {
    expect(headingToValue({ kind: "category", category: LineCategory.LABOUR })).toBe("cat:LABOUR");
    expect(headingToValue({ kind: "custom", title: "Site prep" })).toBe("custom:Site prep");
  });

  it("decodes back to the same heading", () => {
    const headings: Heading[] = [
      { kind: "category", category: LineCategory.MATERIAL },
      { kind: "custom", title: "Site prep" },
    ];
    for (const h of headings) expect(valueToHeading(headingToValue(h))).toEqual(h);
  });

  it("keeps a custom title containing a colon intact", () => {
    // slice() by prefix length, not split(":") — "Phase 2: roof" must survive.
    expect(valueToHeading("custom:Phase 2: roof")).toEqual({ kind: "custom", title: "Phase 2: roof" });
  });

  it("treats anything not prefixed custom: as a category", () => {
    expect(valueToHeading("cat:OTHER")).toEqual({ kind: "category", category: LineCategory.OTHER });
  });
});

describe("headingTitle / categoryForLabel", () => {
  it("titles a built-in heading with its customer-facing category label", () => {
    expect(headingTitle({ kind: "category", category: LineCategory.EQUIPMENT })).toBe("Equipment & rental");
    expect(headingTitle({ kind: "custom", title: "Site prep" })).toBe("Site prep");
  });

  it("maps a label back to its category, and only on an exact match", () => {
    expect(categoryForLabel("Materials")).toBe(LineCategory.MATERIAL);
    expect(categoryForLabel("Equipment & rental")).toBe(LineCategory.EQUIPMENT);
    expect(categoryForLabel("materials")).toBeUndefined();
    expect(categoryForLabel("Site prep")).toBeUndefined();
  });

  it("rebuilds a heading from a saved section title", () => {
    expect(headingFromSectionTitle("Labour")).toEqual({ kind: "category", category: LineCategory.LABOUR });
    expect(headingFromSectionTitle("Site prep")).toEqual({ kind: "custom", title: "Site prep" });
  });

  it("round-trips every built-in category through its section title", () => {
    for (const category of Object.values(LineCategory)) {
      const h: Heading = { kind: "category", category };
      expect(headingFromSectionTitle(headingTitle(h))).toEqual(h);
    }
  });
});

describe("money conversion is integer cents in both directions", () => {
  it("rounds dollars to whole cents", () => {
    expect(toCents("1250.50")).toBe(125_050);
    expect(toCents("0.005")).toBe(1);
    expect(toCents("19.999")).toBe(2000);
  });

  it("treats blank or unparseable input as zero rather than NaN", () => {
    expect(toCents("")).toBe(0);
    expect(toCents("abc")).toBe(0);
    expect(toCents(" ")).toBe(0);
  });

  it("renders cents back as a plain dollar string", () => {
    expect(fromCents(125_050)).toBe("1250.5");
    expect(fromCents(0)).toBe("0");
    expect(fromCents(1)).toBe("0.01");
  });
});

describe("newLine", () => {
  it("starts on the Materials heading, quantity 1, standard GCT and no price", () => {
    const l = newLine();
    expect(l.heading).toEqual({ kind: "category", category: LineCategory.MATERIAL });
    expect(l.quantity).toBe("1");
    expect(l.rateUnit).toBe(RateUnit.UNIT);
    expect(l.unitPriceDollars).toBe("");
    expect(l.gctTreatment).toBe(GctTreatment.STANDARD);
    expect(l.unitLabel).toBeUndefined();
  });

  it("gives every line a distinct React key", () => {
    expect(newLine().key).not.toBe(newLine().key);
  });
});

describe("assemblyLine", () => {
  const job: Job = {
    id: "a1",
    name: "Tiling",
    unit: "sq ft",
    markupPct: 20,
    unitCostCents: 45_000,
    components: [
      {
        id: "c1",
        kind: JobComponentKind.MATERIAL,
        description: "Tile",
        quantityPerUnit: 1.1,
        unitPriceCents: 30_000,
        sort: 0,
      },
    ],
  };

  it("prices the line from the job's computed unit cost", () => {
    const l = assemblyLine(job, 12);
    expect(l.description).toBe("Tiling");
    expect(l.quantity).toBe("12");
    expect(l.unitPriceDollars).toBe("450");
    expect(l.heading).toEqual({ kind: "category", category: LineCategory.OTHER });
    expect(l.jobId).toBe("a1");
    expect(l.jobUnit).toBe("sq ft");
  });

  it("snapshots the components without their database ids or sort", () => {
    expect(assemblyLine(job, 1).jobComponents).toEqual([
      {
        kind: JobComponentKind.MATERIAL,
        description: "Tile",
        quantityPerUnit: 1.1,
        unitPriceCents: 30_000,
      },
    ]);
  });
});

describe("labourLine", () => {
  const rate: LabourRate = {
    id: "lr1",
    trade: "Mason",
    rateCents: 350_000,
    rateDollars: 3500,
    rateUnit: RateUnit.DAY,
  };

  it("carries the rate's own cadence and leaves unitLabel unset", () => {
    const l = labourLine(rate, 4);
    expect(l.description).toBe("Mason");
    expect(l.quantity).toBe("4");
    expect(l.rateUnit).toBe(RateUnit.DAY);
    expect(l.unitPriceDollars).toBe("3500");
    expect(l.heading).toEqual({ kind: "category", category: LineCategory.LABOUR });
    expect(l.unitLabel).toBeUndefined();
  });

  it("names the skill tier when the rate has one", () => {
    expect(labourLine({ ...rate, skillTier: "Senior" }, 1).description).toBe("Mason — Senior");
  });
});

describe("linesFromInitial", () => {
  it("returns one blank line when there is nothing to restore", () => {
    expect(linesFromInitial()).toHaveLength(1);
    expect(linesFromInitial({ lines: [], sections: [] })).toHaveLength(1);
    expect(linesFromInitial({}).at(0)?.description).toBe("");
  });

  it("puts sectioned lines first, in section order, then legacy ungrouped ones", () => {
    const lines = linesFromInitial({
      sections: [
        { title: "Site prep", lines: [initial({ description: "Clear" })] },
        { title: "Materials", lines: [initial({ description: "Cement" })] },
      ],
      lines: [initial({ description: "Legacy", category: LineCategory.LABOUR })],
    });
    expect(lines.map((l) => l.description)).toEqual(["Clear", "Cement", "Legacy"]);
    expect(lines[0]?.heading).toEqual({ kind: "custom", title: "Site prep" });
    expect(lines[1]?.heading).toEqual({ kind: "category", category: LineCategory.MATERIAL });
    // A legacy line has no section, so its heading comes from its own category.
    expect(lines[2]?.heading).toEqual({ kind: "category", category: LineCategory.LABOUR });
  });

  it("restores the sold-by unit a saved line already showed the customer", () => {
    const lines = linesFromInitial({ lines: [initial({ unitLabel: "bag" })] });
    expect(lines[0]?.unitLabel).toBe("bag");
  });
});

describe("draftLineFromInitial", () => {
  it("converts cents to a dollar string and keeps the job snapshot", () => {
    const l = draftLineFromInitial(
      initial({
        unitPriceCents: 125_050,
        quantity: 2.5,
        jobId: "a1",
        jobName: "Tiling",
        jobUnit: "sq ft",
        jobComponents: [
          {
            kind: JobComponentKind.LABOUR,
            description: "Fixing",
            quantityPerUnit: 0.5,
            unitPriceCents: 1000,
          },
        ],
      }),
      { kind: "custom", title: "Site prep" },
    );
    expect(l.unitPriceDollars).toBe("1250.5");
    expect(l.quantity).toBe("2.5");
    expect(l.heading).toEqual({ kind: "custom", title: "Site prep" });
    expect(l.jobComponents).toHaveLength(1);
  });
});

describe("customHeadingsFromInitial", () => {
  it("keeps only non-category titles, deduplicated, in first-appearance order", () => {
    expect(
      customHeadingsFromInitial({
        sections: [
          { title: "Site prep", lines: [] },
          { title: "Materials", lines: [] },
          { title: "Finishing", lines: [] },
          { title: "Site prep", lines: [] },
        ],
      }),
    ).toEqual(["Site prep", "Finishing"]);
  });

  it("is empty when there is nothing to restore", () => {
    expect(customHeadingsFromInitial()).toEqual([]);
    expect(customHeadingsFromInitial({ lines: [initial()] })).toEqual([]);
  });
});

describe("patchLine", () => {
  it("only touches the addressed line", () => {
    const a = line({ key: "a" });
    const b = line({ key: "b" });
    const [first, second] = patchLine([a, b], "b", { quantity: "9" });
    expect(first).toBe(a);
    expect(second?.quantity).toBe("9");
  });

  it("drops the favourite link when the description is hand-edited", () => {
    const l = line({ key: "a", description: "Cement", materialFavouriteId: "f1" });
    expect(patchLine([l], "a", { description: "Cement 42.5kg" })[0]?.materialFavouriteId).toBeUndefined();
  });

  it("keeps the favourite link when another field changes", () => {
    const l = line({ key: "a", description: "Cement", materialFavouriteId: "f1" });
    expect(patchLine([l], "a", { unitPriceDollars: "1300" })[0]?.materialFavouriteId).toBe("f1");
  });

  it("keeps the favourite link when the description is re-set to the same text", () => {
    const l = line({ key: "a", description: "Cement", materialFavouriteId: "f1" });
    expect(patchLine([l], "a", { description: "Cement" })[0]?.materialFavouriteId).toBe("f1");
  });

  it("does nothing special on a line that was never linked to a favourite", () => {
    const l = line({ key: "a", description: "Cement" });
    expect(patchLine([l], "a", { description: "Sand" })[0]).toMatchObject({ description: "Sand" });
  });
});

describe("removeLineByKey", () => {
  it("removes the addressed line", () => {
    const kept = removeLineByKey([line({ key: "a" }), line({ key: "b" })], "a");
    expect(kept.map((l) => l.key)).toEqual(["b"]);
  });

  it("refuses to remove the last remaining line", () => {
    const only = [line({ key: "a" })];
    expect(removeLineByKey(only, "a")).toBe(only);
  });
});

describe("savableLines", () => {
  it("drops rows with no description or a non-positive quantity", () => {
    const rows = [
      line({ key: "a", description: "Cement", quantity: "2" }),
      line({ key: "b", description: "   ", quantity: "2" }),
      line({ key: "c", description: "Sand", quantity: "0" }),
      line({ key: "d", description: "Blocks", quantity: "" }),
    ];
    expect(savableLines(rows).map((l) => l.key)).toEqual(["a"]);
  });
});

describe("groupLinesIntoSections", () => {
  it("orders sections by each heading's first appearance", () => {
    const sections = groupLinesIntoSections([
      line({ key: "a", heading: { kind: "custom", title: "Site prep" } }),
      line({ key: "b", heading: { kind: "category", category: LineCategory.MATERIAL } }),
      line({ key: "c", heading: { kind: "custom", title: "Site prep" } }),
    ]);
    expect(sections.map((s) => [s.title, s.sort])).toEqual([
      ["Site prep", 0],
      ["Materials", 1],
    ]);
    // Two lines under one heading collapse into that heading's section even
    // though another heading came between them in the list.
    expect(sections[0]?.lines.map((l) => l.key)).toEqual(["a", "c"]);
  });

  it("keeps two custom headings with the same text as one section", () => {
    const sections = groupLinesIntoSections([
      line({ key: "a", heading: { kind: "custom", title: "Extras" } }),
      line({ key: "b", heading: { kind: "custom", title: "Extras" } }),
    ]);
    expect(sections).toHaveLength(1);
  });

  it("is empty for no lines", () => {
    expect(groupLinesIntoSections([])).toEqual([]);
  });
});

describe("lineToLineInput", () => {
  it("trims the description and converts the price to integer cents", () => {
    const input = lineToLineInput(
      line({ description: "  Cement  ", quantity: "3", unitPriceDollars: "1250.50" }),
    );
    expect(input.description).toBe("Cement");
    expect(input.quantity).toBe(3);
    expect(input.unitPriceCents).toBe(125_050);
    expect(input.category).toBe(LineCategory.MATERIAL);
  });

  /**
   * REPLACES a test that asserted the opposite — that a line under a custom
   * heading was sent as OTHER. That was the old design, where a line's category
   * was read off whichever heading it happened to sit under, so a bag of cement
   * filed under "Site prep" was quietly recorded as OTHER. Heading decides
   * where a line PRINTS; kind decides what it IS. Choosing a document layout
   * should not rewrite the data, so category now follows the line's kind and
   * the heading is free to be anything.
   */
  it("keeps the line's own category under a custom heading", () => {
    const l = line({ kind: LineKind.MATERIAL, heading: { kind: "custom", title: "Site prep" } });
    expect(lineToLineInput(l).category).toBe(LineCategory.MATERIAL);
  });

  it("still sends a job line as OTHER — a composite service is no single category", () => {
    const l = line({ kind: LineKind.JOB, heading: { kind: "custom", title: "Site prep" } });
    expect(lineToLineInput(l).category).toBe(LineCategory.OTHER);
  });

  it("sends unitLabel when the line has one, and omits the key entirely when it does not", () => {
    expect(lineToLineInput(line({ unitLabel: "bag" })).unitLabel).toBe("bag");
    expect("unitLabel" in lineToLineInput(line())).toBe(false);
    // A blank label would print as an empty unit; treat it as absent.
    expect("unitLabel" in lineToLineInput(line({ unitLabel: "" }))).toBe(false);
  });

  it("omits every job field on a plain line", () => {
    const input = lineToLineInput(line());
    expect("jobId" in input).toBe(false);
    expect("jobComponents" in input).toBe(false);
  });

  it("carries the whole job snapshot on a job-type line", () => {
    const input = lineToLineInput(
      line({
        jobId: "a1",
        jobName: "Tiling",
        jobUnit: "sq ft",
        jobComponents: [
          {
            kind: JobComponentKind.MATERIAL,
            description: "Tile",
            quantityPerUnit: 1,
            unitPriceCents: 100,
          },
        ],
      }),
    );
    expect(input).toMatchObject({ jobId: "a1", jobName: "Tiling", jobUnit: "sq ft" });
    expect(input.jobComponents).toHaveLength(1);
  });
});

describe("lineToInvoiceLineInput", () => {
  it("carries unitLabel onto the invoice payload — the invoice PDF prints it, not rateUnit's label", () => {
    const input = lineToInvoiceLineInput(line({ unitLabel: "bag" }), 0);
    expect(input.unitLabel).toBe("bag");
  });

  it("sets the line's position within its section", () => {
    expect(lineToInvoiceLineInput(line(), 3).sort).toBe(3);
  });

  it("is otherwise the quote line payload — the API validates both against one schema", () => {
    const l = line({ description: "Cement", quantity: "2", unitPriceDollars: "10" });
    const { sort, ...rest } = lineToInvoiceLineInput(l, 0);
    expect(sort).toBe(0);
    expect(rest).toEqual(lineToLineInput(l));
  });
});

describe("unitOptions — one list for both vocabularies", () => {
  const units = [{ label: "bag" }, { label: "sheet" }, { label: "drum", custom: true }];

  it("offers the time units so a labour line can still be set to a day", () => {
    // The regression this replaces: with only the material vocabulary, a
    // labour line on an invoice could not be moved off whatever rateUnit it
    // happened to carry.
    const labels = unitOptions({ rateUnit: RateUnit.UNIT }, units).map((o) => o.label);
    expect(labels).toContain("day");
    expect(labels).toContain("hour");
  });

  it("offers the material units alongside them", () => {
    const labels = unitOptions({ rateUnit: RateUnit.UNIT }, units).map((o) => o.label);
    expect(labels).toContain("bag");
    expect(labels).toContain("sheet");
  });

  it("marks a tenant's own unit as theirs", () => {
    const opt = unitOptions({ rateUnit: RateUnit.UNIT }, units).find((o) => o.value === "drum");
    expect(opt?.label).toBe("drum (yours)");
  });

  it("keeps a snapshot label the vocabulary no longer has", () => {
    // A unit renamed or deleted since the line was written must not silently
    // blank the unit on a document already sent.
    const opts = unitOptions({ rateUnit: RateUnit.UNIT, unitLabel: "keg" }, units);
    expect(opts.some((o) => o.value === "keg")).toBe(true);
  });

  it("does not duplicate a snapshot the vocabulary still offers", () => {
    const opts = unitOptions({ rateUnit: RateUnit.UNIT, unitLabel: "bag" }, units);
    expect(opts.filter((o) => o.value === "bag")).toHaveLength(1);
  });
});

describe("unitValue / applyUnitChoice — routing to the right field", () => {
  it("shows the sold-by snapshot when the line has one", () => {
    expect(unitValue({ rateUnit: RateUnit.DAY, unitLabel: "bag" })).toBe("bag");
  });

  it("falls back to the rate unit when it does not", () => {
    expect(unitValue({ rateUnit: RateUnit.DAY })).toBe("rate:DAY");
  });

  it("treats a blank snapshot as absent", () => {
    expect(unitValue({ rateUnit: RateUnit.HOUR, unitLabel: "   " })).toBe("rate:HOUR");
  });

  it("routes a material unit to unitLabel", () => {
    expect(applyUnitChoice("bag")).toEqual({ unitLabel: "bag" });
  });

  it("routes a time unit to rateUnit AND clears the snapshot", () => {
    // Without the clear, a line switched from "bag" to "day" would keep
    // printing "bag" — unitLabel wins on the document.
    expect(applyUnitChoice("rate:DAY")).toEqual({ rateUnit: RateUnit.DAY, unitLabel: undefined });
  });

  it("round-trips: what unitValue shows is what applyUnitChoice accepts", () => {
    const line = { rateUnit: RateUnit.WEEK };
    expect(applyUnitChoice(unitValue(line))).toEqual({ rateUnit: RateUnit.WEEK, unitLabel: undefined });
  });
});

function favourite(over: Partial<MaterialFavourite> = {}): MaterialFavourite {
  return {
    id: "f1",
    name: "Tile",
    priceCents: 250_000,
    priceDollars: 2500,
    ...over,
  };
}

describe("coverageConfigFromFavourite", () => {
  it("reads a fully-configured material's coverage setup", () => {
    expect(
      coverageConfigFromFavourite(
        favourite({ measureUnit: "m²", coveragePerSellUnit: 1.5, wastePct: 10 }),
      ),
    ).toEqual({ measureUnit: "m²", coveragePerSellUnit: 1.5, wastePct: 10 });
  });

  it("is null for a material with no coverage configured — the normal case", () => {
    expect(coverageConfigFromFavourite(favourite())).toBeNull();
  });

  it("is null when coveragePerSellUnit is set but measureUnit is missing", () => {
    // Coverage with no measure unit is an unlabelled number.
    expect(coverageConfigFromFavourite(favourite({ coveragePerSellUnit: 1.5 }))).toBeNull();
  });

  it("is null when measureUnit is set but coveragePerSellUnit is missing", () => {
    expect(coverageConfigFromFavourite(favourite({ measureUnit: "m²" }))).toBeNull();
  });

  it("is null for a zero or negative coveragePerSellUnit", () => {
    expect(coverageConfigFromFavourite(favourite({ measureUnit: "m²", coveragePerSellUnit: 0 }))).toBeNull();
    expect(coverageConfigFromFavourite(favourite({ measureUnit: "m²", coveragePerSellUnit: -1 }))).toBeNull();
  });

  it("is null when the favourite itself is undefined", () => {
    expect(coverageConfigFromFavourite(undefined)).toBeNull();
  });
});

describe("coverageConfigForLine", () => {
  const favourites = [
    favourite({ id: "f1", measureUnit: "m²", coveragePerSellUnit: 1.5, wastePct: 10 }),
    favourite({ id: "f2", name: "Sand" }),
  ];

  it("looks up the line's picked material by materialFavouriteId", () => {
    expect(coverageConfigForLine({ materialFavouriteId: "f1" }, favourites)).toEqual({
      measureUnit: "m²",
      coveragePerSellUnit: 1.5,
      wastePct: 10,
    });
  });

  it("is null for a line with no picked material", () => {
    expect(coverageConfigForLine({ materialFavouriteId: undefined }, favourites)).toBeNull();
  });

  it("is null when the picked material has no coverage configured", () => {
    expect(coverageConfigForLine({ materialFavouriteId: "f2" }, favourites)).toBeNull();
  });

  it("is null when materialFavouriteId points at nothing in the list", () => {
    expect(coverageConfigForLine({ materialFavouriteId: "missing" }, favourites)).toBeNull();
  });
});

describe("computeCoverageQuantity", () => {
  const config: CoverageConfig = { measureUnit: "m²", coveragePerSellUnit: 4, wastePct: 10 };

  it("rounds up to whole sell units and explains the working, waste included", () => {
    // 40 m² + 10% waste = 44 m² / 4 m² per box = 11 boxes exactly.
    const result = computeCoverageQuantity("40", config, "box");
    expect(result).toEqual({
      quantity: "11",
      explanation: "40 m² + 10% waste = 44 m² → 11 box",
    });
  });

  it("rounds UP a non-exact division rather than truncating", () => {
    // 10 m² + 10% waste = 11 m² / 4 = 2.75 -> 3 boxes, not 2.
    const result = computeCoverageQuantity("10", config, "box");
    expect(result?.quantity).toBe("3");
  });

  it("omits the waste clause when wastePct is unset", () => {
    const noWaste: CoverageConfig = { measureUnit: "m²", coveragePerSellUnit: 4 };
    const result = computeCoverageQuantity("40", noWaste, "box");
    expect(result?.explanation).toBe("40 m² = 40 m² → 10 box");
  });

  it("is null for a blank measured quantity — callers must leave `quantity` untouched", () => {
    expect(computeCoverageQuantity("", config, "box")).toBeNull();
    expect(computeCoverageQuantity("   ", config, "box")).toBeNull();
  });

  it("is null for a zero or negative measured quantity", () => {
    expect(computeCoverageQuantity("0", config, "box")).toBeNull();
    expect(computeCoverageQuantity("-5", config, "box")).toBeNull();
  });

  it("is null for unparseable text", () => {
    expect(computeCoverageQuantity("abc", config, "box")).toBeNull();
  });

  it("returns the SELL-UNIT count, never the measured quantity — the line's quantity " +
    "must stay boxes, not m², or every total computed from it is wrong", () => {
    const result = computeCoverageQuantity("40", config, "box");
    expect(result?.quantity).not.toBe("40");
    expect(Number(result?.quantity)).toBeLessThan(40);
  });
});

/**
 * The kind/heading split. These pin the distinction the redesign rests on:
 * a line's kind says what it is and drives its library, units and price;
 * its heading only says where it prints.
 */
describe("line kinds", () => {
  it("maps each kind to the category it saves as", () => {
    expect(categoryForKind(LineKind.MATERIAL)).toBe(LineCategory.MATERIAL);
    expect(categoryForKind(LineKind.LABOUR)).toBe(LineCategory.LABOUR);
    expect(categoryForKind(LineKind.EQUIPMENT)).toBe(LineCategory.EQUIPMENT);
    // A composite priced service is not a material or a labour rate; the jobId
    // it carries is what identifies it, so no DB enum value is needed.
    expect(categoryForKind(LineKind.JOB)).toBe(LineCategory.OTHER);
  });

  describe("kindFromSaved — documents predate the kind field", () => {
    it("treats a jobId as decisive, whatever the saved category says", () => {
      // Job lines save as OTHER, so category alone cannot identify them.
      expect(kindFromSaved(LineCategory.OTHER, "job-1")).toBe(LineKind.JOB);
      expect(kindFromSaved(LineCategory.MATERIAL, "job-1")).toBe(LineKind.JOB);
    });

    it("infers from the saved category when there is no job", () => {
      expect(kindFromSaved(LineCategory.LABOUR)).toBe(LineKind.LABOUR);
      expect(kindFromSaved(LineCategory.MATERIAL)).toBe(LineKind.MATERIAL);
      // RENTAL has no kind of its own and is equipment in every practical sense.
      expect(kindFromSaved(LineCategory.EQUIPMENT)).toBe(LineKind.EQUIPMENT);
      expect(kindFromSaved(LineCategory.RENTAL)).toBe(LineKind.EQUIPMENT);
    });

    it("falls back to MATERIAL rather than leaving a reopened line kindless", () => {
      // OTHER covers old custom-heading lines of every sort. Guessing the
      // common case beats blanking the row on a quote someone is editing.
      expect(kindFromSaved(LineCategory.OTHER)).toBe(LineKind.MATERIAL);
      expect(kindFromSaved(LineCategory.SUBCONTRACTOR)).toBe(LineKind.MATERIAL);
    });
  });

  describe("applyKindChange", () => {
    it("drops every tie to the old library", () => {
      // A job's component snapshot surviving onto a material line would render
      // a breakdown for work the line no longer represents; a stale
      // materialFavouriteId would make ★ Save-as-favourite overwrite an
      // unrelated material.
      const patch = applyKindChange(LineKind.MATERIAL);
      expect(patch.jobId).toBeUndefined();
      expect(patch.jobComponents).toBeUndefined();
      expect(patch.materialFavouriteId).toBeUndefined();
      expect(patch.unitLabel).toBeUndefined();
      expect(patch.kind).toBe(LineKind.MATERIAL);
    });

    it("does not touch what the user typed", () => {
      // Reclassifying a line is not resetting it — someone who typed
      // "Skim coat, 40 @ 1200" and then moved it to Labour keeps their work.
      const patch = applyKindChange(LineKind.LABOUR);
      expect("description" in patch).toBe(false);
      expect("quantity" in patch).toBe(false);
      expect("unitPriceDollars" in patch).toBe(false);
      expect("heading" in patch).toBe(false);
    });
  });
});

/**
 * Picking a saved row into an EXISTING line — the kind-first "Saved" cell's
 * counterpart to assemblyLine/labourLine (which build a brand-new line).
 * These only patch description/price/library-linkage fields; quantity and
 * heading are the caller's line's own and must not appear in the patch.
 */
describe("picking a saved row onto an existing line", () => {
  const job: Job = {
    id: "a1",
    name: "Tiling",
    unit: "sq ft",
    markupPct: 20,
    unitCostCents: 45_000,
    components: [
      {
        id: "c1",
        kind: JobComponentKind.MATERIAL,
        description: "Tile",
        quantityPerUnit: 1.1,
        unitPriceCents: 30_000,
        sort: 0,
      },
    ],
  };
  const rate: LabourRate = {
    id: "lr1",
    trade: "Mason",
    rateCents: 350_000,
    rateDollars: 3500,
    rateUnit: RateUnit.DAY,
  };

  describe("applyJobPick", () => {
    it("sets description, price, unit snapshot and the component snapshot", () => {
      const patch = applyJobPick(job);
      expect(patch).toMatchObject({
        description: "Tiling",
        unitPriceDollars: "450",
        unitLabel: "sq ft",
        jobId: "a1",
        jobName: "Tiling",
        jobUnit: "sq ft",
      });
      expect(patch.jobComponents).toHaveLength(1);
    });

    it("leaves quantity and heading out of the patch — the line's own stay put", () => {
      const patch = applyJobPick(job);
      expect("quantity" in patch).toBe(false);
      expect("heading" in patch).toBe(false);
    });

    it("sets the same fields assemblyLine sets on a brand-new line", () => {
      const fresh = assemblyLine(job, 3);
      const picked = applyJobPick(job);
      expect(picked.description).toBe(fresh.description);
      expect(picked.unitPriceDollars).toBe(fresh.unitPriceDollars);
      expect(picked.unitLabel).toBe(fresh.unitLabel);
      expect(picked.jobComponents).toEqual(fresh.jobComponents);
    });
  });

  describe("applyLabourRatePick", () => {
    it("sets description, cadence and price, and clears any sold-by snapshot", () => {
      expect(applyLabourRatePick(rate)).toEqual({
        description: "Mason",
        rateUnit: RateUnit.DAY,
        unitPriceDollars: "3500",
        unitLabel: undefined,
      });
    });

    it("names the skill tier when the rate has one", () => {
      expect(applyLabourRatePick({ ...rate, skillTier: "Senior" }).description).toBe("Mason — Senior");
    });

    it("leaves quantity and heading out of the patch", () => {
      const patch = applyLabourRatePick(rate);
      expect("quantity" in patch).toBe(false);
      expect("heading" in patch).toBe(false);
    });
  });

  describe("materialPickPatch", () => {
    it("composes the description, sets price/unit and stamps the favourite id", () => {
      const fav = favourite({ id: "f1", name: "Tile", unit: "box", priceCents: 250_000, priceDollars: 2500 });
      expect(materialPickPatch(fav)).toEqual({
        description: "Tile",
        unitPriceDollars: "2500",
        unitLabel: "box",
        materialFavouriteId: "f1",
      });
    });

    it("appends spec values for an uncategorized/legacy material", () => {
      const fav = favourite({ specs: { Length: "16ft", Grade: "Select" } });
      expect(materialPickPatch(fav).description).toBe("Tile 16ft x Select");
    });
  });

  describe("jobPickerOptions", () => {
    const jobs = [
      { id: "a1", name: "Tiling", unit: "sq ft", unitCostCents: 45_000 },
      { id: "a2", name: "Painting", unit: "gal", unitCostCents: 12_000 },
    ];

    it("lists the job library plus a leading placeholder", () => {
      const opts = jobPickerOptions({ jobId: undefined, jobName: undefined }, jobs);
      expect(opts.map((o) => o.value)).toEqual(["", "a1", "a2"]);
      expect(opts[0]?.label).toBe("Select a job…");
    });

    it("says so when the library is empty", () => {
      expect(jobPickerOptions({ jobId: undefined, jobName: undefined }, []).at(0)?.label).toBe(
        "No saved jobs yet",
      );
    });

    it("adds no synthetic option when the line's jobId is still in the library", () => {
      const opts = jobPickerOptions({ jobId: "a1", jobName: "Tiling" }, jobs);
      expect(opts.filter((o) => o.value === "a1")).toHaveLength(1);
    });

    it("synthesizes an option for a jobId no longer in the library — a reopened JOB " +
      "line must show the job it came from, not an empty placeholder", () => {
      const opts = jobPickerOptions({ jobId: "gone", jobName: "Old roofing job" }, jobs);
      const synthetic = opts.find((o) => o.value === "gone");
      expect(synthetic?.label).toContain("Old roofing job");
    });
  });

  describe("applyJobUnitEdit", () => {
    it("keeps jobUnit and unitLabel in sync so the edited unit actually prints", () => {
      expect(applyJobUnitEdit("linear ft")).toEqual({ jobUnit: "linear ft", unitLabel: "linear ft" });
    });

    it("clears unitLabel (but not jobUnit) when the field is emptied", () => {
      expect(applyJobUnitEdit("")).toEqual({ jobUnit: "", unitLabel: undefined });
    });
  });
});

describe("equipment picking", () => {
  const item = {
    id: "eq1",
    name: "Concrete mixer",
    owned: false,
    rateCents: 450_000,
    rateDollars: 4500,
    rateUnit: RateUnit.DAY,
  };

  it("takes the name, hire cadence and rate from the saved item", () => {
    const patch = applyEquipmentPick(item);
    expect(patch.description).toBe("Concrete mixer");
    expect(patch.rateUnit).toBe(RateUnit.DAY);
    expect(patch.unitPriceDollars).toBe("4500");
  });

  it("clears unitLabel, so a leftover sold-by unit cannot print beside a daily rate", () => {
    // Equipment is denominated in the rateUnit vocabulary like labour, not in
    // a material's sold-by units. A line that was previously a bag of cement
    // would otherwise still print "bag" next to a per-day hire.
    expect(applyEquipmentPick(item).unitLabel).toBeUndefined();
  });

  it("leaves quantity, heading and kind alone — picking is not resetting", () => {
    const patch = applyEquipmentPick(item);
    expect("quantity" in patch).toBe(false);
    expect("heading" in patch).toBe(false);
    expect("kind" in patch).toBe(false);
  });

  describe("equipmentPickerOptions", () => {
    it("labels each item with its rate so the list is choosable without opening it", () => {
      const opts = equipmentPickerOptions([item]);
      expect(opts).toHaveLength(2);
      expect(opts[1]?.value).toBe("eq1");
      expect(opts[1]?.label).toContain("Concrete mixer");
      expect(opts[1]?.label).toContain("/day");
    });

    it("says the library is empty rather than showing a bare placeholder", () => {
      expect(equipmentPickerOptions([])[0]?.label).toBe("No saved equipment yet");
      expect(equipmentPickerOptions([item])[0]?.label).toBe("Select equipment…");
    });
  });
});
