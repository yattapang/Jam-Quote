import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Guard: every `var(--jq-...)` call site anywhere under apps/web must name a
 * token that theme-style.ts actually defines. The valid-name set is DERIVED
 * from theme-style.ts's own template strings (regex over its `--jq-XXX:`
 * declarations), never hand-listed — theme-style.ts is the single source of
 * truth for which --jq-* variables exist (see its own header comment), so a
 * token defined there and a token referenced by `var()` are the same
 * vocabulary and can be checked against each other mechanically.
 *
 * What this does NOT prove: a dynamically constructed var name (e.g.
 * `var(--jq-${x})` template interpolation) is invisible to this regex scan;
 * none exist in the codebase today (checked), but a future one would bypass
 * this guard silently.
 */

const WEB_ROOT = path.resolve(__dirname, "..");
const THEME_STYLE_PATH = path.join(WEB_ROOT, "lib", "theme-style.ts");

function deriveValidTokenNames(): Set<string> {
  const src = readFileSync(THEME_STYLE_PATH, "utf-8");
  const names = new Set<string>();
  // Matches lines like `    --jq-bg: ${t.bg};` or `    --jq-radius-sm: ${radius.sm}px;`
  const re = /(--jq-[a-zA-Z0-9-]+)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const name = m[1];
    if (name) names.add(name);
  }
  return names;
}

const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "build"]);
const SCAN_EXTENSIONS = new Set([".css", ".tsx", ".ts"]);

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry)) && entry !== "theme-tokens-guard.test.ts") {
      // This file names var(--...) in its own comments and messages; scanning it would
      // report the guard's documentation as a defect.
      out.push(full);
    }
  }
  return out;
}

function findJqVarUsages(files: string[]): { file: string; name: string }[] {
  return findVarUsages(files).filter((u) => u.name.startsWith("--jq-"));
}

/** Every `var(--name` call site, of ANY name - the bug class this guard exists for was
 * mostly NON-jq names (`var(--muted)`, `var(--surface)`, `var(--critical)`), which an
 * earlier version of this guard, scanning only `--jq-*`, could not see. */
function findVarUsages(files: string[]): { file: string; name: string }[] {
  const usages: { file: string; name: string }[] = [];
  const re = /var\(\s*(--[a-zA-Z0-9-]+)/g;
  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src))) {
      const name = m[1];
      if (name) usages.push({ file, name });
    }
  }
  return usages;
}

/** Custom properties DECLARED in the scanned source (`--name: value`), each with the
 * directory of the file that declares it, plus next/font's generated variables. A
 * declaration only counts for files in the SAME directory tree: the admin console has its
 * own self-contained theme (`app/admin/console.module.css` declares `--muted`, `--surface`
 * and friends under `.root[data-theme]`), and that must not make `var(--muted)` look valid
 * on the login page, where it is exactly the bug this guard exists for. */
function declaredCustomProperties(files: string[]): Map<string, string[]> {
  const declared = new Map<string, string[]>();
  const decl = /(--[a-zA-Z0-9-]+)\s*:/g;
  const font = /variable:\s*["'](--[a-zA-Z0-9-]+)["']/g;
  for (const file of files) {
    const src = readFileSync(file, "utf-8");
    const scope = file.endsWith("layout.tsx") && path.dirname(file) === path.join(WEB_ROOT, "app")
      ? WEB_ROOT // next/font variables in the root layout apply to the whole app
      : path.dirname(file);
    for (const re of [decl, font]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (!m[1]) continue;
        declared.set(m[1], [...(declared.get(m[1]) ?? []), scope]);
      }
    }
  }
  return declared;
}

function isDeclaredFor(name: string, usageFile: string, declared: Map<string, string[]>): boolean {
  const dir = path.dirname(usageFile);
  return (declared.get(name) ?? []).some((scope) => dir === scope || dir.startsWith(scope + path.sep));
}

describe("--jq-* design token guard", () => {
  it("derives a non-empty set of valid token names from theme-style.ts", () => {
    const valid = deriveValidTokenNames();
    // Proves the parse actually found something, per guard doctrine: a
    // rename of theme-style.ts's emission format must fail this loudly
    // rather than silently validating against an empty set.
    expect(valid.size).toBeGreaterThanOrEqual(28);
  });

  it("finds a non-zero number of var(--jq-*) usages under apps/web", () => {
    const files = collectSourceFiles(WEB_ROOT);
    const usages = findJqVarUsages(files);
    expect(usages.length).toBeGreaterThan(0);
  });

  it("every var(--jq-*) call site names a token theme-style.ts defines", () => {
    const valid = deriveValidTokenNames();
    const files = collectSourceFiles(WEB_ROOT);
    const usages = findJqVarUsages(files);
    const bad = usages.filter((u) => !valid.has(u.name));
    if (bad.length > 0) {
      const detail = bad
        .map((b) => `${path.relative(WEB_ROOT, b.file)}: ${b.name}`)
        .join("\n");
      throw new Error(`Found var(--jq-*) references to undefined tokens:\n${detail}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("no var(--name) references a custom property nobody declares", () => {
  it("every var() of ANY name resolves to a token or a declared custom property", () => {
    const files = collectSourceFiles(WEB_ROOT).filter((f) => !f.endsWith("theme-tokens-guard.test.ts"));
    const tokens = deriveValidTokenNames();
    const declared = declaredCustomProperties(files);
    const usages = findVarUsages(files);
    // The scan must find its subjects, including non-jq ones (next/font variables).
    expect(usages.length).toBeGreaterThan(100);
    expect(usages.some((u) => !u.name.startsWith("--jq-"))).toBe(true);
    const bad = usages.filter((u) => !tokens.has(u.name) && !isDeclaredFor(u.name, u.file, declared));
    const detail = bad.map((u) => `${path.relative(WEB_ROOT, u.file)}: ${u.name}`).join("\n");
    expect(detail, `undefined custom properties:\n${detail}`).toBe("");
  });
});
