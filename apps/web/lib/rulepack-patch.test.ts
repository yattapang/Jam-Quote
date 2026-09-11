import { describe, expect, it } from "vitest";
import { buildRulePackPatch, normaliseCode, type RulePackEdits } from "./rulepack-patch";

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
    const patch = buildRulePackPatch(base);
    expect(patch).not.toHaveProperty("statutoryCustom");
    expect(patch).not.toHaveProperty("statutoryRetired");
  });

  it("sends them EMPTY once touched, so the last entry can be removed", () => {
    // The opposite defect: omitting an empty list made retirement a one-way door —
    // un-retiring the last contribution sent nothing and reported "Saved".
    const patch = buildRulePackPatch({ ...base, contributionsTouched: true });
    expect(patch.statutoryRetired).toEqual([]);
    expect(patch.statutoryCustom).toEqual([]);
  });

  it("sends what the admin edited, not what is non-empty", () => {
    const patch = buildRulePackPatch({
      ...base,
      contributionsTouched: true,
      retired: ["HEART"],
      custom: [{ code: "CESS", label: "Parish cess", appliesTo: "BOTH", employeePct: 1 }],
    });
    expect(patch.statutoryRetired).toEqual(["HEART"]);
    expect(patch.statutoryCustom).toHaveLength(1);
  });

  it("treats sources the same way, by its own flag", () => {
    expect(buildRulePackPatch(base)).not.toHaveProperty("sources");
    const touched = buildRulePackPatch({
      ...base,
      sourcesTouched: true,
      sourcesDraft: " https://a.example/x \n\n https://b.example/y ",
    });
    expect(touched.sources).toEqual(["https://a.example/x", "https://b.example/y"]);
    // Cleared deliberately is not the same as untouched.
    expect(buildRulePackPatch({ ...base, sourcesTouched: true, sourcesDraft: "" }).sources).toEqual(
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
    });
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
      });
      expect(patch.statutoryRates, typed).not.toHaveProperty("EDUCATION_TAX");
    }
  });

  it("keeps the rate when no custom entry claims it", () => {
    const patch = buildRulePackPatch({ ...base, contributionsTouched: true });
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
    const patch = buildRulePackPatch(base);
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
    });
    expect(patch.verifiedAsOf).toBeNull();
    expect(patch.sourceUrl).toBeNull();
  });

  it("sends a blank statutory rate as null, because unsourced is a fact", () => {
    const patch = buildRulePackPatch({
      ...base,
      form: { ...base.form, statutory: { NIS: { employeePct: "", employerPct: "3" } } },
    });
    expect(patch.statutoryRates?.NIS).toEqual({ employeePct: null, employerPct: 3 });
  });

  it("trims what it sends, so a trailing space cannot fail the server's length check", () => {
    const patch = buildRulePackPatch({
      ...base,
      form: { ...base.form, taxLabel: "  GCT  ", sourceUrl: "  https://x.example/y  " },
    });
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
