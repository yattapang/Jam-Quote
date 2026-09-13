import { describe, expect, it } from "vitest";
import { updateRulePackSchema } from "./rulepack.dto.js";
import { createRegulatoryUpdateSchema } from "../admin/admin.dto.js";

/**
 * The DTO half of the `javascript:` defect.
 *
 * Both of these fields were `z.string().url()`, which accepts `javascript:` — and both
 * are rendered as an `href`, one of them on the contractor dashboard's regulatory feed,
 * which is tenant-facing. The acceptance was confirmed by executing the schema, not by
 * reading it, and these tests exist so the schema cannot quietly loosen again.
 */

const regulatory = { title: "GCT rate change", category: "TAX", summary: "s" };

describe("sourceUrl on the rule pack", () => {
  it("refuses a javascript: URL", () => {
    const result = updateRulePackSchema.safeParse({ sourceUrl: "javascript:alert(1)" });
    expect(result.success).toBe(false);
  });

  it("refuses one inside the sources list, not just the single field", () => {
    // The list is what a verifier is told to check, and it had the same rule.
    const result = updateRulePackSchema.safeParse({
      sources: ["https://taj.gov.jm/a", "javascript:alert(1)"],
    });
    expect(result.success).toBe(false);
  });

  it("still accepts a real government page, and a cleared field", () => {
    expect(
      updateRulePackSchema.safeParse({ sourceUrl: "https://www.jamaicatax.gov.jm/gct" }).success,
    ).toBe(true);
    // `""` and null both clear it; that behaviour is unchanged.
    expect(updateRulePackSchema.safeParse({ sourceUrl: "" }).success).toBe(true);
    expect(updateRulePackSchema.safeParse({ sourceUrl: null }).success).toBe(true);
  });
});

describe("verifiedAsOf on the rule pack", () => {
  it("refuses a date that is not a real calendar date, matching the client's own check", () => {
    // S12: the client used a shape-only regex that accepted "2026-02-31"; the DTO's
    // z.string().date() already rejects it, and the client now shares the same
    // calendar-aware check (isIsoDate, in @jamquote/core) so the two cannot drift.
    const result = updateRulePackSchema.safeParse({ verifiedAsOf: "2026-02-31" });
    expect(result.success).toBe(false);
  });

  it("still accepts a real date", () => {
    expect(updateRulePackSchema.safeParse({ verifiedAsOf: "2026-02-28" }).success).toBe(true);
  });
});

describe("statutoryCustom code", () => {
  const row = { label: "New levy", appliesTo: "BOTH" as const };

  it("refuses a whitespace-only code instead of storing it as empty", () => {
    // `.min(1)` used to run BEFORE the trim, so "   " passed the length floor
    // and the trim (done inside .transform) only emptied it out afterwards —
    // storing a blank code that then merges into every tenant's rule pack.
    const result = updateRulePackSchema.safeParse({ statutoryCustom: [{ ...row, code: "   " }] });
    expect(result.success).toBe(false);
  });

  it("still trims and normalises a real code", () => {
    const result = updateRulePackSchema.safeParse({
      statutoryCustom: [{ ...row, code: "  new levy  " }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.statutoryCustom?.[0]?.code).toBe("NEW_LEVY");
  });
});

describe("sourceUrl on a regulatory update", () => {
  it("refuses a javascript: URL on the feed the contractor dashboard links", () => {
    const result = createRegulatoryUpdateSchema.safeParse({
      ...regulatory,
      sourceUrl: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("still accepts a real source", () => {
    expect(
      createRegulatoryUpdateSchema.safeParse({
        ...regulatory,
        sourceUrl: "https://www.jamaicatax.gov.jm/notices",
      }).success,
    ).toBe(true);
  });
});
