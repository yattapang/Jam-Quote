import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every string a contractor can send should have a bound. This pins the ones
 * that do not, so the next unbounded field fails rather than joining a list
 * nobody counts.
 *
 * ## What an unbounded string actually costs
 *
 * Express caps a JSON body at 100kb by default, so this is not a way to fill the
 * database. What 100kb in one field DOES do:
 *
 * - a quote PDF that never renders, or renders as forty blank pages
 * - a CSV cell an accountant cannot read, in a file that opens fine
 * - a list screen where one row pushes every other off the page
 *
 * None of those fail loudly. They fail in front of the contractor's client.
 *
 * ## What it took to get here
 *
 * The count went 29 -> 11 -> 58 -> 0, and each step is worth knowing.
 *
 * **29** was the first measurement. Sharing the client and project field rules
 * across the REST and sync doors bounded **18 of them as a side effect**, which
 * is the argument for fixing a seam rather than patching each side.
 *
 * **11** was wrong. The guard counted `.min()` as a constraint, and `.min(1)`
 * stops an empty string while saying nothing about a 100kb one. Correcting it to
 * require an UPPER bound revealed **58**.
 *
 * **0** now. Limits are far beyond what a real contractor types — `terms` allows
 * 5000 characters, `description` 500 — because the point is to stop a payload,
 * not to police wording.
 */

const SRC = join(process.cwd(), "src");

/**
 * Anything that puts a CEILING on the value.
 *
 * `.min()` is deliberately absent, and its absence is the whole point. The first
 * version of this guard counted it, on the reasoning that a constrained field is
 * a checked field — but `.min(1)` stops an EMPTY string and says nothing about a
 * 100kb one, which is the failure this test exists to prevent. Counting it hid
 * 47 fields: the guard reported 11 unbounded when the real figure was 58.
 */
const UPPER_BOUNDS = [
  ".max(", ".length(", ".email(", ".uuid(", ".url(",
  ".regex(", ".datetime(", ".date(", ".cuid(", ".ip(",
];

/**
 * Fields allowed to have no upper bound.
 *
 * **Empty, and it should stay empty.** Adding a name here to make a test pass is
 * the failure this guard exists to prevent — bound the field instead.
 */
const KNOWN_UNBOUNDED: Record<string, string[]> = {
  // EMPTY, and it should stay that way. Every string input has an upper bound.
  // If a new field needs to go here, that is a decision to argue for in the diff
  // rather than a place to park one.
};

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/** Every `field: z.string()...` in a DTO, and whether its value is constrained. */
function stringFields(src: string): { name: string; constrained: boolean }[] {
  const out: { name: string; constrained: boolean }[] = [];
  for (const line of stripComments(src).split("\n")) {
    const m = line.match(/^\s{2,}([A-Za-z_]\w*)\s*:\s*(z\.string\(\).*)$/);
    if (!m?.[1] || !m[2]) continue;
    out.push({ name: m[1], constrained: UPPER_BOUNDS.some((c) => m[2]!.includes(c)) });
  }
  return out;
}

function dtoModules(): { module: string; src: string }[] {
  const out: { module: string; src: string }[] = [];
  for (const dir of readdirSync(SRC)) {
    const dto = join(SRC, dir, `${dir}.dto.ts`);
    if (existsSync(dto)) out.push({ module: dir, src: readFileSync(dto, "utf8") });
  }
  return out;
}

describe("string inputs are bounded", () => {
  const mods = dtoModules();

  it("finds the DTOs and their string fields, so a rewrite cannot empty this", () => {
    const total = mods.reduce((n, m) => n + stringFields(m.src).length, 0);
    expect(mods.length).toBeGreaterThanOrEqual(12);
    // Measured at 139. A floor well below that catches a restructure without
    // failing every time a field is legitimately added or removed.
    expect(total).toBeGreaterThanOrEqual(120);
  });

  it.each(mods.map((m) => [m.module, m] as const))("%s", (module, mod) => {
    const unbounded = stringFields(mod.src)
      .filter((f) => !f.constrained)
      .map((f) => f.name);

    const allowed = new Set(KNOWN_UNBOUNDED[module] ?? []);
    const unexpected = [...new Set(unbounded.filter((n) => !allowed.has(n)))];

    // A NEW unbounded string. Give it a `.max()` a real contractor cannot hit
    // rather than adding it to KNOWN_UNBOUNDED.
    expect(unexpected).toEqual([]);
  });

  it("does not let the allow-list rot", () => {
    // A name that is no longer unbounded - because someone bounded it, good -
    // must leave the list, or the list stops describing anything and the next
    // reader cannot tell which entries are real.
    const stale: string[] = [];
    for (const { module, src } of mods) {
      const unbounded = new Set(stringFields(src).filter((f) => !f.constrained).map((f) => f.name));
      for (const name of KNOWN_UNBOUNDED[module] ?? []) {
        if (!unbounded.has(name)) stale.push(`${module}.${name}`);
      }
    }
    expect(stale).toEqual([]);
  });
});
