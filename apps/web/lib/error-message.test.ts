import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  parseFile,
  parseSource,
  renderedText,
  collect,
  unwrap,
  followAlias,
  enclosingFunctionKey,
} from "@jamquote/test-ast";
import { ApiError } from "./api-client";
import { errorMessage } from "./error-message";

describe("errorMessage", () => {
  it("shows what the server said, because the server said it deliberately", () => {
    const err = new ApiError("Only DRAFT quotes can be deleted", 400);
    expect(errorMessage(err, "Couldn't delete — check your connection and try again.")).toBe(
      "Only DRAFT quotes can be deleted",
    );
  });

  it("falls back when the fetch never completed, where the fallback is the plain-English cause", () => {
    // A TypeError from fetch means no response arrived — a genuine connection
    // failure, unknown to the contractor. The plain fallback is then accurate.
    expect(
      errorMessage(new TypeError("Failed to fetch"), "Couldn't save — check your connection and try again."),
    ).toBe("Couldn't save — check your connection and try again.");
  });

  it("does not leak a transport message to a contractor", () => {
    // "NetworkError when attempting to fetch resource" is true and useless,
    // and worse, it looks like the app saying something meaningful.
    const out = errorMessage(new Error("NetworkError when attempting to fetch resource"), "Couldn't save.");
    expect(out).toBe("Couldn't save.");
  });

  it("falls back on an ApiError with an empty message rather than showing blank", () => {
    expect(errorMessage(new ApiError("   ", 500), "Couldn't save.")).toBe("Couldn't save.");
  });

  it("survives a thrown non-Error", () => {
    // Anything can be thrown in JavaScript, including a string or undefined.
    expect(errorMessage("boom", "Couldn't save.")).toBe("Couldn't save.");
    expect(errorMessage(undefined, "Couldn't save.")).toBe("Couldn't save.");
    expect(errorMessage(null, "Couldn't save.")).toBe("Couldn't save.");
  });
});

/**
 * A source-scanning guard, not a behaviour test — and an AST parse, not a text
 * match. The version this replaces matched the literal substring
 * "is the API running" inside a fixed line WINDOW around each hit, guarded by
 * `/errorMessage\(/.test(window)`. That is exactly the class of guard
 * `.claude/agents/README.md` warns about (a guard matching the TEXT of a
 * defect rather than its shape): reword the fallback at all — "is the backend
 * up?", "API unreachable", "the server may be down" — and the text match never
 * fires, while the contractor still reads developer wording. This version asks
 * a SHAPE question instead: is any user-visible string literal, template-
 * literal head, or JSX text anywhere in `app/`/`components/` the word "API" or
 * the phrase "is the API running", however it is spelled around that word.
 *
 * ## What counts as "user-visible" — the structural rule
 *
 * Every string literal, template-literal head (the static prefix of a
 * `` `template ${expr}` `` — never the dynamic part, which cannot be judged
 * statically) and JSX text node in scope is a candidate. Three shapes are
 * excluded because they structurally cannot reach a screen:
 *
 *  - **An import/export module specifier** (`from "..."`, a dynamic
 *    `import("...")`) — a path, not prose.
 *  - **A `console.*(...)` argument** — `console.log`/`warn`/`error`/`info`/
 *    `debug`, resolved by requiring the callee's receiver to be the bare,
 *    unresolved identifier `console` (never a shadowed local of that name) —
 *    developer-facing by construction, never rendered.
 *  - **The argument of a `new XError(...)` that is directly thrown**
 *    (`throw new Error("...")`, `throw new ApiError("...")`) — the message on
 *    the exception object itself, not text handed to a renderer. It only
 *    reaches a screen if something downstream reads `.message` and displays
 *    it, which is a SEPARATE read this guard would catch at that render site
 *    (a string literal or JSX text there), not at the throw.
 *
 * Everything else scanned — a `setError(...)` argument, an `errorText` prop,
 * plain rendered JSX prose, a `title=` tooltip — is user-visible by default.
 * That is deliberately wider than "definitely rendered": the doctrine's own
 * tie-break (source-ast.ts's header) sends a genuinely unknowable case toward
 * DATA/rejection, not toward a false pass, and a legitimate exception is named
 * in the allow-list with a reason rather than silently excluded by shape.
 *
 * ## Allow-list
 *
 * Keyed `file#function` (via `enclosingFunctionKey`) with an exact COUNT, same
 * discipline as `unit-label-usage.test.ts`'s `NON_DISPLAY_ALLOWED`: a whole-
 * file skip would silently cover every string added to that file afterward,
 * including a real regression. `app/admin/AdminConsole.tsx#AdminConsole` is
 * the only entry — the admin console is staff-only tooling (an environment
 * badge tooltip and an "API unreachable" failure banner naming the admin API
 * explicitly, per this file's own docs, is exactly what staff need to
 * diagnose a real outage) and item 3's brief says to leave it unless a string
 * there is identical to the developer-facing wording contractors saw. It is
 * not identical — "API: staging", "admin API", "check the API is reachable"
 * name the API on purpose, for an audience that has one to check.
 */
