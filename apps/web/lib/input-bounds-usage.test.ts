import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { BOUNDS } from "@jamquote/core";

/**
 * A numeric input a contractor types into is bounded, and bounded from `BOUNDS`.
 *
 * ## The defect
 *
 * The server and the form disagreed field by field. `discountPct` was
 * `.min(0).max(100)` in the DTO and a bare `<Input type="number">` on screen, so
 * typing `-10` produced a save that failed — and before F28 it failed with the words
 * "Validation failed" and no field named. Same for GCT, Rate, Price, and
 * `coveragePerSellUnit`, which allowed `0` against a `.positive()` server rule.
 *
 * The telling detail: `QuoteBuilder`'s Deposit field, two lines from Discount,
 * already carried `min={0}` and a conditional `max={100}`. The pattern was known and
 * simply not applied — which is what a shared definition fixes and a second
 * hand-typed copy does not.
 *
 * ## What this asserts
 *
 * That no numeric input carries a hand-written bound. A literal `min={0}` is not
 * wrong today, but it is a second copy of a server rule, and this repo's recurring
 * defect is exactly that: two places holding one fact until they disagree. Spending
 * `BOUNDS` means the DTO and the form move together or not at all.
 *
 * Percentages and money are in scope. A count with an obvious floor of zero — a page
 * size, a row index — is not a server-validated contract and is allow-listed by name
 * with its reason.
 */

const WEB = process.cwd();

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith("."))
      continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Files allowed a hand-written numeric bound, each with the reason.
 *
 * A name here must be a bound that is NOT a server-validated contract. "It was
 * failing" is not a reason.
 */
const ALLOWED: Record<string, string> = {
  "app/admin/AdminConsole.tsx":
    "staff pricing and rule-pack editors — platform configuration, not a contractor's form, and its DTO bounds live in billing.dto/rulepack.dto",
  "components/forms/ProjectForm.tsx":
    "retention and progress already carry min/max/step matching projects.dto; converting them is worthwhile but is a separate edit and they are not currently wrong",
  "app/(app)/reports/page.tsx":
    "date-range inputs, bounded by the range itself rather than by a DTO rule",
};

const files = sourceFiles(join(WEB, "app"))
  .concat(sourceFiles(join(WEB, "components")))
  .map((file) => ({
    file: file.slice(WEB.length + 1).split(sep).join("/"),
    src: readFileSync(file, "utf8"),
  }));

/** `min={0}` / `max={100}` / `min="0"` — a bound written by hand. */
const LITERAL_BOUND = /\b(?:min|max)\s*=\s*(?:\{-?\d|"-?\d)/;

describe("numeric inputs spend the shared BOUNDS", () => {
  it("finds the form source, so a move cannot empty this guard", () => {
    expect(files.length).toBeGreaterThan(40);
    expect(files.some((f) => f.file.includes("QuoteBuilder"))).toBe(true);
    expect(files.some((f) => f.file.includes("MaterialForm"))).toBe(true);
  });

  it("no form writes a numeric bound by hand", () => {
    const offenders = files
      .filter((f) => LITERAL_BOUND.test(f.src) && !(f.file in ALLOWED))
      .map((f) => f.file);
    // Import BOUNDS from core and spend it: `min={BOUNDS.discountPct.min}`. The DTO
    // spends the same value, so the two cannot drift.
    expect(offenders).toEqual([]);
  });

  it("does not let the allow-list rot", () => {
    const present = new Set(files.map((f) => f.file));
    expect(Object.keys(ALLOWED).filter((f) => !present.has(f))).toEqual([]);
  });

  it("the pattern it looks for actually matches, so a pass means something", () => {
    expect(LITERAL_BOUND.test('<Input min={0} />')).toBe(true);
    expect(LITERAL_BOUND.test('<Input max={100} />')).toBe(true);
    expect(LITERAL_BOUND.test('<Input min="0" />')).toBe(true);
    // And does not fire on the shape it is asking for.
    expect(LITERAL_BOUND.test("<Input min={BOUNDS.discountPct.min} />")).toBe(false);
    expect(LITERAL_BOUND.test("<Input min={inputMin(BOUNDS.coveragePerSellUnit)} />")).toBe(false);
  });
});

describe("the bounds themselves are coherent", () => {
  it("every percentage is 0–100", () => {
    for (const key of ["discountPct", "gctRatePct", "depositPct", "progressPct", "retentionPct"] as const) {
      expect(BOUNDS[key].min, key).toBe(0);
      expect(BOUNDS[key].max, key).toBe(100);
    }
  });

  it("a whole-number field carries a step, so the browser cannot offer a fraction", () => {
    // `progressPct` is `.int()` on the server. Without `step: 1` an input accepts
    // 50.5 and the save fails.
    expect(BOUNDS.progressPct.step).toBe(1);
  });

  it("money has no ceiling, because a real contract can be large", () => {
    // Inventing one would refuse legitimate work. The server bounds it as an integer
    // number of cents, which is what stops a payload.
    // `in` rather than a property read: `as const` narrows the object so a bound
    // without a max has no `max` to read, which is itself the guarantee.
    expect("max" in BOUNDS.moneyDollars).toBe(false);
    expect(BOUNDS.moneyDollars.min).toBe(0);
  });

  it("coverage is positive-only, matching the server's .positive()", () => {
    expect(BOUNDS.coveragePerSellUnit.positiveOnly).toBe(true);
  });
});
