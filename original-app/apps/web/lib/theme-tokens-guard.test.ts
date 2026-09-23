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
 * A dynamically constructed var name — `var(--${x})` template interpolation,
 * or `"var(--" + x` string concatenation — is invisible to the plain regex
 * scan above, which only ever sees the literal text `var(--`. This file does
 * NOT let that pass silently: findDynamicVarUsages below scans for both
 * shapes separately and checks the result against an exact-count allow-list
 * (see ALLOWED_DYNAMIC_VAR_USAGES), so a new dynamic call site fails loudly
 * until someone adds it there with a reason, and the allow-list itself is
 * rot-checked so a removed call site is caught too.
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

/** Strip `/* … *\/` and `// …` comments before any declaration scan, so a comment that
 * merely MENTIONS a custom property (`/* --ghost: legacy *\/`) cannot be mistaken for
 * declaring it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

interface RawDecl {
  name: string;
  /** Declared at the top level of a rule not nested in @media, @supports, or a
   * [data-theme…] selector — see the accepted-limits note on isDeclaredFor below. */
  topLevel: boolean;
  /** The theme value of the innermost `[data-theme="X"]` ancestor selector, if any. */
  dataTheme: string | null;
  /** The selector with its `[data-theme="X"]` clause stripped, so two theme blocks for
   * the same base selector (`.root[data-theme="light"]` / `.root[data-theme="dark"]`)
   * can be recognised as a pair. */
  baseSelector: string | null;
}

/** Walks a stylesheet (or a template string containing one) with a brace-depth stack so
 * a `--name: value` declaration can be classified by where it actually lives, rather than
 * by a flat regex that cannot tell `.root { --x: 1 }` from
 * `@media (...) { .root { --x: 1 } }`. This is what makes a variable declared only inside
 * a conditional block NOT count as declared everywhere (guard-review item 3). */
function parseDeclarations(src: string): RawDecl[] {
  const results: RawDecl[] = [];
  const stack: { selector: string; blocked: boolean }[] = [];
  const declRe = /(--[a-zA-Z0-9-]+)\s*:/;
  let stmtStart = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "{") {
      const selector = src.slice(stmtStart, i).trim();
      const isAtRule = /^@media\b|^@supports\b/.test(selector);
      const parentBlocked = stack.length > 0 && stack[stack.length - 1]!.blocked;
      stack.push({ selector, blocked: isAtRule || parentBlocked });
      stmtStart = i + 1;
    } else if (c === "}") {
      stack.pop();
      stmtStart = i + 1;
    } else if (c === ";") {
      if (stack.length > 0) {
        const stmt = src.slice(stmtStart, i);
        const m = declRe.exec(stmt);
        if (m?.[1]) {
          const top = stack[stack.length - 1]!;
          const themeMatch = /\[data-theme=["']?([a-zA-Z0-9_-]+)["']?\]/.exec(top.selector);
          results.push({
            name: m[1],
            topLevel: !top.blocked && !themeMatch,
            dataTheme: themeMatch?.[1] ?? null,
            baseSelector: themeMatch ? top.selector.replace(themeMatch[0], "").trim() : null,
          });
        }
      }
      stmtStart = i + 1;
    }
  }
  return results;
}

/** Custom properties DECLARED in the scanned source (`--name: value`), each with the
 * directory of the file that declares it, plus next/font's generated variables. A
 * declaration only counts for files in the SAME directory tree: the admin console has its
 * own self-contained theme (`app/admin/console.module.css` declares `--muted`, `--surface`
 * and friends under `.root[data-theme]`), and that must not make `var(--muted)` look valid
 * on the login page, where it is exactly the bug this guard exists for.
 *
 * DEFINED means: declared at the top level of some rule that is not nested in `@media`,
 * `@supports`, or a `[data-theme…]` selector — OR declared under BOTH halves of a
 * `[data-theme="light"]` / `[data-theme="dark"]` pair for the same base selector, which is
 * how `app/admin/console.module.css` declares its whole theme (see its header comment). A
 * property under only ONE of the two themes, or under a `[data-theme]` selector with no
 * sibling for the other theme, is NOT counted — that is exactly the shape of a token that
 * only half-exists.
 *
 * Accepted limits: this walks the file's own text, one file at a time — it has no notion
 * of the rendered CSS cascade, so it cannot see a declaration reached only via `@import`,
 * a CSS-in-JS runtime merge, or a selector built by string concatenation elsewhere. Scope
 * follows the file tree (the directory that declares a token), not what the browser would
 * actually resolve `var()` against at paint time.
 */
