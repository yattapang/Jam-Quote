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
 * An exported interface **or type alias** in a module's public surface (`index.ts`) carrying the
 * `@wire` tag in its doc comment. Opt-in, not everything-exported, because most of a module's
 * surface is internal to the server and a client that could see it would start depending on it.
 *
 * F4 (independent review, 2026-09-24): it used to collect only interfaces, so a `@wire` **type
 * alias** vanished silently — and the "found at least one @wire type" check could not see the
 * loss, because other types were still found. A generator that drops a subject without saying so
 * is the quietest failure in this whole system: the client simply never learns the shape exists.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not emit an HTTP client, and there is no OpenAPI document yet, because
 * there are no routes yet. When the HTTP layer lands, this script grows to emit
 * the operations too; the drift check around it does not change. Building the
 * whole pipeline now, against no routes, would produce a check that proves nothing
 * — which Rule 8 calls worse than no check at all.
 *
 * F5 (independent review, 2026-09-24): this comment used to claim a `@wire` interface whose
 * fields reference types declared elsewhere "is rejected rather than half-emitted" — and **no
 * such code existed**. An interface with a dangling `QuoteStatus` and a `Buffer` field emitted
 * verbatim, so a server-only shape could reach the client contract with nothing failing. A
 * comment describing a check that does not exist is worse than no comment: it is the reason
 * nobody looks.
 *
 * The check is now real. Every type a `@wire` declaration references must be either a JSON
 * primitive or another emitted `@wire` type. `Buffer`, `Date`, a Prisma model, an enum declared
 * in the server's own module — all rejected by name, with the reason. `Date` is rejected
 * deliberately: JSON has no date, so a client receives a string and a contract saying `Date` is
 * a lie that type-checks.
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
  /** Every type name this declaration refers to, for the F5 check. */
  readonly referenced: readonly string[];
}

/**
 * Types a client can actually receive over JSON.
 *
 * Deliberately short. `Date` is absent on purpose: JSON has no date type, so the client receives a
 * string, and a contract that says `Date` is a lie that happens to type-check. `Buffer`, `Map`,
 * `Set` and every server type are absent for the same reason — they do not survive the wire.
 */
const JSON_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "null",
  "undefined",
  "unknown",
  "Array",
  "Readonly",
  "ReadonlyArray",
  "Record",
  "Partial",
  "Pick",
  "Omit",
]);

/**
 * Every type name a declaration refers to.
 *
 * Read from type positions only, so a property called `status` does not look like a reference to
 * a type called `status`.
 */
function referencedTypeNames(node: ts.Node, srcFile: ts.SourceFile): string[] {
  const names: string[] = [];
  const visit = (child: ts.Node): void => {
    if (ts.isTypeReferenceNode(child)) {
      const typeName = child.typeName;
      names.push(ts.isIdentifier(typeName) ? typeName.text : typeName.getText(srcFile));
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return names;
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
      // Interfaces AND type aliases (F4). A union — `type QuoteStatus = "draft" | "sent"` — is a
      // wire shape as much as an object is, and it is exactly the kind a server declares as an
      // alias rather than an interface.
      const isWireCandidate =
        ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement);
      if (!isWireCandidate) continue;

      const name = statement.name.text;
      if (onlyNamed && !onlyNamed.has(name)) continue;

      const docs = ts.getJSDocCommentsAndTags(statement);
      const hasWireTag = docs.some((d) => d.getText(srcFile).includes("@wire"));
      if (!hasWireTag) continue;

      found.push({
        module,
        name,
        text: statement.getText(srcFile).trim(),
        referenced: referencedTypeNames(statement, srcFile),
      });
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

  // F5: every referenced type must be JSON-representable or another emitted @wire type.
  const emitted = new Set(all.map((t) => t.name));
  for (const type of all) {
    for (const reference of type.referenced) {
      if (JSON_TYPES.has(reference) || emitted.has(reference)) continue;
      throw new Error(
        `@wire type "${type.name}" (module ${type.module}) refers to "${reference}", which is ` +
          `neither a JSON type nor another @wire type. A client cannot receive it, so emitting ` +
          `this would put a shape in the contract that the wire cannot carry. Either mark ` +
          `"${reference}" as @wire too, or change the field to something JSON can represent.` +
          (reference === "Date"
            ? ` (Date is refused on purpose: JSON has no date, so the client gets a string.)`
            : ""),
      );
    }
  }

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
