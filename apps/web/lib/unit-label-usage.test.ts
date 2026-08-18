import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A source-scanning guard, not a behaviour test.
 *
 * `lineUnitLabel` (quote-totals.ts) is thoroughly unit-tested and has always
 * been correct. The bug it exists to prevent kept happening anyway, because
 * screens simply did not call it: the quote and invoice detail pages each
 * rendered `RATE_UNIT_LABEL[line.rateUnit]` directly, so a line sold by the
 * metre printed "30 units". Two library pages had gone further and declared
 * their OWN copy of the cadence map.
 *
 * Nothing in the type system objects to any of that — the bypass is a valid
 * lookup on a valid map — and with no DOM tests in this repo, no unit test can
 * observe what a page rendered. So the invariant is enforced where it is
 * actually expressible: over the source text.
 *
 * The rule: a line's unit is resolved in exactly one place. If you need a
 * direct RATE_UNIT_LABEL lookup, it is almost certainly because you are
 * enumerating the cadence vocabulary (building a picker), not labelling a
 * priced row — add the file below with a note saying which.
 */
const ALLOWED = new Set([
  // Defines lineUnitLabel and the map itself.
  "lib/quote-totals.ts",
  // Enumerates the cadences to build the unit picker's options; not a row label.
  "lib/line-editor.ts",
]);

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !entry.includes(".test.")) acc.push(full);
  }
  return acc;
}

const WEB_ROOT = join(__dirname, "..");
const rel = (f: string) => f.slice(WEB_ROOT.length + 1).split("\\").join("/");

describe("a line's unit is resolved in one place", () => {
  const files = sourceFiles(join(WEB_ROOT, "app")).concat(
    sourceFiles(join(WEB_ROOT, "lib")),
    sourceFiles(join(WEB_ROOT, "components")),
  );

  it("no screen indexes RATE_UNIT_LABEL directly", () => {
    const offenders = files.filter(
      (f) => !ALLOWED.has(rel(f)) && readFileSync(f, "utf8").includes("RATE_UNIT_LABEL["),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("no file redeclares the cadence map", () => {
    // A local copy silently drops unitLabel handling and drifts from the real
    // map — both library list pages had one.
    const offenders = files.filter((f) => {
      if (ALLOWED.has(rel(f))) return false;
      const src = readFileSync(f, "utf8");
      return /HOUR:\s*"hour"/.test(src) && /UNIT:\s*"unit"/.test(src);
    });
    expect(offenders.map(rel)).toEqual([]);
  });
});