const ALLOWED: { file: string; function: string; count: number; reason: string }[] = [
  {
    file: "app/admin/AdminConsole.tsx",
    function: "AdminConsole",
    count: 3,
    reason:
      "staff-only console: an environment-badge tooltip and a load-failure banner deliberately name the API for an audience that can actually check it — not the developer wording contractors saw",
  },
  {
    file: "lib/api-environment.ts",
    function: "apiEnvironment",
    count: 3,
    reason:
      "labels/detail for the admin-only environment badge (app/admin/page.tsx is its one caller) — diagnostic text for staff diagnosing a real deploy misconfiguration, not a contractor-facing failure fallback",
  },
];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.includes(".test."))
      found.push(full);
  }
  return found;
}

/** Is `node` the module specifier of an import/export, or a dynamic import's argument? */
function isModuleSpecifier(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return false;
  if ((ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) && p.moduleSpecifier === node) return true;
  if (
    ts.isCallExpression(p) &&
    p.expression.kind === ts.SyntaxKind.ImportKeyword &&
    p.arguments[0] === (node as ts.Expression)
  ) {
    return true;
  }
  return false;
}

/**
 * Is `node` an argument of a `console.<method>(...)` call whose receiver is the
 * GLOBAL `console`, not a local of the same name? `followAlias` resolves a
 * bare identifier through the shared binder; a local `const console = {...}`
 * has a declaration to follow (excluding it here), while the real global does
 * not (nothing in a no-lib, no-import single-file program binds it) — the same
 * binder-over-spelling discipline `source-ast.ts`'s own header requires,
 * closing the exact shadow this file's `calleeIsImport` doc warns a
 * spelling-only match leaves open.
 */
function isConsoleCallArgument(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isCallExpression(p) || !p.arguments.includes(node as ts.Expression)) return false;
  const callee = unwrap(p.expression);
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const obj = unwrap(callee.expression);
  if (!ts.isIdentifier(obj) || obj.text !== "console") return false;
  return followAlias(obj) === undefined;
}

/** Is `node` the message argument of a `new XError(...)` that is directly `throw`n? */
function isThrownErrorConstructorArgument(node: ts.Node): boolean {
  const p = node.parent;
  if (!p || !ts.isNewExpression(p) || !p.arguments?.includes(node as ts.Expression)) return false;
  const callee = unwrap(p.expression);
  if (!ts.isIdentifier(callee) || !/Error$/.test(callee.text)) return false;
  const grand = p.parent;
  return !!grand && ts.isThrowStatement(grand) && grand.expression === p;
}

/** Does `text` contain the banned phrase, or "API" as a whole, case-sensitive word? */
function mentionsDeveloperApi(text: string): boolean {
  return text.includes("is the API running") || /\bAPI\b/.test(text);
}

interface Candidate {
  text: string;
  node: ts.Node;
}

/** Every scanned string literal, template-literal head, and JSX text node in `sf`, with its excuse-relevant context node. */
function candidatesIn(sf: ts.SourceFile): Candidate[] {
  const out: Candidate[] = [];
  for (const lit of collect(sf, ts.isStringLiteral)) {
    if (isModuleSpecifier(lit) || isConsoleCallArgument(lit) || isThrownErrorConstructorArgument(lit)) continue;
    out.push({ text: lit.text, node: lit });
  }
  for (const lit of collect(sf, ts.isNoSubstitutionTemplateLiteral)) {
    if (isModuleSpecifier(lit) || isConsoleCallArgument(lit) || isThrownErrorConstructorArgument(lit)) continue;
    out.push({ text: lit.text, node: lit });
  }
  for (const tpl of collect(sf, ts.isTemplateExpression)) {
    // The context checks apply to the WHOLE template (the thing actually passed
    // as an argument/thrown/imported), even though only its static HEAD is
    // scanned for banned text — the dynamic spans cannot be judged statically.
    if (isModuleSpecifier(tpl) || isConsoleCallArgument(tpl) || isThrownErrorConstructorArgument(tpl)) continue;
    out.push({ text: tpl.head.text, node: tpl });
  }
  for (const { text, node } of renderedText(sf)) {
    out.push({ text, node });
  }
  return out;
}