function declaredCustomProperties(files: string[]): Map<string, string[]> {
  const declared = new Map<string, string[]>();
  const font = /variable:\s*["'](--[a-zA-Z0-9-]+)["']/g;
  // Per scope, track which (baseSelector, name) pairs have been seen under which themes,
  // so a light/dark pair can be recognised once both halves have been scanned.
  const themedPairs = new Map<string, Map<string, Set<string>>>(); // scope -> "base||name" -> themes seen
  for (const file of files) {
    const raw = readFileSync(file, "utf-8");
    const src = stripComments(raw);
    const scope = file.endsWith("layout.tsx") && path.dirname(file) === path.join(WEB_ROOT, "app")
      ? WEB_ROOT // next/font variables in the root layout apply to the whole app
      : path.dirname(file);

    for (const decl of parseDeclarations(src)) {
      if (decl.topLevel) {
        declared.set(decl.name, [...(declared.get(decl.name) ?? []), scope]);
      } else if (decl.dataTheme && decl.baseSelector) {
        const key = `${decl.baseSelector}||${decl.name}`;
        const scopeMap = themedPairs.get(scope) ?? new Map<string, Set<string>>();
        const themes = scopeMap.get(key) ?? new Set<string>();
        themes.add(decl.dataTheme);
        scopeMap.set(key, themes);
        themedPairs.set(scope, scopeMap);
      }
    }

    let m: RegExpExecArray | null;
    font.lastIndex = 0;
    while ((m = font.exec(src))) {
      if (!m[1]) continue;
      declared.set(m[1], [...(declared.get(m[1]) ?? []), scope]);
    }
  }
  // Promote any (base, name) pair seen under BOTH "light" and "dark" to fully declared.
  for (const [scope, scopeMap] of themedPairs) {
    for (const [key, themes] of scopeMap) {
      if (themes.has("light") && themes.has("dark")) {
        const name = key.split("||")[1]!;
        declared.set(name, [...(declared.get(name) ?? []), scope]);
      }
    }
  }
  return declared;
}

function isDeclaredFor(name: string, usageFile: string, declared: Map<string, string[]>): boolean {
  const dir = path.dirname(usageFile);
  return (declared.get(name) ?? []).some((scope) => dir === scope || dir.startsWith(scope + path.sep));
}

interface DynamicVarUsage {
  key: string; // "relative/path.ts#nearestFunctionName"
  snippet: string;
}

/** Best-effort name of the function/arrow enclosing `index`, by scanning backward for the
 * nearest `function NAME(` or `const/let NAME =`. Good enough to key an allow-list entry —
 * this is identification, not a claim of full JS scoping. */
function nearestFunctionName(src: string, index: number): string {
  const before = src.slice(0, index);
  const re = /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*)\s*[:=])/g;
  let last: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = re.exec(before))) {
    last = m[1] ?? m[2];
  }
  return last ?? "(module scope)";
}

/** Finds `var(--...)` call sites built dynamically rather than from a literal name:
 * template interpolation (`` var(--${x}) ``) or string concatenation (`"var(--" + x`).
 * Both shapes are invisible to `findVarUsages`'s literal-name regex, which is exactly the
 * defect guard-review item 1 found: a template-string var name silently passed the guard
 * while the file's own header comment claimed the opposite. */
