import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A source-scanning guard, not a behaviour test.
 *
 * A TRN is stored as nine bare digits and read by humans in threes. `formatTrn`
 * does that correctly and is unit-tested — but there are NINE surfaces that
 * render one, and the failure mode in this codebase is never the helper, it is
 * a screen that does not call it (`lineUnitLabel`, `unitRef`, and the material
 * unit before them).
 *
 * Nothing in the type system objects: `business.trn` is a string, and printing
 * it raw is perfectly valid TypeScript that simply looks wrong to a Jamaican
 * contractor checking it against a paper document.
 *
 * The rule: a `.trn` value that reaches the screen goes through `formatTrn`
 * (or `formatTrnInput`, for a field being typed into).
 */
const ALLOWED = new Set([
  // Sends the raw stored value to the API; formatting here would be undone by
  // trnSchema anyway, and the payload is not a display surface.
  "lib/api-client.ts",
  // Fixture data, written already grouped.
  "lib/mock-data.ts",
]);

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if ((entry.endsWith(".tsx") || entry.endsWith(".ts")) && !entry.endsWith(".test.ts"))
      found.push(full);
  }
  return found;
}

describe("every TRN on screen goes through formatTrn", () => {
  const root = process.cwd();
  const files = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "lib")), ...sourceFiles(join(root, "components"))];

  it("finds the render sites at all, so a rename cannot empty this test", () => {
    const rendering = files.filter((f) => readFileSync(f, "utf8").includes("formatTrn"));
    expect(rendering.length).toBeGreaterThanOrEqual(6);
  });

  it("has no screen printing a raw .trn", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(root.length + 1).replace(/\\/g, "/");
      if (ALLOWED.has(rel)) continue;
      const src = readFileSync(file, "utf8");

      // `{something.trn}` or `${something.trn}` rendered directly — the shape
      // that puts 102458963 on an invoice.
      const rawRender = /[{$]\{?\s*[\w.?]*\.trn\b\s*(\|\||\?\?|\})/.test(src);
      if (rawRender && !src.includes("formatTrn")) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
