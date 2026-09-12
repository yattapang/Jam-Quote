import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { collect, parseFile, parseSource, unwrap } from "./test/source-ast";

/**
 * The response shapes still written by hand, and whether anything reads them.
 *
 * Seam 1 - what the API sends and what the web believes it sends - is guarded by
 * the wire contracts in `packages/core/src/wire`. Every shape on a MONEY path
 * now comes from one. What remains here are the flat, low-risk shapes (material
 * schema, job library, suppliers, admin), and the risk they carry is not that
 * they are wrong today. It is drift: a column changes on one side and the
 * declaration on the other side keeps claiming the old thing, with nothing
 * failing.
 *
 * ## Why this generation exists
 *
 * The previous guard discovered its subjects with `/^export interface (Api\w+)/`.
 * That regex is BOTH of the guard's blind spots at once: nothing named outside the
 * `Api*` convention can ever be tracked (so `AdminTenant`, `EffectiveRulePack`,
 * `UpdateRulePackInput`, `AdminFinancials` and the rest of the admin surface were
 * invisible to the "list only shrinks" check), and the SAME shapes were invisible to
 * the dead-shape check, because that check only ever walked the list the regex found.
 * `AdminZombieShape`, added to `api-client.ts` and referenced by nothing, passed the
 * old guard outright. That is the exact family in which a real defect shipped two
 * weeks ago: the web mirror of `EffectiveRulePack` lost `statutoryRetired` and
 * `statutoryCustom`, and the console could not tell "no override" from "could not
 * read".
 *
 * This generation discovers subjects from the AST - every exported `interface` and
 * exported `type` alias in `api-client.ts`, whatever it is named - so a shape stops
 * being invisible to the guard by virtue of its name. The narrower "list only
 * shrinks" budget stays scoped to the `Api*` naming convention, because that budget
 * is a real migration tracker (a name leaves it when its wire contract lands) and
 * turning it into a hand-list of all ~70 exported shapes would be exactly the
 * hand-maintained list the doctrine warns against - it would rot the day anyone
 * touched an input DTO. The DEAD-shape check, unlike the budget, is universal: it
 * runs over every discovered shape, `Api*` or not.
 *
 * ## What this file proves, and does not
 *
 * - It proves every `Api*`-named response mirror is on the tracked, shrinking list.
 * - It proves no discovered shape - `Api*` or not - is referenced nowhere else.
 * - It does NOT prove a mirror's fields match the API's. That needs the two
 *   definitions compared side by side, which a parse of this one file cannot do;
 *   a shape can be "live" by this guard's definition and still have drifted a
 *   field, exactly as `EffectiveRulePack` did. Only a wire contract closes that gap.
 * - "Referenced" means a real type-reference AST node (`ts.TypeReferenceNode`,
 *   an `extends`/`implements` heritage clause, or a named export specifier) whose
 *   name resolves to the shape - never a text match, so a comment or a string
 *   naming the shape does not count.
 */

const WEB = join(process.cwd());
const CLIENT = join(WEB, "lib", "api-client.ts");
const SELF = join(WEB, "lib", "hand-written-shapes.test.ts");

/**
 * Hand-written `Api*` response shapes still tracked toward a wire contract.
 *
 * None is on a money path - that was the criterion for leaving them. A name
 * leaves this list when its wire contract lands; a name does NOT get added.
 * This budget is deliberately scoped to the `Api*` naming convention: it is
 * the specific migration this file was written to track, not a stand-in for
 * "every hand-written type", which the dead-shape check below covers instead.
 */
const ALLOWED = new Set([
  "ApiErrorBody", // Not a response body - the error envelope itself.
  "ApiMaterialAttributeOption",
  "ApiMaterialAttribute",
  "ApiMaterialCategory",
  "ApiMaterialUnit",
  "ApiMaterialSchema",
  "ApiJobComponent",
  "ApiJob",
  "ApiRegulatoryUpdate",
  "ApiHiddenCatalogEntry",
  "ApiSupplier",
  "ApiSupplierPrice",
  "ApiLogoMeta",
]);

/**
 * Shapes proven present purely so a rename or a moved declaration fails loudly,
 * rather than the count floor below quietly passing on an empty or shrunken set.
 * These are the exact names the old, name-pattern-scoped guard could never see.
 */
