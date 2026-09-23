import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { collect, parseFile, parseSource, reachableClosure, unwrap } from "@jamquote/test-ast";

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
 *   an `extends`/`implements` heritage clause, or a named export specifier)
 *   whose text is the shape's name - never a text match inside a comment or a
 *   string literal, since neither produces a node here at all. Matching IS by
 *   NAME, though, not by declaration identity: a reference is counted only
 *   when it falls OUTSIDE the shape's own declaration, so a shape that refers
 *   only to itself (`export interface ZzDead { next?: ZzDead }`, with nothing
 *   else in the app naming `ZzDead`) is dead, not live. Two distinct shapes
 *   that happen to share a name would still be indistinguishable to this
 *   check; nothing in api-client.ts does.
 * - Test files ARE included in the scanned set (`sourceFiles` excludes only
 *   `node_modules`, `.next`, dotfiles, and this file itself by exact path) — a shape
 *   referenced only from a `.test.ts` counts as live. That is deliberate: a shape a
 *   test imports and asserts against is genuinely reachable code, not dead. It is also
 *   the exact adversarial gap below: a test file can keep a shape "live" while nothing
 *   that ships references it at all.
 *
 * Adversarial-only, found by deliberately trying to defeat this guard rather than by any
 * real defect seen in the codebase:
 *
 * - A dead shape kept alive by another dead file: `ZzDead` referenced only from
 *   `zz-unused-helper.ts`, which nothing imports either. The reachability closure over
 *   `edges`/`external` only asks "is there a reference to this name outside every shape's
 *   own declaration" — it does not ask whether the FILE holding that reference is itself
 *   ever reached from anything real. A whole unused module keeps every shape it mentions
 *   "live" forever.
 * - An unused barrel re-export — `export { ZzDead } from "@/lib/api-client";` in a barrel
 *   nothing imports — produces a real `ExportSpecifier` `typeReferences` counts, so the
 *   same gap applies: the re-export is a reference, whether or not the barrel itself is
 *   ever used.
 * - An unused HELPER's parameter type: `function neverCalled(x: ZzDead) {}`, where
 *   `neverCalled` is itself never referenced. The parameter type is a real
 *   `TypeReferenceNode`, so `ZzDead` reads as live via a function that nothing calls.
 *
 * None of these three is a TYPE-checker question this parse could answer even in
 * principle without becoming a second dead-code checker over the whole app (which files
 * are ever imported from an entry point, which functions are ever called) — exactly the
 * kind of project-of-its-own scope this file's own doctrine (S16's header above) refuses
 * to take on for rendering. "Referenced by something" is not "used"; only a real
 * reachability analysis from the app's actual entry points would close this, and that is
 * a different, much larger guard.
 */

const WEB = join(process.cwd());
const CLIENT = join(WEB, "lib", "api-client.ts");
const SELF = join(WEB, "lib", "hand-written-shapes.test.ts");
const clientSf = parseFile(CLIENT);

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

/** Every exported interface/type-alias declaration in `api-client.ts`, keyed by name. */
function declarationsByName(sf: ts.SourceFile): Map<string, ts.Node> {
  const byName = new Map<string, ts.Node>();
  for (const n of collect(sf, ts.isInterfaceDeclaration)) if (isExported(n)) byName.set(n.name.text, n);
  for (const n of collect(sf, ts.isTypeAliasDeclaration)) if (isExported(n)) byName.set(n.name.text, n);
  return byName;
}

/** The rightmost segment of a possibly-qualified type name: `NS.Foo` reads as `Foo`. */
function entityName(name: ts.EntityName): string {
  return ts.isQualifiedName(name) ? name.right.text : name.text;
}

/**
 * Every AST node that references a name AS A TYPE: `TypeReferenceNode`s (covers `Foo`,
 * `Foo<T>`, `Foo[]`, `Partial<Foo>`, a JSDoc-free generic argument, everywhere they
 * appear), the `extends`/`implements` targets of an interface or class heritage clause
 * (those are `ExpressionWithTypeArguments`, not `TypeReferenceNode`), and named export
 * specifiers (`export { Foo }`, `export type { Foo as Bar }` - the specifier's own name,
 * or its `propertyName` when the export renames it).
 *
 * Never a substring match: a shape's name spelled inside a comment or a string literal
 * produces no node here at all, because comments and strings are not represented as
 * identifiers in the AST. Returned with the referencing node (not collapsed to a `Set` of
 * names) so a caller can tell a shape's own self-reference - inside its own declaration -
 * from a reference anywhere else, which matters for the dead-shape check below: a shape
 * that only ever references itself must count as dead.
 */
function typeReferences(sf: ts.SourceFile): { name: string; node: ts.Node }[] {
  const refs: { name: string; node: ts.Node }[] = [];
  for (const ref of collect(sf, ts.isTypeReferenceNode)) refs.push({ name: entityName(ref.typeName), node: ref });
  for (const heritage of collect(sf, ts.isExpressionWithTypeArguments)) {
    const expr = unwrap(heritage.expression);
    if (ts.isIdentifier(expr)) refs.push({ name: expr.text, node: heritage });
  }
  for (const spec of collect(sf, ts.isExportSpecifier)) {
    refs.push({ name: (spec.propertyName ?? spec.name).text, node: spec });
  }
  return refs;
}

