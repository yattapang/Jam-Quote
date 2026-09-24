/**
 * Guard: a module's internals stay its own.
 *
 * WHY THIS EXISTS, AND WHY IT EXISTS BEFORE THE MODULES DO
 *
 * The Phase 0 audit found the previous application's module boundaries were a
 * convention: any service could import any other module's service or Prisma
 * model, and several did. Nothing failed, so the boundary eroded quietly until
 * "modular monolith" described the folder names and not the code. A folder layout
 * is not a boundary. A test is.
 *
 * THE RULE
 *
 * A file under `src/modules/<a>/` may import:
 *   - anything under `src/core/` — the cross-cutting layer everything trusts;
 *   - a workspace package (`@pryvis/*`) — shared rules, contract, ui;
 *   - anything inside its OWN module;
 *   - another module ONLY through that module's `index.ts` — its public surface.
 *
 * It may not reach into `../<b>/whatever.service.js`. If module A needs something
 * from module B, B decides what to expose, in one file a reviewer can read.
 *
 * `src/core/` may not import a module at all. Core is what modules depend on; the
 * reverse would make the trusted layer depend on the thing it is meant to
 * constrain, and a cycle through core is how "everything trusts this" becomes
 * "everything is coupled to everything".
 *
 * HOW IT READS THE CODE
 *
 * Through the TypeScript parser, never a text search — a regex over source counts
 * a specifier inside a comment or a string as an import (Rule 8). It reads import
 * declarations, export-from declarations, `import type`, dynamic `import()` calls,
 * `import x = require(...)`, and — since F3 — `require()` calls, including a `require`
 * obtained from `createRequire(import.meta.url)`.
 *
 * F3 (independent review, 2026-09-24): `createRequire(import.meta.url)("../users/users.service.js")`
 * walked straight past this guard, in both directions, while its header claimed a computed
 * dynamic import was "the one way to cross a boundary unseen". It was not. Reaching for
 * `createRequire` in an ESM module is unusual enough to be worth noticing on its own, so it is
 * treated as an import and its specifier is checked like any other.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - A dynamic import or require with a COMPUTED specifier — `import(base + name)` — is
 *   invisible to it, because the string does not exist until runtime. It fails the
 *   test loudly rather than passing silently: a computed specifier inside `src/modules/`
 *   is itself a failure.
 * - Nothing about a module loaded through an indirection this guard has not been taught:
 *   an `eval`, a dynamically-built `createRequire` call, or a loader hook. F3 proved that
 *   claiming "this is the one way" invites someone to find the second one, so this now says
 *   what it reads rather than what it believes is exhaustive.
 * - Laundering through a shared re-export: if some module's `index.ts` re-exports
 *   another module's service, this guard sees a legal import of a public surface.
 *   That is a review question, not a parse question.
 * - Nothing about runtime coupling that goes through the database or an event.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..", "..");
const MODULES = join(SRC, "modules");
const CORE = join(SRC, "core");

/** One import found in one file: where it was written, and what it named. */
interface FoundImport {
  /** Path relative to `src/`, with forward slashes, for readable failures. */
  readonly file: string;
  readonly line: number;
  /** The specifier as written, or null when it is computed at runtime. */
  readonly specifier: string | null;
}

async function tsFilesUnder(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // the folder does not exist yet; the skeleton is still filling in
  }
  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await tsFilesUnder(full)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Every import in one file, via the parser.
 *
 * Parsing is strict: a file with syntax errors throws rather than being skipped.
 * The previous application learned this the hard way — the parser recovers from
 * broken syntax, so a guard over a file that did not compile still passed, and
 * the guard looked like evidence it was not.
 */
