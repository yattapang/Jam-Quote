import { describe, expect, it } from "vitest";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parseFile, renderedText, renderedExpressions, collect } from "@jamquote/test-ast";

/**
 * Guard: no user-visible string in apps/web/app or apps/web/components says the
 * old product name ("JamQuote") any more — ADR 0009 renamed the product to
 * Pryvis for every surface a customer or their client sees.
 *
 * Scans, via the shared TypeScript-compiler-backed parser (never a regex over
 * source text — that is what a spelling-only rewrite defeats):
 *   - JSX text rendered as element content (`renderedText`)
 *   - string literals rendered inside `{...}` JSX expressions (`renderedExpressions`)
 *   - every OTHER string literal in the file (covers `export const metadata =
 *     { title: "..." }`, which is not JSX at all but is still what the browser
 *     tab and search-engine snippet show)
 *
 * Code identifiers (a variable, a CSS class, a test id) are explicitly out of
 * scope for the rename (see ADR 0009 step 2 for the `@jamquote/*` npm scope) —
 * this guard only ever looks at STRING literal and JSX TEXT content, so a
 * `className="jamquote-foo"` or an import from `@jamquote/core` cannot trip it.
 */

const WEB_ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["app", "components"].map((d) => path.join(WEB_ROOT, d));
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "build"]);
const SCAN_EXTENSIONS = new Set([".ts", ".tsx"]);

/**
 * Allow-list for a legitimate historical mention of the old name in a STRING
 * (not a comment — comments are already outside this guard's scan surface).
 * Empty today: every remaining "JamQuote" text under app/ and components/ is a
 * code comment, which this guard does not look at. A new entry here needs a
 * reason, same doctrine as the dynamic-var allow-list in
 * theme-tokens-guard.test.ts.
 */
const ALLOWED: Record<string, number> = {};

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) collectSourceFiles(full, out);
    else if (
      SCAN_EXTENSIONS.has(path.extname(entry)) &&
      entry !== "brand-name-guard.test.ts" &&
      // This guard's sibling tests (layout.test.ts, lib/pdf/brand-name.test.ts,
      // app/q/[token]/brand-name.test.ts) name "JamQuote" in their own string
      // literals to test FOR its absence elsewhere — scanning them would report
      // their own test assertions as the defect they exist to catch.
      entry !== "brand-name.test.ts"
    )
      out.push(full);
  }
  return out;
}

interface Hit {
  file: string;
  text: string;
}

function findOldBrandName(file: string): Hit[] {
  const sf = parseFile(file);
  const hits: Hit[] = [];

  for (const { text } of renderedText(sf)) {
    if (text.includes("JamQuote")) hits.push({ file, text });
  }

  for (const expr of renderedExpressions(sf)) {
    if (ts.isStringLiteral(expr) && expr.text.includes("JamQuote")) hits.push({ file, text: expr.text });
  }

  // Every string literal in the file — catches non-JSX user-visible text such
  // as `export const metadata = { title: "... JamQuote" }`.
  for (const lit of collect(sf, ts.isStringLiteral)) {
    if (lit.text.includes("JamQuote")) hits.push({ file, text: lit.text });
  }

  return hits;
}

describe("brand name guard: no user-visible \"JamQuote\" under app/ or components/", () => {
  it("scans a non-zero number of source files", () => {
    const files = SCAN_DIRS.flatMap((d) => collectSourceFiles(d));
    expect(files.length).toBeGreaterThan(50);
  });

  it("finds zero unaccounted occurrences of the old brand name in rendered strings/JSX text", () => {
    const files = SCAN_DIRS.flatMap((d) => collectSourceFiles(d));
    const hits = files.flatMap((f) => findOldBrandName(f));

    const counts = new Map<string, number>();
    for (const h of hits) {
      const key = path.relative(WEB_ROOT, h.file).split(path.sep).join("/");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const unaccounted = [...counts.entries()].filter(([key, count]) => (ALLOWED[key] ?? 0) !== count);
    if (unaccounted.length > 0) {
      const detail = unaccounted
        .map(([key, count]) => `${key}: found ${count}, allow-listed ${ALLOWED[key] ?? 0}`)
        .join("\n");
      throw new Error(
        `Found "JamQuote" in user-visible text (add a reasoned entry to ALLOWED, or fix the copy to say Pryvis):\n${detail}`,
      );
    }

    for (const [key, expectedCount] of Object.entries(ALLOWED)) {
      expect(counts.get(key) ?? 0, `allow-list entry "${key}" is stale`).toBe(expectedCount);
    }
  });
});