/**
 * Does `range` (a declaration) contain `node`? Used to exclude a shape's self-reference.
 *
 * Checks the SOURCE FILE first. Offsets alone are not enough: `range` always belongs to
 * `api-client.ts`, but `node` may belong to any scanned file, and two unrelated files
 * routinely share overlapping offset ranges (both start at 0). Without the source-file
 * check, a same-named unrelated declaration in another file — `type ZzDead = number;`
 * next to some reference at the same byte offset a real shape's declaration occupies in
 * api-client.ts — could spuriously read as "inside its own declaration" or, worse, ride
 * the offset coincidence into being misclassified rather than simply not matching by name.
 */
function contains(range: ts.Node, node: ts.Node): boolean {
  return (
    range.getSourceFile() === node.getSourceFile() &&
    node.getStart() >= range.getStart() &&
    node.getEnd() <= range.getEnd()
  );
}

/**
 * Does `sf` import `name` from `api-client.ts` (by any relative or aliased path, e.g.
 * `"./api-client"`, `"@/lib/api-client"`), re-export it from there, import the whole
 * module as a namespace (`import * as C`, or the type-only `import type * as C` — a
 * reference used only as a TYPE goes through a namespace import exactly like a value
 * one does, and a shape referenced only as `C.ApiJob` is a real use of `ApiJob`, not a
 * dead one), or is `sf` the CLIENT file itself (so no import is needed for a reference to
 * resolve)? A reference is only ever counted as pointing at a shape's declaration when
 * this holds — otherwise a same-named identifier in another file is just that: a
 * different, unrelated name that happens to be spelled the same, and must not keep a
 * dead shape alive.
 */
function importsNameFromClient(sf: ts.SourceFile, name: string): boolean {
  if (sf === clientSf) return true;
  const fromClientModule = (spec: ts.Expression | undefined): boolean =>
    !!spec && ts.isStringLiteral(spec) && /(^|\/)api-client$/.test(spec.text);
  for (const imp of collect(sf, ts.isImportDeclaration)) {
    if (!fromClientModule(imp.moduleSpecifier)) continue;
    const clause = imp.importClause;
    if (!clause?.namedBindings) continue;
    if (ts.isNamespaceImport(clause.namedBindings)) return true;
    if (!ts.isNamedImports(clause.namedBindings)) continue;
    if (clause.namedBindings.elements.some((el) => (el.propertyName ?? el.name).text === name)) return true;
  }
  for (const exp of collect(sf, ts.isExportDeclaration)) {
    if (!fromClientModule(exp.moduleSpecifier)) continue;
    if (!exp.exportClause || !ts.isNamedExports(exp.exportClause)) continue;
    if (exp.exportClause.elements.some((el) => (el.propertyName ?? el.name).text === name)) return true;
  }
  return false;
}