async function importsIn(file: string): Promise<FoundImport[]> {
  const text = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);

  const syntaxErrors = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (syntaxErrors && syntaxErrors.length > 0) {
    throw new Error(
      `${file} does not parse (${ts.flattenDiagnosticMessageText(syntaxErrors[0]!.messageText, " ")}). ` +
        `A guard over a file that does not compile proves nothing, so this is a failure, not a skip.`,
    );
  }

  const rel = relative(SRC, file).split(sep).join("/");
  const found: FoundImport[] = [];

  /**
   * Local names that behave like `require`.
   *
   * `const require = createRequire(import.meta.url)` binds one; so does any other name, which is
   * why this tracks the binding rather than looking for the word "require". A guard that matched
   * the name would be defeated by `const load = createRequire(...)`.
   */
  const requireLikeNames = new Set<string>(["require"]);
  const collectRequireBindings = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === "createRequire"
    ) {
      requireLikeNames.add(node.name.text);
    }
    ts.forEachChild(node, collectRequireBindings);
  };
  collectRequireBindings(sourceFile);

  const record = (node: ts.Node, specifier: string | null) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    found.push({ file: rel, line: line + 1, specifier });
  };

  const visit = (node: ts.Node): void => {
    // import … from "x" / export … from "x"  (covers `import type` too)
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      record(node, node.moduleSpecifier.text);
    }
    // import("x") — a literal specifier is readable; anything else is not
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      record(node, arg && ts.isStringLiteral(arg) ? arg.text : null);
    }
    // import x = require("y")
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      record(node, node.moduleReference.expression.text);
    }
    // require("x"), including a require obtained from createRequire — F3.
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      requireLikeNames.has(node.expression.text)
    ) {
      const arg = node.arguments[0];
      record(node, arg && ts.isStringLiteral(arg) ? arg.text : null);
    }
    // createRequire(...)("x") — called immediately, with nothing bound to a name.
    if (
      ts.isCallExpression(node) &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "createRequire"
    ) {
      const arg = node.arguments[0];
      record(node, arg && ts.isStringLiteral(arg) ? arg.text : null);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** The module a `src/`-relative path belongs to, or null if it is not in one. */
function moduleOf(relPath: string): string | null {
  const match = /^modules\/([^/]+)\//.exec(relPath);
  return match ? match[1]! : null;
}

/**
 * Resolves a relative specifier against the importing file, and reports which
 * module it lands in and whether it is that module's public surface.
 */
function targetOf(fromRel: string, specifier: string) {
  const landedRel = join(dirname(fromRel), specifier).split(sep).join("/");
  return {
    module: moduleOf(landedRel.endsWith("/") ? landedRel : `${landedRel}/`) ?? moduleOf(landedRel),
    isPublicSurface: /(^|\/)modules\/[^/]+\/index(\.js|\.ts)?$/.test(landedRel),
    intoCore: landedRel === "core" || landedRel.startsWith("core/"),
    landedRel,
  };
}

describe("module boundaries", () => {
  it("has modules to check, or says so", async () => {
    // A guard that silently found no subjects passes forever. While the skeleton
    // is still being built this is allowed to be empty, but it must be VISIBLY
    // empty rather than quietly vacuous.
    const files = await tsFilesUnder(MODULES);
    const modules = new Set(
      files.map((f) => moduleOf(relative(SRC, f).split(sep).join("/"))).filter(Boolean),
    );
    // eslint-disable-next-line no-console -- the point is that a human sees the scope
    console.info(
      `import-boundaries: ${files.length} file(s) across ${modules.size} module(s): ` +
        `${[...modules].sort().join(", ") || "(none yet)"}`,
    );
    expect(files.length).toBeGreaterThanOrEqual(0);
  });

  it("never reaches past another module's public surface", async () => {
    const offences: string[] = [];

    for (const file of await tsFilesUnder(MODULES)) {
      const fromRel = relative(SRC, file).split(sep).join("/");
      const own = moduleOf(fromRel);

      for (const imp of await importsIn(file)) {
        if (imp.specifier === null) {
          offences.push(
            `${imp.file}:${imp.line} loads a module by a specifier this guard cannot read — a ` +
              `computed dynamic import or require. That is the way to cross a module boundary ` +
              `unseen, so it is refused rather than trusted.`,
          );
          continue;
        }
        // A bare specifier is a package: @pryvis/*, nestjs, node builtins. Those
        // are governed by the dependency list, not by this guard.
        if (!imp.specifier.startsWith(".")) continue;

        const target = targetOf(imp.file, imp.specifier);
        if (target.module === null || target.module === own) continue; // core, or its own module
        if (target.isPublicSurface) continue;

        offences.push(
          `${imp.file}:${imp.line} imports "${imp.specifier}" — that is inside module ` +
            `"${target.module}". Import it from "modules/${target.module}" (its index.ts), or have ` +
            `that module expose what you need.`,
        );
      }
    }

    expect(offences, offences.join("\n")).toEqual([]);
  });

  it("keeps core free of any dependency on a module", async () => {
    const offences: string[] = [];

    for (const file of await tsFilesUnder(CORE)) {
      const fromRel = relative(SRC, file).split(sep).join("/");
      for (const imp of await importsIn(file)) {
        if (imp.specifier === null || !imp.specifier.startsWith(".")) continue;
        const target = targetOf(imp.file, imp.specifier);
        if (target.module !== null) {
          offences.push(
            `${imp.file}:${imp.line} imports "${imp.specifier}" from module "${target.module}". ` +
              `core is what modules depend on; depending back makes the trusted layer coupled to ` +
              `the thing it exists to constrain.`,
          );
        }
      }
    }

    expect(offences, offences.join("\n")).toEqual([]);
  });
});
