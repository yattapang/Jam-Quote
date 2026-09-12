import { describe, expect, it } from "vitest";
import type { UpdateRulePackInput } from "./api-client";
import {
  buildRulePackPatch,
  gridContributionCodes,
  normaliseCode,
  rulePackProblem,
  type RulePackEdits,
} from "./rulepack-patch";

/**
 * What the rule-pack save actually sends.
 *
 * These replace four generations of source-scanning guard. Each generation asserted
 * something about the TEXT of the payload — that a key was not top-level, that an
 * identifier appeared somewhere, that a coercion operator was absent — and a review
 * walked past each one with a rewrite that changed no behaviour: a nested spread,
 * `Object.assign`, a computed key, a constant condition, a coercion hoisted one line
 * above the call. One of them turned out to have been asserting nothing at all for
 * three rewrites, because it parsed an object literal with its braces still on.
 *
 * A payload with a return value does not need a scanner. Every rule below is stated
 * as "given this state, this is sent", so a rewrite that preserves behaviour passes
 * and one that does not fails, whatever it looks like.
 */

const base: RulePackEdits = {
  form: {
    taxLabel: "GCT",
    defaultTaxRatePct: "15",
    verifiedAsOf: "2026-07-10",
    sourceUrl: "https://www.jamaicatax.gov.jm/gct",
    statutory: {
      NIS: { employeePct: "3", employerPct: "3" },
      NHT: { employeePct: "2", employerPct: "3" },
    },
  },
  custom: [],
  retired: [],
  contributionsTouched: false,
  sourcesTouched: false,
  sourcesDraft: "",
};

describe("the complete lists are sent only when edited", () => {
  it("omits them when the admin has not touched contributions", () => {
    // The data-loss path: a failed rule-pack read reports empty override lists in a
    // 200, so a tax-rate-only save must not carry them. An absent list leaves the
    // stored one alone.
    const patch = buildRulePackPatch(base).body;
    expect(patch).not.toHaveProperty("statutoryCustom");
    expect(patch).not.toHaveProperty("statutoryRetired");
  });

  it("sends them EMPTY once touched, so the last entry can be removed", () => {
    // The opposite defect: omitting an empty list made retirement a one-way door —
    // un-retiring the last contribution sent nothing and reported "Saved".
    const patch = buildRulePackPatch({ ...base, contributionsTouched: true }).body;
    expect(patch.statutoryRetired).toEqual([]);
    expect(patch.statutoryCustom).toEqual([]);
  });

  it("sends what the admin edited, not what is non-empty", () => {
    const patch = buildRulePackPatch({
      ...base,
      contributionsTouched: true,
      retired: ["HEART"],
      custom: [{ code: "CESS", label: "Parish cess", appliesTo: "BOTH", employeePct: 1 }],
    }).body;
    expect(patch.statutoryRetired).toEqual(["HEART"]);
    expect(patch.statutoryCustom).toHaveLength(1);
  });

  it("treats sources the same way, by its own flag", () => {
    expect(buildRulePackPatch(base).body).not.toHaveProperty("sources");
    const touched = buildRulePackPatch({
      ...base,
      sourcesTouched: true,
      sourcesDraft: " https://a.example/x \n\n https://b.example/y ",
    });
    expect(touched.body.sources).toEqual(["https://a.example/x", "https://b.example/y"]);
    // Cleared deliberately is not the same as untouched.
    expect(buildRulePackPatch({ ...base, sourcesTouched: true, sourcesDraft: "" }).body.sources).toEqual(
      [],
    );
  });
});

