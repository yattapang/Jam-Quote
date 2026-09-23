import { describe, expect, it } from "vitest";
import { BOUNDS, fitsStep, inputMin } from "../index.js";

/**
 * `inputMin` used to hardcode 0.01 as the HTML `min` for every `positiveOnly`
 * field, regardless of that field's actual `step`. That is correct for a field
 * whose step IS 0.01 (jmdPerUsd is 0.0001 too, so it was already wrong there),
 * but for `coveragePerSellUnit` — step 0.0001 — it blocked a legitimate value
 * like 0.005 that `boundedNumber`/the server happily accepts, while claiming
 * to express "the smallest value the server allows".
 */
describe("inputMin", () => {
  it("uses the bound's own step for a positiveOnly field with a finer step than 0.01", () => {
    expect(BOUNDS.coveragePerSellUnit.positiveOnly).toBe(true);
    const min = inputMin(BOUNDS.coveragePerSellUnit);
    expect(min).toBe(BOUNDS.coveragePerSellUnit.step);
    // The value the browser used to refuse must be >= this min and fit the step.
    expect(0.005).toBeGreaterThanOrEqual(min);
    expect(fitsStep(0.005, BOUNDS.coveragePerSellUnit.step!)).toBe(true);
  });

  it("still falls back to 0.01 for a positiveOnly field with no step", () => {
    const noStepBound = { min: 0, positiveOnly: true } as const;
    expect(inputMin(noStepBound)).toBe(0.01);
  });

  it("returns the plain min for a non-positiveOnly field, ignoring step", () => {
    expect(inputMin(BOUNDS.discountPct)).toBe(BOUNDS.discountPct.min);
  });
});
