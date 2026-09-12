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
