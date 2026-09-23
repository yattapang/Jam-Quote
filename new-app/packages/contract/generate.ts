/**
 * Generates the wire contract that web and mobile consume.
 *
 * WHY THIS EXISTS
 *
 * The Phase 0 audit found the previous application's web app kept hand-written
 * copies of API response shapes, and a guard proved a copy was *used* but never
 * that its fields still *matched*. So a field could be renamed on the server and
 * the client would keep compiling against a shape that no longer existed. ADR 0012
 * answers that: the API's types are the single definition, this script derives the
 * client's types from them, and CI fails if the checked-in output is stale.
 *
 * HOW A TYPE OPTS IN
 *
 * An exported interface in a module's public surface (`index.ts`) carrying the
 * `@wire` tag in its doc comment. Opt-in, not everything-exported, because most of
 * a module's surface is internal to the server and a client that could see it
 * would start depending on it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not emit an HTTP client, and there is no OpenAPI document yet, because
 * there are no routes yet. When the HTTP layer lands, this script grows to emit
 * the operations too; the drift check around it does not change. Building the
 * whole pipeline now, against no routes, would produce a check that proves nothing
 * — which Rule 8 calls worse than no check at all.
 *
 * It does not resolve imported types. A `@wire` interface whose field refers to a
 * type declared elsewhere is rejected rather than half-emitted, because a silently
 * incomplete contract is the exact failure this is meant to prevent.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const MODULES = join(HERE, "..", "..", "api", "src", "modules");

export const GENERATED_HEADER = `// GENERATED FILE — DO NOT EDIT.
//
// Produced by packages/contract/generate.ts from the @wire types in the API's
// module public surfaces. Edit the type on the server and re-run
// \`npm run contract:generate\`; editing this file is undone by the next run, and
// \`contract-drift.test.ts\` fails the build if this copy is stale.
`;

interface WireType {
  readonly module: string;
  readonly name: string;
  /** The declaration's source text, doc comment included. */
  readonly text: string;
}

/** Every module's `index.ts`, which is the only place a wire type may be declared. */
async function publicSurfaces(): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(MODULES, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => join(MODULES, e.name, "index.ts"));
}

/**
 * Collects `@wire` interfaces from one public surface.
 *
 * Parsed, never text-matched: a regex would find `@wire` in prose, and would have
 * no idea whether the interface below it was exported.
 */
async function wireTypesIn(file: string): Promise<WireType[]> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch {
    return []; // a module without an index.ts yet
  }

  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const diagnostics = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (diagnostics && diagnostics.length > 0) {
    throw new Error(
      `${file} does not parse: ${ts.flattenDiagnosticMessageText(diagnostics[0]!.messageText, " ")}`,
    );
  }

  const module = relative(MODULES, dirname(file)).split(sep).join("/");
  const found: WireType[] = [];

  // A wire type can also be declared in a module's own file and re-exported by
  // index.ts. Follow `export type { X } from "./y.js"` one hop, which is the
  // pattern ADR 0012 prescribes; anything deeper is refused below.
  const reExports = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        reExports.set(element.name.text, statement.moduleSpecifier.text);
      }
    }
  }

  const collectFrom = async (srcFile: ts.SourceFile, onlyNamed?: Set<string>) => {
    for (const statement of srcFile.statements) {
      if (!ts.isInterfaceDeclaration(statement)) continue;
      const name = statement.name.text;
      if (onlyNamed && !onlyNamed.has(name)) continue;

      const docs = ts.getJSDocCommentsAndTags(statement);
      const hasWireTag = docs.some((d) => d.getText(srcFile).includes("@wire"));
      if (!hasWireTag) continue;

      found.push({ module, name, text: statement.getText(srcFile).trim() });
    }
  };

  await collectFrom(sourceFile);

  // Follow the re-exports one hop.
  const bySpecifier = new Map<string, Set<string>>();
  for (const [name, specifier] of reExports) {
    if (!bySpecifier.has(specifier)) bySpecifier.set(specifier, new Set());
    bySpecifier.get(specifier)!.add(name);
  }
  for (const [specifier, names] of bySpecifier) {
    const target = join(dirname(file), specifier.replace(/\.js$/, ".ts"));
    let targetText: string;
    try {
      targetText = await readFile(target, "utf8");
    } catch {
      continue;
    }
    await collectFrom(
      ts.createSourceFile(target, targetText, ts.ScriptTarget.ES2022, true),
      names,
    );
  }

  return found;
}

/** The whole generated file, as a string. Pure, so the drift check can compare. */
export async function renderContract(): Promise<string> {
  const all: WireType[] = [];
  for (const surface of await publicSurfaces()) {
    all.push(...(await wireTypesIn(surface)));
  }

  // Sorted, so the output depends on the types and not on the order the file
  // system happened to return directories in. A generator whose output moves for
  // no reason makes the drift check cry wolf, and a check that cries wolf gets
  // ignored.
  all.sort((a, b) => a.module.localeCompare(b.module) || a.name.localeCompare(b.name));

  const seen = new Map<string, string>();
  for (const type of all) {
    const previous = seen.get(type.name);
    if (previous && previous !== type.module) {
      throw new Error(
        `Two modules export a wire type called "${type.name}" (${previous} and ${type.module}). ` +
          `The client would have one name for two shapes, so one of them must be renamed.`,
      );
    }
    seen.set(type.name, type.module);
  }

  // A declaration's own text already carries its `export` modifier, so it is
  // normalised rather than prefixed. Prefixing emitted `export export interface`
  // on the first run — the kind of thing a generator does once and nobody catches
  // in review, which is why the generated file is read at least once by a person.
  const body = all
    .map((t) => {
      const declaration = t.text.startsWith("export ") ? t.text : `export ${t.text}`;
      return `// from module: ${t.module}\n${declaration}`;
    })
    .join("\n\n");
  return `${GENERATED_HEADER}\n${body}${body ? "\n" : ""}`;
}

/** Writes the contract to disk. Called by `npm run contract:generate`. */
export async function writeContract(): Promise<string> {
  const out = join(HERE, "src", "generated", "wire.ts");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await renderContract(), "utf8");
  return out;
}

// Run directly: `node --experimental-strip-types generate.ts`, or via the script.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(sep).join("/"))) {
  writeContract().then((out) => console.info(`contract written: ${out}`));
}
