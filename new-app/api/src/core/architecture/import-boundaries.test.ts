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
 * declarations, export-from declarations, `import type`, and dynamic `import()`
 * calls with a literal specifier.
 *
 * WHAT IT DOES NOT PROVE
 *
 * - A dynamic import with a COMPUTED specifier — `import(base + name)` — is
 *   invisible to it, because the string does not exist until runtime. It fails the
 *   test loudly rather than passing silently: a computed specifier inside
 *   `src/modules/` is itself a failure, because it is the one way to cross a
 *   boundary unseen.
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
            `${imp.file}:${imp.line} uses a computed dynamic import. This guard cannot read it, ` +
              `which makes it the one way to cross a module boundary unseen — so it is refused here.`,
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