describe("no user-visible text under app/ or components/ names the API", () => {
  const root = process.cwd();
  const files = [...sourceFiles(join(root, "app")), ...sourceFiles(join(root, "lib")), ...sourceFiles(join(root, "components"))];

  function offendersByKey(): Map<string, { rel: string; fn: string; count: number; samples: string[] }> {
    const byKey = new Map<string, { rel: string; fn: string; count: number; samples: string[] }>();
    for (const file of files) {
      const rel = file.slice(root.length + 1).replace(/\\/g, "/");
      const sf = parseFile(file);
      for (const { text, node } of candidatesIn(sf)) {
        if (!mentionsDeveloperApi(text)) continue;
        const fn = enclosingFunctionKey(node);
        const key = `${rel}#${fn}`;
        const entry = byKey.get(key) ?? { rel, fn, count: 0, samples: [] };
        entry.count++;
        if (entry.samples.length < 3) entry.samples.push(text.slice(0, 80));
        byKey.set(key, entry);
      }
    }
    return byKey;
  }

  it("scanned real subjects — a rename or a move that emptied discovery should fail loudly", () => {
    let scanned = 0;
    for (const file of files) scanned += candidatesIn(parseFile(file)).length;
    expect(scanned).toBeGreaterThan(0);
  });

  it("no unexcused user-visible text mentions the API", () => {
    const allowed = new Map(ALLOWED.map((a) => [`${a.file}#${a.function}`, a.count]));
    const byKey = offendersByKey();
    const offenders = [...byKey.entries()]
      .filter(([key, entry]) => allowed.get(key) !== entry.count)
      .map(
        ([key, entry]) =>
          `${key}: ${entry.count} mention(s) (allowed ${allowed.get(key) ?? 0}) — e.g. "${entry.samples[0]}"`,
      );
    expect(offenders, "developer wording ('API', 'is the API running') reaching a contractor — reword it").toEqual(
      [],
    );
  });

  it("does not let the allow-list rot: every entry still has exactly its count", () => {
    const byKey = offendersByKey();
    const drifted = ALLOWED.filter((a) => byKey.get(`${a.file}#${a.function}`)?.count !== a.count);
    expect(drifted).toEqual([]);
  });

  it("ignores an import path, however it spells the word", () => {
    const sf = parseSource("probe-import.ts", 'import { X } from "./my-API-client";');
    expect(candidatesIn(sf).some((c) => mentionsDeveloperApi(c.text))).toBe(false);
  });

  it("ignores a console.* call, but not a same-named local shadowing it", () => {
    const real = parseSource("probe-console.ts", 'console.error("API unreachable");');
    expect(candidatesIn(real).some((c) => mentionsDeveloperApi(c.text))).toBe(false);

    const shadowed = parseSource(
      "probe-console-shadow.tsx",
      [
        "function render() {",
        '  const console = { error: (s: string) => { document.title = s; } };',
        '  console.error("API unreachable");',
        "}",
      ].join("\n"),
    );
    // A local binding named `console` is not the global console — its argument
    // is not structurally excused merely because it is spelled the same way.
    expect(candidatesIn(shadowed).some((c) => mentionsDeveloperApi(c.text))).toBe(true);
  });

  it("ignores a thrown Error's own message, but not the same text rendered", () => {
    const thrown = parseSource("probe-throw.ts", 'throw new Error("is the API running");');
    expect(candidatesIn(thrown).some((c) => mentionsDeveloperApi(c.text))).toBe(false);

    // The live shape this guard exists for: the SAME words, handed to a
    // renderer rather than thrown, must still be caught.
    const rendered = parseSource("probe-thrown-then-shown.tsx", 'const x = <span>is the API running</span>;');
    expect(candidatesIn(rendered).some((c) => mentionsDeveloperApi(c.text))).toBe(true);
  });

  it("bypass: a reworded developer message with no banned substring still fires on the bare word API", () => {
    // The exact class the previous text-window guard could not see: a rewrite
    // that drops the phrase "is the API running" entirely still says "API".
    const probe = parseSource(
      "probe-reworded.tsx",
      'const x = <span>{errorMessage(err, "Couldn\'t save — API unreachable, try later")}</span>;',
    );
    expect(candidatesIn(probe).some((c) => mentionsDeveloperApi(c.text))).toBe(true);
  });

  it("does not fire on a word merely containing the letters API, like APIs", () => {
    const probe = parseSource("probe-word.tsx", "const x = <span>Third-party APIs may vary.</span>;");
    expect(candidatesIn(probe).some((c) => mentionsDeveloperApi(c.text))).toBe(false);
  });
});