describe("a custom entry owns its code's rate", () => {
  it("drops the grid's rate for a code the custom list has taken over", () => {
    // The live defect: a custom entry coded NIS is consumed in place by
    // `mergeStatutory`, so NIS had two rate inputs. Both were sent and the grid's
    // untouched copy won — editing either saved successfully and changed nothing.
    const patch = buildRulePackPatch({
      ...base,
      contributionsTouched: true,
      custom: [
        { code: "NIS", label: "NIS (revised)", appliesTo: "BOTH", employeePct: 7, employerPct: 7 },
      ],
    }).body;
    expect(patch.statutoryRates).not.toHaveProperty("NIS");
    // The contribution nobody replaced keeps its rate.
    expect(patch.statutoryRates).toHaveProperty("NHT");
  });

  it("matches the code however the admin typed it", () => {
    // The first attempt normalised with `trim().toUpperCase()` and missed the DTO's
    // space-to-underscore step, so "education tax" never matched EDUCATION_TAX and
    // the duplicate input survived.
    for (const typed of ["education tax", " Education Tax ", "EDUCATION_TAX", "education  tax"]) {
      const patch = buildRulePackPatch({
        ...base,
        form: {
          ...base.form,
          statutory: { EDUCATION_TAX: { employeePct: "2", employerPct: "3" } },
        },
        contributionsTouched: true,
        custom: [{ code: typed, label: "Education Tax", appliesTo: "BOTH" }],
      }).body;
      expect(patch.statutoryRates, typed).not.toHaveProperty("EDUCATION_TAX");
    }
  });

  it("keeps the rate when no custom entry claims it", () => {
    const patch = buildRulePackPatch({ ...base, contributionsTouched: true }).body;
    expect(patch.statutoryRates).toEqual({
      NIS: { employeePct: 3, employerPct: 3 },
      NHT: { employeePct: 2, employerPct: 3 },
    });
  });
});

describe("no field is coerced into an omission", () => {
  it("sends every scalar, so a cleared one cannot read as 'leave unchanged'", () => {
    // `Number(x) || undefined`, `?? undefined`, `|| void 0` and
    // `x === "" ? undefined : Number(x)` have each shipped here. The server reads an
    // absent field as "leave unchanged", so the screen said "Saved" over a value
    // that never moved — and the form then repainted the old value, which looks like
    // the number reverting by itself. The caller refuses instead; this always sends.
    const patch = buildRulePackPatch(base).body;
    for (const key of ["taxLabel", "defaultTaxRatePct", "verifiedAsOf", "sourceUrl"] as const) {
      expect(patch, key).toHaveProperty(key);
      expect(patch[key], key).not.toBeUndefined();
    }
  });

  it("distinguishes a cleared nullable from an omitted one", () => {
    // `verifiedAsOf` and `sourceUrl` are `.nullable()`: null CLEARS them, which is a
    // thing the admin can legitimately want. Blank means null, never absent.
    const patch = buildRulePackPatch({
      ...base,
      form: { ...base.form, verifiedAsOf: "  ", sourceUrl: "" },
    }).body;
    expect(patch.verifiedAsOf).toBeNull();
    expect(patch.sourceUrl).toBeNull();
  });

  it("sends a blank statutory rate as null, because unsourced is a fact", () => {
    const patch = buildRulePackPatch({
      ...base,
      form: { ...base.form, statutory: { NIS: { employeePct: "", employerPct: "3" } } },
    }).body;
    expect(patch.statutoryRates?.NIS).toEqual({ employeePct: null, employerPct: 3 });
  });

  it("trims what it sends, so a trailing space cannot fail the server's length check", () => {
    const patch = buildRulePackPatch({
      ...base,
      form: { ...base.form, taxLabel: "  GCT  ", sourceUrl: "  https://x.example/y  " },
    }).body;
    expect(patch.taxLabel).toBe("GCT");
    expect(patch.sourceUrl).toBe("https://x.example/y");
  });
});

describe("normaliseCode", () => {
  it("matches the DTO's transform exactly", () => {
    // `updateRulePackSchema`: .trim().toUpperCase().replace(/\s+/g, "_")
    expect(normaliseCode("  education tax ")).toBe("EDUCATION_TAX");
    expect(normaliseCode("new levy")).toBe("NEW_LEVY");
    expect(normaliseCode("a  b   c")).toBe("A_B_C");
    expect(normaliseCode("NIS")).toBe("NIS");
    expect(normaliseCode("nis")).toBe("NIS");
  });
});