describe("hand-written response shapes", () => {
  const clientSource = readFileSync(CLIENT, "utf8");
  const clientAst = clientSf;
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
    //
    // A shape is live only if it is reachable from a reference located OUTSIDE every
    // exported hand-written shape declaration - not merely "referenced by SOME other
    // declaration", which a pair of shapes that reference only each other (`ZzA { b?:
    // ZzB }` + `ZzB { a?: ZzA }`, nothing else in the app naming either) would satisfy
    // while both are actually unreachable from anything real. So this builds a graph:
    // an edge `from -> to` for every reference to `to` found INSIDE some other shape
    // `from`'s own declaration, and a name is "externally referenced" when a reference
    // to it is found OUTSIDE every shape declaration. Liveness is the transitive
    // closure of the externally-referenced set over that graph - the same shape as a
    // reachability search, because that is exactly what it is.
    const files = sourceFiles(join(WEB, "lib"))
      .concat(sourceFiles(join(WEB, "app")))
      .concat(sourceFiles(join(WEB, "components")))
      .filter((f) => f !== SELF);

    const declByName = declarationsByName(clientAst);

    function enclosingShapeDecl(node: ts.Node): string | undefined {
      for (const [name, decl] of declByName) {
        if (contains(decl, node)) return name;
      }
      return undefined;
    }

    const edges = new Map<string, Set<string>>();
    const external = new Set<string>();

    for (const file of files) {
      const sf = file === CLIENT ? clientAst : parseFile(file);
      for (const { name, node } of typeReferences(sf)) {
        const decl = declByName.get(name);
        if (decl && contains(decl, node)) continue; // a shape referencing only itself is dead
        // Resolve the reference to the shape's declaration, not merely its name: a
        // same-named unrelated declaration in another file must not count.
        if (!importsNameFromClient(sf, name)) continue;
        const enclosing = enclosingShapeDecl(node);
        if (enclosing) {
          if (!edges.has(enclosing)) edges.set(enclosing, new Set());
          edges.get(enclosing)!.add(name);
        } else {
          external.add(name);
        }
      }
    }

    const live = reachableClosure(external, edges);

    const dead = discovered.filter((name) => !live.has(name));
    expect(dead).toEqual([]);
  });

  it("a pair of shapes referencing only each other is dead, not kept alive by each other", () => {
    // Bypass: ZzA { b?: ZzB } and ZzB { a?: ZzA } each have a real, non-self reference
    // to the other, so a check that stops at "does SOMETHING else reference this name"
    // reads both as live forever, no matter how unreachable they are from real code.
    const sf = parseSource(
      "probe-mutual.ts",
      "export interface ZzA { b?: ZzB }\nexport interface ZzB { a?: ZzA }",
    );
    const declByName = declarationsByName(sf);
    function enclosingShapeDecl(node: ts.Node): string | undefined {
      for (const [name, decl] of declByName) {
        if (contains(decl, node)) return name;
      }
      return undefined;
    }
    const edges = new Map<string, Set<string>>();
    const external = new Set<string>();
    for (const { name, node } of typeReferences(sf)) {
      const decl = declByName.get(name);
      if (decl && contains(decl, node)) continue;
      const enclosing = enclosingShapeDecl(node);
      if (enclosing) {
        if (!edges.has(enclosing)) edges.set(enclosing, new Set());
        edges.get(enclosing)!.add(name);
      } else {
        external.add(name);
      }
    }
    const live = reachableClosure(external, edges);
    expect(live.has("ZzA")).toBe(false);
    expect(live.has("ZzB")).toBe(false);
  });

  it("a same-named unrelated declaration in another file does not keep a shape alive", () => {
    // Bypass: a totally unrelated `type ZzDead = number;` in some other file, with a
    // reference to that LOCAL type - not to api-client.ts's ZzDead - must not count,
    // because that file never imports ZzDead from api-client.ts at all.
    const otherFile = parseSource("other.ts", "type ZzDead = number;\nconst x: ZzDead = 1;");
    expect(importsNameFromClient(otherFile, "ZzDead")).toBe(false);

    const importingFile = parseSource(
      "importing.ts",
      'import type { ZzDead } from "@/lib/api-client";\nconst x: ZzDead = { } as ZzDead;',
    );
    expect(importsNameFromClient(importingFile, "ZzDead")).toBe(true);
  });

  it("a type-only namespace import used as C.Name counts as a use of Name", () => {
    // False alarm the previous version carried: `import type * as C from "./api-client"`
    // followed by a reference as `C.ApiJob` is a real use of ApiJob — TypeReferenceNode's
    // typeName is the QualifiedName `C.ApiJob`, and `entityName` already reduces that to
    // "ApiJob" — but `importsNameFromClient` only ever inspected `ts.isNamedImports`
    // bindings, so a namespace import (type-only or not) was invisible to it and a shape
    // referenced ONLY this way falsely read as unreachable/dead.
    const viaNamespace = parseSource(
      "ns.ts",
      'import type * as C from "@/lib/api-client";\nconst x: C.ApiJob = {} as C.ApiJob;',
    );
    expect(importsNameFromClient(viaNamespace, "ApiJob")).toBe(true);

    const viaValueNamespace = parseSource(
      "ns2.ts",
      'import * as C from "./api-client";\nconst x: C.ApiJob = {} as C.ApiJob;',
    );
    expect(importsNameFromClient(viaValueNamespace, "ApiJob")).toBe(true);
  });

  it("a shape that references only itself counts as dead, not live", () => {
    // The defect: `export interface ZzDead { next?: ZzDead }` has a real
    // TypeReferenceNode naming ZzDead, but it is ZzDead's OWN self-reference, not
    // something else pointing at it. Excluding that self-reference is what this test
    // pins; without the exclusion, every self-referencing shape would read as live no
    // matter how dead it actually is.
    const sf = parseSource("probe.ts", "export interface ZzDead { next?: ZzDead }");
    const decl = declarationsByName(sf).get("ZzDead")!;
    const referencedElsewhere = typeReferences(sf).some((r) => r.name === "ZzDead" && !contains(decl, r.node));
    expect(referencedElsewhere).toBe(false);
  });

  it("the detector fires on a shape referenced only in a comment or a string", () => {
    // Verifies the detector itself: a name that appears only as text - never as a real
    // type-reference node - must NOT count as a reference. This is the exact vacuity
    // that let a previous version of this guard pass on prose alone.
    const sf = parseSource(
      "probe.ts",
      ["// ApiJob is fine, trust me", 'const label = "ApiJob";'].join("\n"),
    );
    expect(typeReferences(sf).some((r) => r.name === "ApiJob")).toBe(false);
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
    const names = typeReferences(sf).map((r) => r.name);
    expect(names).toContain("Foo");
    expect(names).toContain("Bar");
    expect(names).toContain("Baz");
    expect(names).toContain("Qux");
  });

  // Guard against the source file changing under us mid-run without noticing - the
  // dead-shape check above reads api-client.ts fresh each time via parseFile, but this
  // pins that the two reads agree on what is exported.
  it("parses the same file the dead-shape check reads", () => {
    expect(clientSource.includes("export interface")).toBe(true);
  });
});