function findDynamicVarUsages(files: string[]): DynamicVarUsage[] {
  const usages: DynamicVarUsage[] = [];
  // `var(--` immediately followed by a template interpolation, anywhere before the `)`.
  const templateRe = /var\(\s*--[a-zA-Z0-9-]*\$\{/g;
  // A quoted `var(--` (or `var(--jq-...`) fragment immediately followed by `+` concatenation.
  const concatRe = /(["'`])var\(--[a-zA-Z0-9-]*\1\s*\+/g;
  for (const file of files) {
    // Comments-only mentions (like this very file's, and a test file's explanatory
    // comment) must not count as a call site — same principle as item 2.
    const src = stripComments(readFileSync(file, "utf-8"));
    for (const re of [templateRe, concatRe]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const fnName = nearestFunctionName(src, m.index);
        usages.push({
          key: `${path.relative(WEB_ROOT, file).split(path.sep).join("/")}#${fnName}`,
          snippet: src.slice(Math.max(0, m.index - 20), m.index + 40).replace(/\s+/g, " "),
        });
      }
    }
  }
  return usages;
}

/**
 * Exact-count allow-list for legitimate dynamically-constructed `var(--...)` call sites,
 * keyed `"relative/file/path.ts#nearestFunctionName"`. Empty today: nothing in the
 * codebase builds a var() name dynamically. Each entry must carry a reason in this
 * comment when one is ever added. The rot check below fails if the count for any key
 * stops matching reality in EITHER direction, so a stale entry (the call site was
 * removed or renamed) is caught, not just a missing one.
 */
const ALLOWED_DYNAMIC_VAR_USAGES: Record<string, number> = {
  // app/admin/AdminConsole.tsx: `pill(tone)` builds a status pill's color/background/
  // border from a `tone` value drawn from a small closed set of --jq-* tone names
  // (planTone, apiEnv.tone, st.tone, etc. — "good" | "warn" | "critical" | "info" |
  // "muted" | "accent"), never from arbitrary/user input. 3 var(--${tone}) call sites
  // in the pill() helper itself.
  "app/admin/AdminConsole.tsx#pill": 3,
  // Same tone pattern, inlined directly at call sites rather than through pill() —
  // apiEnv's status chip and other inline tone-colored dots. The nearest-preceding-
  // const heuristic that keys this allow-list attributes them to whichever local
  // const happens to precede them in the file (iconStroke, busy, lifecycleError); all
  // are the same closed-tone-set pattern as pill() above, verified by reading each
  // call site.
  "app/admin/AdminConsole.tsx#iconStroke": 4,
  "app/admin/AdminConsole.tsx#lifecycleError": 1,
  "app/admin/AdminConsole.tsx#busy": 3,
};

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

  it("the admin console's paired light/dark theme counts as fully declared (item 3)", () => {
    // app/admin/console.module.css declares its whole theme ONLY under
    // .root[data-theme="light"] and .root[data-theme="dark"] — never at a bare top
    // level — so this is the one real file that exercises the pairing rule end to end.
    const files = collectSourceFiles(WEB_ROOT).filter((f) => !f.endsWith("theme-tokens-guard.test.ts"));
    const declared = declaredCustomProperties(files);
    const consoleFile = files.find((f) => f.endsWith(path.join("app", "admin", "console.module.css")));
    expect(consoleFile).toBeDefined();
    expect(isDeclaredFor("--muted", consoleFile!, declared)).toBe(true);
    expect(isDeclaredFor("--surface", consoleFile!, declared)).toBe(true);
  });

  it("a declaration only inside @media, with no top-level or paired-theme sibling, is NOT counted (item 3)", () => {
    const decls = parseDeclarations(
      '@media (prefers-color-scheme: dark) { .zz { --darkonly: red; } }',
    );
    const darkonly = decls.find((d) => d.name === "--darkonly");
    expect(darkonly).toBeDefined();
    expect(darkonly!.topLevel).toBe(false);
    expect(darkonly!.dataTheme).toBeNull();
  });

  it("a CSS comment does not count as a declaration (item 2)", () => {
    const stripped = stripComments('/* --ghost: legacy */\n.x { color: var(--ghost); }');
    expect(parseDeclarations(stripped).some((d) => d.name === "--ghost")).toBe(false);
    // Same source, unstripped: the comment's colon must not be picked up either, once
    // comments are removed before scanning (this is the fix, not the old behaviour).
    expect(stripped).not.toContain("--ghost: legacy");
  });
});

describe("dynamic var(--...) construction cannot bypass the guard silently (item 1)", () => {
  it("template interpolation and string concatenation are both recognised by the detector", () => {
    const templateSrc = "const f = (x) => `var(--${x})`;";
    const concatSrc = 'const g = (x) => "var(--" + x + ")";';
    const detectOn = (src: string) => {
      const templateRe = /var\(\s*--[a-zA-Z0-9-]*\$\{/g;
      const concatRe = /(["'`])var\(--[a-zA-Z0-9-]*\1\s*\+/g;
      return templateRe.test(src) || concatRe.test(src);
    };
    expect(detectOn(templateSrc)).toBe(true);
    expect(detectOn(concatSrc)).toBe(true);
  });

  it("finds zero unaccounted dynamic var(--...) usages under apps/web, against the allow-list", () => {
    const files = collectSourceFiles(WEB_ROOT).filter((f) => !f.endsWith("theme-tokens-guard.test.ts"));
    const usages = findDynamicVarUsages(files);
    const counts = new Map<string, number>();
    for (const u of usages) counts.set(u.key, (counts.get(u.key) ?? 0) + 1);

    const unaccounted = [...counts.entries()].filter(
      ([key, count]) => (ALLOWED_DYNAMIC_VAR_USAGES[key] ?? 0) !== count,
    );
    if (unaccounted.length > 0) {
      const detail = unaccounted
        .map(([key, count]) => `${key}: found ${count}, allow-listed ${ALLOWED_DYNAMIC_VAR_USAGES[key] ?? 0}`)
        .join("\n");
      throw new Error(
        `Dynamic var(--...) construction found that the allow-list does not account for ` +
          `exactly (add a keyed, reasoned entry to ALLOWED_DYNAMIC_VAR_USAGES, or remove ` +
          `the dynamic construction):\n${detail}`,
      );
    }

    // Rot check: every allow-list entry must still correspond to something real, in the
    // exact count claimed — catches a stale entry left behind after its call site moved
    // or was deleted, per guard doctrine.
    for (const [key, expectedCount] of Object.entries(ALLOWED_DYNAMIC_VAR_USAGES)) {
      expect(counts.get(key) ?? 0, `allow-list entry "${key}" is stale`).toBe(expectedCount);
    }
  });
});