describe("rulePackProblem judges what will be sent", () => {
  it("ignores a stale rate for a code the custom list has taken over", () => {
    // The stuck state a review found. The grid stops rendering NIS the moment a
    // custom entry claims the code, and the payload stops sending it — but the form
    // still holds whatever was typed. Validating the FORM refused every later save
    // with "NIS employee rate must be…", naming an input that had unmounted. The
    // admin could not obey the message: the only escapes were deleting the custom
    // row or reloading and losing every pending edit.
    const edits: RulePackEdits = {
      ...base,
      form: { ...base.form, statutory: { NIS: { employeePct: "150", employerPct: "3" } } },
      contributionsTouched: true,
      custom: [{ code: "NIS", label: "NIS (revised)", appliesTo: "BOTH", employeePct: 7 }],
    };
    expect(rulePackProblem(edits, false)).toBeNull();
    // And the value really is not sent, so nothing was let through either.
    expect(buildRulePackPatch(edits).body.statutoryRates).not.toHaveProperty("NIS");
  });

  it("still refuses an out-of-range rate the patch WILL carry", () => {
    const edits: RulePackEdits = {
      ...base,
      form: { ...base.form, statutory: { NIS: { employeePct: "150", employerPct: "3" } } },
    };
    expect(rulePackProblem(edits, false)).toMatch(/NIS employee/);
  });

  it("refuses to save at all when the stored override could not be read", () => {
    // First, because everything else is a judgement about values this screen may not
    // have: a failed read serves the baseline with empty override lists, which looks
    // exactly like "no override exists".
    expect(rulePackProblem(base, true)).toMatch(/could not be read/);
  });

  it("names the row for a half-typed contribution", () => {
    const withRows = (rows: RulePackEdits["custom"]) =>
      rulePackProblem({ ...base, contributionsTouched: true, custom: rows }, false);
    expect(withRows([{ code: "", label: "x", appliesTo: "BOTH" }])).toMatch(/#1 needs a code/);
    expect(withRows([{ code: "A", label: "", appliesTo: "BOTH" }])).toMatch(/#1 needs a name/);
    expect(
      withRows([{ code: "A", label: "x", appliesTo: "BOTH", employeePct: 150 }]),
    ).toMatch(/#1 employee rate/);
  });

  it("checks custom lengths RAW, because the rows are sent as typed", () => {
    // The server's `.max(40)` runs before its trim/uppercase transform, so a
    // 40-character code with a trailing space passes a trimmed check here and 400s
    // there by array path — the message this function exists to replace.
    const code = "X".repeat(40) + " ";
    expect(
      rulePackProblem(
        { ...base, contributionsTouched: true, custom: [{ code, label: "x", appliesTo: "BOTH" }] },
        false,
      ),
    ).toMatch(/code is too long/);
  });

  it("checks taxLabel TRIMMED, because that is how it is sent", () => {
    const padded = "  " + "G".repeat(16) + "  ";
    expect(rulePackProblem({ ...base, form: { ...base.form, taxLabel: padded } }, false)).toBeNull();
    expect(buildRulePackPatch({ ...base, form: { ...base.form, taxLabel: padded } }).body.taxLabel)
      .toHaveLength(16);
  });

  it("refuses a source line that is not a web address, by position", () => {
    expect(
      rulePackProblem(
        { ...base, sourcesTouched: true, sourcesDraft: "https://a.example/x\nnot a url" },
        false,
      ),
    ).toMatch(/Source #2/);
    // And accepts a cleared box, which is a legitimate edit.
    expect(rulePackProblem({ ...base, sourcesTouched: true, sourcesDraft: "" }, false)).toBeNull();
  });

  it("does not check sources the save will not send", () => {
    // Untouched means omitted, so a bad line left in the box from a previous load
    // must not block an unrelated rate save.
    expect(
      rulePackProblem({ ...base, sourcesTouched: false, sourcesDraft: "not a url" }, false),
    ).toBeNull();
  });
});

describe("gridContributionCodes", () => {
  const baseline = [{ code: "NIS" }, { code: "NHT" }, { code: "EDUCATION_TAX" }, { code: "HEART" }];

  it("offers an input for each baseline contribution", () => {
    expect(gridContributionCodes(baseline, baseline, [])).toEqual([
      "NIS",
      "NHT",
      "EDUCATION_TAX",
      "HEART",
    ]);
  });

  it("does not offer one for a levy the admin added", () => {
    // The first defect: a new levy is APPENDED to the effective list, so rendering
    // the whole list gave it a grid input as well as its own row.
    const effective = [...baseline, { code: "CESS" }];
    expect(gridContributionCodes(effective, baseline, [
      { code: "CESS", label: "Parish cess", appliesTo: "BOTH" },
    ])).not.toContain("CESS");
  });

  it("does not offer one for a baseline code a custom entry REPLACED", () => {
    // The second defect, and the one two fixes missed: `mergeStatutory` consumes a
    // matching custom entry in place, so NIS is still a baseline code and still in
    // the effective list. Filtering to baseline membership alone kept its input, and
    // the grid's copy then beat the custom row.
    const codes = gridContributionCodes(baseline, baseline, [
      { code: "NIS", label: "NIS (revised)", appliesTo: "BOTH", employeePct: 7 },
    ]);
    expect(codes).not.toContain("NIS");
    expect(codes).toContain("NHT");
  });

  it("matches the code however the admin typed it", () => {
    for (const typed of ["nis", " NIS ", "  nis  "]) {
      expect(gridContributionCodes(baseline, baseline, [
        { code: typed, label: "NIS", appliesTo: "BOTH" },
      ]), typed).not.toContain("NIS");
    }
  });

  it("does not treat a spaced-out code as the same contribution", () => {
    // `n i s` normalises to N_I_S, which is a DIFFERENT code — it defines a new levy
    // rather than replacing NIS, so NIS keeps its grid input. I had this wrong in a
    // reply to a review, and this test is what corrected me: the normalisation
    // collapses whitespace to underscores, it does not delete it.
    expect(normaliseCode("n i s")).toBe("N_I_S");
    expect(
      gridContributionCodes(baseline, baseline, [
        { code: "n i s", label: "Something else", appliesTo: "BOTH" },
      ]),
    ).toContain("NIS");
  });

  it("drops a retired code, because the effective list already has", () => {
    // Retirement is core's job; this only reflects what came back.
    const effective = baseline.filter((b) => b.code !== "HEART");
    expect(gridContributionCodes(effective, baseline, [])).not.toContain("HEART");
  });

  it("never invents a code the baseline does not define", () => {
    // A stale override entry must not produce a grid row with no baseline meaning.
    expect(gridContributionCodes([{ code: "GONE" }], baseline, [])).toEqual([]);
  });
});

describe("the wrapper is the guard", () => {
  it("mutating the wrapper does not change what is sent", () => {
    // `Object.assign(patch, { statutoryRetired: [] })` still TYPECHECKS — it returns
    // the same instance — but the body is behind a getter, so the override lands on
    // the wrapper and never reaches the wire. That matters because
    // `statutoryRetired: []` is a REPLACE on the server: it wipes every stored
    // retirement. A review used exactly this against the previous phantom-property
    // brand, where it did reach the payload.
    const patch = buildRulePackPatch(base);
    Object.assign(patch, { statutoryRetired: [], statutoryCustom: [] });
    expect(patch.body).not.toHaveProperty("statutoryRetired");
    expect(patch.body).not.toHaveProperty("statutoryCustom");
  });

  it("a spread of a patch carries no body, so it cannot stand in for one", () => {
    // The other bypass. It is a compile error — a plain object cannot satisfy a
    // class with a private member — and this asserts the runtime reason too, so the
    // point survives a refactor of the type. `body` is a prototype getter, so a
    // spread does not copy it.
    const spread = { ...buildRulePackPatch(base) } as Record<string, unknown>;
    expect(spread.body).toBeUndefined();
  });

  it("the body cannot be reached through .body either", () => {
    // The bypass my own test missed. The getter used to return the payload BY
    // REFERENCE, so `patch.body.statutoryRetired = []` reached the wire — the
    // original spread bypass restored by adding four characters, and
    // `statutoryRetired: []` is the REPLACE that wipes every stored retirement.
    // The getter returns a deep copy now, and is typed Readonly so the assignment
    // does not compile either.
    const patch = buildRulePackPatch({ ...base, contributionsTouched: true, retired: ["NIS"] });
    const escaped = patch.body as UpdateRulePackInput;
    escaped.statutoryRetired = [];
    (escaped.statutoryCustom ??= []).push({ code: "X", label: "X", appliesTo: "BOTH" });
    expect(patch.body.statutoryRetired, "a mutated copy must not reach the patch").toEqual([
      "NIS",
    ]);
    expect(patch.body.statutoryCustom).toEqual([]);
  });

  it("hands back an equal body every time, not the same object", () => {
    const patch = buildRulePackPatch(base);
    expect(patch.body).toEqual(patch.body);
    expect(patch.body).not.toBe(patch.body);
  });

  it("every scalar survives the round trip through the wrapper", () => {
    // The getter must hand back what was built, not a copy that drops fields.
    const patch = buildRulePackPatch({ ...base, contributionsTouched: true });
    expect(patch.body.taxLabel).toBe("GCT");
    expect(patch.body.statutoryRetired).toEqual([]);
  });
});

describe("no scalar can be coerced into an omission, whatever the form holds", () => {
  it("sends all four scalars even when every input is blank", () => {
    // The coverage gap a review found after the payload moved out of the console:
    // the source guard reads `savePricing`/`saveRulepack` in AdminConsole.tsx, and
    // the payload is no longer there — so `taxLabel: x.trim() === "" ? undefined : x`
    // inside the builder was policed by nothing. Stated as behaviour instead: a
    // blank form still SENDS every field, because the server reads an absent field
    // as "leave unchanged" and the screen would say "Saved" over a value that never
    // moved. Blank means null or NaN here; the validator refuses before this runs.
    const blank = buildRulePackPatch({
      ...base,
      form: {
        taxLabel: "",
        defaultTaxRatePct: "",
        verifiedAsOf: "",
        sourceUrl: "",
        statutory: { NIS: { employeePct: "", employerPct: "" } },
      },
    }).body;
    // EXACT values, not `not.toBeUndefined()`. A review injected
    // `taxLabel: x.trim() === "" ? "TAX" : x.trim()` — a blank label silently saved
    // as "TAX", renaming the tax on every quote and invoice — and all 534 web tests
    // stayed green, because "defined" was the whole assertion. "Not undefined" says
    // nothing about whether the value is the one the admin typed.
    expect(blank.taxLabel, "a blank label is sent blank, and the server refuses it").toBe("");
    // `Number("")` is 0, not NaN. An earlier comment here claimed NaN; 0 passes the
    // server's `.min(0)`, so this test cannot lean on the server to catch it — which
    // is exactly why `rulePackProblem` refuses a blank rate before the build.
    expect(blank.defaultTaxRatePct).toBe(0);
    expect(blank.verifiedAsOf).toBeNull();
    expect(blank.sourceUrl).toBeNull();
    for (const key of ["taxLabel", "defaultTaxRatePct", "verifiedAsOf", "sourceUrl"] as const) {
      expect(Object.hasOwn(blank, key), `${key} must be sent, not omitted`).toBe(true);
    }
    // `statutoryRates` too: a blank rate is null, and the key is always present.
    expect(Object.hasOwn(blank, "statutoryRates")).toBe(true);
    expect(blank.statutoryRates?.NIS).toEqual({ employeePct: null, employerPct: null });
  });

  it("sends all four when they hold whitespace, not just when empty", () => {
    const padded = buildRulePackPatch({
      ...base,
      form: { ...base.form, taxLabel: "   ", defaultTaxRatePct: "  ", verifiedAsOf: " ", sourceUrl: " " },
    }).body;
    // Trimmed to the same values a blank form produces — whitespace is not a value.
    expect(padded.taxLabel).toBe("");
    expect(padded.defaultTaxRatePct).toBe(0);
    expect(padded.verifiedAsOf).toBeNull();
    expect(padded.sourceUrl).toBeNull();
    for (const key of ["taxLabel", "defaultTaxRatePct", "verifiedAsOf", "sourceUrl"] as const) {
      expect(Object.hasOwn(padded, key), key).toBe(true);
    }
  });
});