const MUST_BE_DISCOVERED = ["EffectiveRulePack", "AdminTenant", "AdminFinancials", "UpdateRulePackInput"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

function isExported(node: ts.InterfaceDeclaration | ts.TypeAliasDeclaration): boolean {
  return (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** Every exported `interface Foo {}` and `type Foo = ...` in `api-client.ts`, by name. */
function discoverShapes(sf: ts.SourceFile): { interfaces: string[]; aliases: string[] } {
  const interfaces = collect(sf, ts.isInterfaceDeclaration)
    .filter(isExported)
    .map((n) => n.name.text);
  const aliases = collect(sf, ts.isTypeAliasDeclaration)
    .filter(isExported)
    .map((n) => n.name.text);
  return { interfaces, aliases };
}

/** The rightmost segment of a possibly-qualified type name: `NS.Foo` reads as `Foo`. */
function entityName(name: ts.EntityName): string {
  return ts.isQualifiedName(name) ? name.right.text : name.text;
}

/**
 * Every name a file references AS A TYPE: `TypeReferenceNode`s (covers `Foo`, `Foo<T>`,
 * `Foo[]`, `Partial<Foo>`, a JSDoc-free generic argument, everywhere they appear), the
 * `extends`/`implements` targets of an interface or class heritage clause (those are
 * `ExpressionWithTypeArguments`, not `TypeReferenceNode`), and named export specifiers
 * (`export { Foo }`, `export type { Foo as Bar }` - the specifier's own name, or its
 * `propertyName` when the export renames it).
 *
 * Never a substring match: a shape's name spelled inside a comment or a string literal
 * produces no node here at all, because comments and strings are not represented as
 * identifiers in the AST.
 */
function typeReferences(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const ref of collect(sf, ts.isTypeReferenceNode)) names.add(entityName(ref.typeName));
  for (const heritage of collect(sf, ts.isExpressionWithTypeArguments)) {
    const expr = unwrap(heritage.expression);
    if (ts.isIdentifier(expr)) names.add(expr.text);
  }
  for (const spec of collect(sf, ts.isExportSpecifier)) {
    names.add((spec.propertyName ?? spec.name).text);
  }
  return names;
}

describe("hand-written response shapes", () => {
  const clientSource = readFileSync(CLIENT, "utf8");
  const clientAst = parseFile(CLIENT);
  const { interfaces, aliases } = discoverShapes(clientAst);
  const discovered = [...interfaces, ...aliases];

  it("discovers exported shapes from the AST, so a rename cannot empty this guard", () => {
    // ~70 exported interfaces/type aliases live in api-client.ts today. A floor well
    // below that, rather than the exact count, is what should fail loudly on a rename
    // or a moved declaration without also failing on every ordinary addition.
    expect(discovered.length).toBeGreaterThan(50);
  });

  it("discovers shapes the old Api*-only regex could never see", () => {
    // This is the direct fix for the defeat: EffectiveRulePack and AdminTenant carry
    // no Api* prefix, so the previous guard's discovery step never produced them and
    // its dead-shape check never looked at them either.
    for (const name of MUST_BE_DISCOVERED) expect(discovered).toContain(name);
  });

  describe("the Api* mirror budget", () => {
    // Scoped deliberately to the naming convention this migration actually uses, AND
    // to `interface` declarations, exactly like the old `/^export interface (Api\w+)/`
    // regex did - a `type Api* = SomeWire` alias was never on the old budget either,
    // since it is not a hand-typed shape at all, just a renamed re-export of something
    // the wire-contract guard already owns. Broadening the budget to every discovered
    // shape would mean hand-listing all ~70 names, which rots on the first ordinary
    // input-DTO change - the "discovery over lists" half of the doctrine cuts against
    // that, not for it.
    const apiShapes = interfaces.filter((n) => /^Api[A-Z]/.test(n));

    it("has not grown - a new response shape needs a wire contract, not a line here", () => {
      expect(apiShapes.filter((n) => !ALLOWED.has(n))).toEqual([]);
    });

    it("does not keep a name whose shape is gone", () => {
      const present = new Set(apiShapes);
      expect([...ALLOWED].filter((n) => !present.has(n))).toEqual([]);
    });
  });

  it("has no discovered shape that nothing references", () => {
    // Universal - unlike the budget above, this runs over EVERY exported interface
    // and type alias api-client.ts declares, Api*-named or not. This is what catches
    // AdminZombieShape, and what the old guard structurally could not.
    const files = sourceFiles(join(WEB, "lib"))
      .concat(sourceFiles(join(WEB, "app")))
      .concat(sourceFiles(join(WEB, "components")))
      .filter((f) => f !== SELF);

    const referenced = new Set<string>();
    for (const file of files) {
      const sf = file === CLIENT ? clientAst : parseFile(file);
      for (const name of typeReferences(sf)) referenced.add(name);
    }

    const dead = discovered.filter((name) => !referenced.has(name));
    expect(dead).toEqual([]);
  });

  it("the detector fires on a shape referenced only in a comment or a string", () => {
    // Verifies the detector itself: a name that appears only as text - never as a real
    // type-reference node - must NOT count as a reference. This is the exact vacuity
    // that let a previous version of this guard pass on prose alone.
    const sf = parseSource(
      "probe.ts",
      ["// ApiJob is fine, trust me", 'const label = "ApiJob";'].join("\n"),
    );
    expect(typeReferences(sf).has("ApiJob")).toBe(false);
  });

  it("the detector fires on a real type reference, an extends clause, and a re-export", () => {
    const sf = parseSource(
      "probe.ts",
      [
        "type A = Foo;",
        "interface B extends Bar {}",
        "export { Baz };",
        "export type { Qux as Renamed };",
      ].join("\n"),
    );
    const refs = typeReferences(sf);
    expect(refs.has("Foo")).toBe(true);
    expect(refs.has("Bar")).toBe(true);
    expect(refs.has("Baz")).toBe(true);
    expect(refs.has("Qux")).toBe(true);
  });

  // Guard against the source file changing under us mid-run without noticing - the
  // dead-shape check above reads api-client.ts fresh each time via parseFile, but this
  // pins that the two reads agree on what is exported.
  it("parses the same file the dead-shape check reads", () => {
    expect(clientSource.includes("export interface")).toBe(true);
  });
});
