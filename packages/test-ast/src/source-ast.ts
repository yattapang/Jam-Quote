import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * ONE parser for every source guard in every workspace (`@jamquote/test-ast`).
 *
 * It lived at `apps/web/lib/test/source-ast.ts` until core's retention guard needed the
 * same binder-based resolution and, unable to import a web test helper, grew a second
 * resolver of its own - the drift rule 2 of `.claude/agents/README.md` forbids. It is now
 * a private workspace package that emits `dist` like core, is a devDependency only, and
 * is never imported by runtime code.
 *
 * ## Why this file exists
 *
 * Eleven generations of source-scanning guard in this repo were defeated by rewrites
 * that changed no behaviour: deleting the spaces around an arrow, wrapping a digit in
 * braces, quoting a string, `min={"0"}`, a template-literal path, a const path, a call
 * nested inside an argument, `CURRENCY_CODES[0]`, `{+3}`, `String("JMD")`, a `let`, a
 * dead call left for the scanner to find. Every one of them had written its OWN matcher
 * — a regex, a brace counter, a hand-rolled argument splitter — and the matcher was
 * where the defect lived. One of those parsers returned an empty key list for every
 * input and asserted nothing for three rewrites.
 *
 * The guards that held all stopped reading text. This is the TypeScript compiler's own
 * parser with one shared analysis on top, so a guard asks a question about SHAPE and
 * the spelling of the source stops mattering. It has its own tests, and every
 * historical bypass above is one of them.
 *
 * ## How names are resolved
 *
 * By the compiler's binder, not by hand. The first version keyed declarations and
 * writes by NAME across the whole file, so a module `const cur = "JMD"` was reported as
 * data the moment any unrelated function had a parameter `cur` — a bypass nobody had to
 * try for. Each analysed file now gets a one-file `ts.Program` (no lib, no module
 * resolution; built lazily, cached per SourceFile) and `checker.getSymbolAtLocation`
 * says which declaration binds an identifier, through blocks, functions, catch clauses
 * and the module. Writes are judged for that symbol only.
 *
 * ## What "static" means, and where the direction of error lies
 *
 * Guards read `static === true` as "hardcoded — reject". Reporting a constant as data is
 * a BYPASS; reporting data as a constant is a false alarm. Genuinely unknowable cases
 * resolve toward data. That is a choice, and each case below is a bypass it leaves open.
 *
 * ## What it does not do — read this before relying on a result
 *
 * - It does not cross a module boundary. An import is opaque: a property or index READ
 *   of it counts as static (reported in `roots`), the bare binding does not, and a
 *   METHOD CALL on anything rooted in an import (`CURRENCY_CODES[0].toLowerCase()`) is
 *   data, because imported namespaces are where functions live.
 * - It does not substitute arguments into a function. `const f = () => "JMD"; f()` is
 *   static; `const id = (c) => c; id("JMD")` is data.
 * - It does not follow an object into a function it is passed to. `mutate(o); o.a` stays
 *   static if `o` was built from literals; so does `Object.assign(o, load())`. Writes it
 *   does see: `o.a = …`, `o[k] = …`, `++`/`--`/`delete` through a property, a property
 *   as a destructuring or for-of target, and the Array mutators (`push`, `splice`, …)
 *   called with a non-static argument. Writes of static values keep an object static.
 * - Global functions are recognised only from `DETERMINISTIC_GLOBALS`, a hand-picked
 *   list. A call to any other global is data, however pure it is.
 * - `callsTo` needs the function's name spelled somewhere in the file; a computed key
 *   (`x["format" + "Money"]`) or `.bind` is not followed. `.apply` with an array that is
 *   not a literal yields a call whose arguments are unknown (a single spread).
 * - `jsxAttributes` follows spreads of object literals and of never-written bindings to
 *   them; `{...props}` from a parameter or a call is not reported.
 * - A destructured PARAMETER's default is data, even when every call site in the file
 *   happens to omit the argument: `function F({ cap = 100 }) { return <input max={cap}/> }`
 *   reads `cap` as a parameter, not a `BindingElement` reachable from a
 *   `VariableDeclaration`, so `declarationIsStatic` refuses it on purpose. Treating it as
 *   static would be unsound the moment ANY caller supplies a real argument — the same
 *   source location would then render two different things depending on the caller, which
 *   is exactly the "genuinely unknowable" case this file's own tie-break sends toward data,
 *   not toward a false alarm. A class `static` FIELD read as `L.CAP` does not have this
 *   problem (it belongs to the class, not to a call site) and IS treated as static, via
 *   `staticClassFieldIsStatic`, when it is declared with a static initializer and never
 *   written to elsewhere.
 */

export function parseFile(path: string): ts.SourceFile {
  return parseSource(path, readFileSync(path, "utf8"));
}

/**
 * `ts.createSourceFile` parses even badly broken text into a best-effort tree — it never
 * throws on its own. Every guard here is a claim about the SHAPE of real source, and a
 * shape read from a file that does not compile proves nothing. `parseDiagnostics` is the
 * parser's own internal record of what it could not make sense of (not part of the public
 * `.d.ts`, hence the cast); a non-empty list means the tree is a guess, not a parse, so a
 * guard reading it would stay green over a syntax error nobody noticed.
 */
export function parseSource(fileName: string, text: string): ts.SourceFile {
  const kind = /\.[jt]sx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const diagnostics = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics ?? [];
  if (diagnostics.length > 0) {
    const first = diagnostics[0]!;
    const message = ts.flattenDiagnosticMessageText(first.messageText, "\n");
    const at = sf.getLineAndCharacterOfPosition(first.start ?? 0);
    throw new Error(`source-ast: ${fileName}:${at.line + 1}:${at.character + 1} does not parse: ${message}`);
  }
  return sf;
}

/** Depth-first visit of every node. */
export function walk(node: ts.Node, visit: (node: ts.Node) => void): void {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** Every node satisfying a type guard. */
export function collect<T extends ts.Node>(root: ts.Node, test: (node: ts.Node) => node is T): T[] {
  const found: T[] = [];
  walk(root, (node) => {
    if (test(node)) found.push(node);
  });
  return found;
}

/** Strip parentheses, `as`, `satisfies`, `!` and `<T>` — none of them change a value. */
export function unwrap(expr: ts.Expression): ts.Expression {
  let current = expr;
  for (;;) {
    if (ts.isParenthesizedExpression(current)) current = current.expression;
    else if (ts.isAsExpression(current)) current = current.expression;
    else if (ts.isSatisfiesExpression(current)) current = current.expression;
    else if (ts.isNonNullExpression(current)) current = current.expression;
    else if (ts.isTypeAssertionExpression(current)) current = current.expression;
    else return current;
  }
}

/** The inverse of `unwrap`: the outermost wrapper around a node that is the same value. */
function climb(expr: ts.Expression): ts.Expression {
  let current = expr;
  for (;;) {
    const p = current.parent;
    if (
      p &&
      (ts.isParenthesizedExpression(p) ||
        ts.isAsExpression(p) ||
        ts.isSatisfiesExpression(p) ||
        ts.isNonNullExpression(p) ||
        ts.isTypeAssertionExpression(p))
    ) {
      current = p;
    } else {
      return current;
    }
  }
}

// ───────────────────────────────────────────────────────────── binding resolution

interface FileContext {
  checker: ts.TypeChecker;
  /** Every identifier in the file, by text — the candidates for a symbol's references. */
  byName: Map<string, ts.Identifier[]>;
  /** Per symbol: has anything written to it, or written data into it? */
  taint: Map<ts.Symbol, boolean>;
}

const contexts = new WeakMap<ts.SourceFile, FileContext>();

function fileContext(node: ts.Node): FileContext {
  const sf = node.getSourceFile();
  const cached = contexts.get(sf);
  if (cached) return cached;

  const norm = (f: string) => f.replace(/\\/g, "/");
  const host: ts.CompilerHost = {
    getSourceFile: (name) => (norm(name) === norm(sf.fileName) ? sf : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "",
    getCanonicalFileName: (f) => f,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => norm(name) === norm(sf.fileName),
    readFile: () => undefined,
  };
  const program = ts.createProgram({
    rootNames: [sf.fileName],
    options: { noLib: true, noResolve: true, types: [], allowJs: true, jsx: ts.JsxEmit.Preserve },
    host,
  });
  if (!program.getSourceFiles().includes(sf)) {
    throw new Error(`source-ast: the binder did not receive ${sf.fileName}; no name in it can be resolved`);
  }

  const byName = new Map<string, ts.Identifier[]>();
  walk(sf, (n) => {
    if (!ts.isIdentifier(n)) return;
    const list = byName.get(n.text) ?? [];
    list.push(n);
    byName.set(n.text, list);
  });

  const ctx: FileContext = { checker: program.getTypeChecker(), byName, taint: new Map() };
  contexts.set(sf, ctx);
  return ctx;
}

function resolve(id: ts.Identifier, fc: FileContext): ts.Symbol | undefined {
  const p = id.parent;
  if (p && ts.isShorthandPropertyAssignment(p) && p.name === id) {
    return fc.checker.getShorthandAssignmentValueSymbol(p);
  }
  return fc.checker.getSymbolAtLocation(id);
}

function isImport(sym: ts.Symbol): boolean {
  return (
    (sym.flags & ts.SymbolFlags.Alias) !== 0 &&
    (sym.declarations ?? []).some(
      (d) =>
        ts.isImportSpecifier(d) || ts.isImportClause(d) || ts.isNamespaceImport(d) || ts.isImportEqualsDeclaration(d),
    )
  );
}

function valueDeclarations(sym: ts.Symbol): ts.Declaration[] {
  return (sym.declarations ?? []).filter((d) => !ts.isInterfaceDeclaration(d) && !ts.isTypeAliasDeclaration(d));
}

const isAssignmentOperator = (kind: ts.SyntaxKind) =>
  kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;

/**
 * Is this node — an element, property value, shorthand or default inside an array or
 * object literal — part of a literal that is itself being assigned INTO?
 * `[x] = rows`, `({ x } = load())`, `for ([k, v] of entries)`.
 */
function inDestructuringTarget(node: ts.Node): boolean {
  const p = node.parent;
  if (!p) return false;
  let literal: ts.Node;
  if (ts.isArrayLiteralExpression(p)) literal = p;
  else if (ts.isSpreadElement(p) || ts.isSpreadAssignment(p)) literal = p.parent;
  else if (ts.isShorthandPropertyAssignment(p) && p.name === node) literal = p.parent;
  else if (ts.isPropertyAssignment(p) && p.initializer === node) literal = p.parent;
  else if (ts.isBinaryExpression(p) && p.left === node && p.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    return inDestructuringTarget(p);
  } else return false;
  if (!ts.isArrayLiteralExpression(literal) && !ts.isObjectLiteralExpression(literal)) return false;
  const top = climb(literal);
  const tp = top.parent;
  if (ts.isBinaryExpression(tp) && tp.left === top && tp.operatorToken.kind === ts.SyntaxKind.EqualsToken) return true;
  if ((ts.isForOfStatement(tp) || ts.isForInStatement(tp)) && tp.initializer === top) return true;
  return inDestructuringTarget(top);
}

type Write = "none" | "update" | "destructure" | { value: ts.Expression };

/** How, if at all, the value at this (climbed) expression is written to. */
function writeOf(node: ts.Expression): Write {
  const p = node.parent;
  if (ts.isBinaryExpression(p) && p.left === node && isAssignmentOperator(p.operatorToken.kind)) {
    return inDestructuringTarget(p) ? "destructure" : { value: p.right };
  }
  if (
    (ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) &&
    (p.operator === ts.SyntaxKind.PlusPlusToken || p.operator === ts.SyntaxKind.MinusMinusToken)
  ) {
    return "update";
  }
  if (ts.isDeleteExpression(p)) return "update";
  if ((ts.isForOfStatement(p) || ts.isForInStatement(p)) && p.initializer === node) return "destructure";
  if (inDestructuringTarget(node)) return "destructure";
  return "none";
}

/**
 * The language's Array mutators — the only built-in methods that can write into a value
 * this analysis calls static, since such a value is only ever an array, a plain object
 * or a primitive. Taken from Array.prototype as of ES2024; a later edition may add one.
 */
const ARRAY_MUTATORS = new Set(["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "fill", "copyWithin"]);

/**
 * Does this reference write to its binding, or write DATA into the object it holds?
 */
function referenceTaints(id: ts.Identifier): boolean {
  let cur: ts.Expression = id;
  let hops = 0;
  const keys: ts.Expression[] = [];
  const keysStatic = () => keys.every((k) => isStatic(k, freshCtx()));

  for (;;) {
    cur = climb(cur);
    const p = cur.parent;
    if (ts.isPropertyAccessExpression(p) && p.expression === cur) {
      const callee = climb(p);
      const call = callee.parent;
      if (ARRAY_MUTATORS.has(p.name.text) && ts.isCallExpression(call) && call.expression === callee) {
        if (!keysStatic() || !call.arguments.every((a) => isStatic(a, freshCtx()))) return true;
      }
      cur = p;
      hops++;
      continue;
    }
    if (ts.isElementAccessExpression(p) && p.expression === cur) {
      keys.push(p.argumentExpression);
      cur = p;
      hops++;
      continue;
    }
    break;
  }

  const write = writeOf(cur);
  if (write === "none") return false;
  if (hops === 0) return true; // the binding itself is reassigned
  if (write === "destructure") return true;
  if (write === "update") return !keysStatic();
  return !keysStatic() || !isStatic(write.value, freshCtx());
}

/** Has this binding been reassigned, or had data written into it, anywhere in the file? */
function bindingTainted(sym: ts.Symbol, fc: FileContext): boolean {
  const known = fc.taint.get(sym);
  if (known !== undefined) return known;
  // Optimistic while computing, so `o.a = o.b` does not loop. A write can only taint by
  // bringing in something non-static, which is found independently of this assumption.
  fc.taint.set(sym, false);
  let tainted = false;
  for (const ref of fc.byName.get(sym.name) ?? []) {
    if (resolve(ref, fc) === sym && referenceTaints(ref)) {
      tainted = true;
      break;
    }
  }
  fc.taint.set(sym, tainted);
  return tainted;
}

/** A never-written local binding's initializer, for following an alias. */
function aliasInitializer(id: ts.Identifier, fc: FileContext): ts.Expression | undefined {
  const sym = resolve(id, fc);
  if (!sym || isImport(sym) || bindingTainted(sym, fc)) return undefined;
  const decls = valueDeclarations(sym);
  if (decls.length !== 1) return undefined;
  const d = decls[0]!;
  return ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) ? d.initializer : undefined;
}

/**
 * Public wrapper over `aliasInitializer`, for guards that need to follow a never-written
 * local alias back to its initializer through the shared binder — e.g. `const ru = l.rateUnit`
 * then a later read of `ru`. Returns `undefined` for an import, a reassigned/tainted
 * binding, a binding with more than one declaration, or a declaration that is not a plain
 * `const`/`let x = …`.
 */
export function followAlias(id: ts.Identifier): ts.Expression | undefined {
  return aliasInitializer(id, fileContext(id));
}

// ─────────────────────────────────────────────────────────────── call discovery

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Does this callee expression evaluate to the function called `name`? */
function namesTarget(raw: ts.Expression, name: string, fc: () => FileContext, seen: Set<ts.Node>): boolean {
  const e = unwrap(raw);
  if (seen.has(e)) return false;
  seen.add(e);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return namesTarget(e.right, name, fc, seen);
  }
  if (ts.isConditionalExpression(e)) {
    return namesTarget(e.whenTrue, name, fc, seen) || namesTarget(e.whenFalse, name, fc, seen);
  }
  if (ts.isPropertyAccessExpression(e)) return e.name.text === name;
  if (ts.isElementAccessExpression(e)) {
    const key = unwrap(e.argumentExpression);
    return (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) && key.text === name;
  }
  if (!ts.isIdentifier(e)) return false;
  if (e.text === name) return true;
  const ctx = fc();
  const sym = resolve(e, ctx);
  if (!sym) return false;
  // `import { formatPlatformMoney as fpm }`
  if ((sym.declarations ?? []).some((d) => ts.isImportSpecifier(d) && (d.propertyName ?? d.name).text === name)) {
    return true;
  }
  const init = aliasInitializer(e, ctx);
  return init !== undefined && namesTarget(init, name, fc, seen);
}

/** A CallExpression standing for `original`, but carrying the arguments the target receives. */
function reshapedCall(original: ts.CallExpression, callee: ts.Expression, args: readonly ts.Expression[]): ts.CallExpression {
  const call = ts.factory.createCallExpression(callee, undefined, []) as Mutable<ts.CallExpression>;
  call.expression = callee as ts.LeftHandSideExpression;
  call.arguments = ts.factory.createNodeArray(args);
  ts.setTextRange(call, original);
  call.parent = original.parent;
  return call;
}

/**
 * Does `raw` (a callee, or the receiver of `.call`/`.apply`) resolve, through the shared
 * binder, to the import of `exportedName` from `moduleSpecifier`? Accepts a direct or
 * aliased named import used bare (`fn(...)`, or via a never-written local alias
 * `const f = fn; f(...)`) and a namespace-import property (`NS.fn(...)`). Unlike
 * `namesTarget`, this never matches on SPELLING alone — a same-named local function, a
 * shadowed import, or an object literal with a same-named method (the
 * `({ lineUnitLabel: … }).lineUnitLabel(...)` bypass) all resolve to a different symbol
 * or no import symbol at all, and so do not match.
 */
function calleeIsImport(
  raw: ts.Expression,
  fc: FileContext,
  moduleSpecifier: string,
  exportedName: string,
  seen: Set<ts.Node> = new Set(),
): boolean {
  const e = unwrap(raw);
  if (seen.has(e)) return false;
  seen.add(e);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return calleeIsImport(e.right, fc, moduleSpecifier, exportedName, seen);
  }
  if (ts.isConditionalExpression(e)) {
    return (
      calleeIsImport(e.whenTrue, fc, moduleSpecifier, exportedName, seen) ||
      calleeIsImport(e.whenFalse, fc, moduleSpecifier, exportedName, seen)
    );
  }
  if (ts.isIdentifier(e)) {
    const sym = resolve(e, fc);
    if (!sym) return false;
    for (const d of sym.declarations ?? []) {
      if (ts.isImportSpecifier(d)) {
        const imported = (d.propertyName ?? d.name).text;
        const decl = enclosingImportDeclaration(d);
        if (imported === exportedName && decl && moduleSpecifierOf(decl) === moduleSpecifier) return true;
      }
    }
    const init = aliasInitializer(e, fc);
    return init !== undefined && calleeIsImport(init, fc, moduleSpecifier, exportedName, seen);
  }
  if (ts.isElementAccessExpression(e)) {
    const key = unwrap(e.argumentExpression);
    if (!ts.isStringLiteral(key) && !ts.isNoSubstitutionTemplateLiteral(key)) return false;
    return calleeNamespaceMatch(e.expression, key.text, fc, moduleSpecifier, exportedName);
  }
  if (ts.isPropertyAccessExpression(e)) {
    return calleeNamespaceMatch(e.expression, e.name.text, fc, moduleSpecifier, exportedName);
  }
  return false;
}

/** Is `obj.propName` a namespace-import property naming the approved export? */
function calleeNamespaceMatch(
  obj: ts.Expression,
  propName: string,
  fc: FileContext,
  moduleSpecifier: string,
  exportedName: string,
): boolean {
  if (propName !== exportedName) return false;
  const inner = unwrap(obj);
  if (!ts.isIdentifier(inner)) return false;
  const sym = resolve(inner, fc);
  if (!sym) return false;
  for (const d of sym.declarations ?? []) {
    if (ts.isNamespaceImport(d)) {
      const decl = enclosingImportDeclaration(d);
      if (decl && moduleSpecifierOf(decl) === moduleSpecifier) return true;
    }
  }
  return false;
}

/**
 * Does `raw` (a callee) resolve, through the shared binder, to THIS SPECIFIC local
 * declaration — not merely to a same-named one? Accepts a bare identifier, or a
 * never-written local alias of one (`const f = pricingProblem; f()`). Built for a
 * validator declared IN the file being scanned (a local function or `const` arrow),
 * where `importedFrom` cannot apply because there is no import to resolve to — the
 * binder's symbol identity is used instead, the same way `calleeIsImport` uses it for
 * an import: a locally SHADOWING declaration (`const pricingProblem = () => null;`
 * placed after the real one, with the call site rewired to it) resolves to a
 * different symbol whose declarations do not include `declaration`, so it does not
 * match — closing the exact gap spelling-only `namesTarget` left open.
 */
function calleeIsDeclaration(
  raw: ts.Expression,
  fc: FileContext,
  declaration: ts.Node,
  seen: Set<ts.Node> = new Set(),
): boolean {
  const e = unwrap(raw);
  if (seen.has(e)) return false;
  seen.add(e);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.CommaToken) {
    return calleeIsDeclaration(e.right, fc, declaration, seen);
  }
  if (ts.isConditionalExpression(e)) {
    return (
      calleeIsDeclaration(e.whenTrue, fc, declaration, seen) ||
      calleeIsDeclaration(e.whenFalse, fc, declaration, seen)
    );
  }
  if (!ts.isIdentifier(e)) return false;
  const sym = resolve(e, fc);
  if (!sym) return false;
  if ((sym.declarations ?? []).some((d): boolean => (d as ts.Node) === declaration)) return true;
  const init = aliasInitializer(e, fc);
  return init !== undefined && calleeIsDeclaration(init, fc, declaration, seen);
}

/**
 * Every call to a function by name — `name(...)`, `x.name(...)`, `x?.name(...)`,
 * `(name)(...)`, `x["name"](...)`, `(0, name)(...)`, a call through a never-written
 * alias (`const f = name; f(...)`, `import { name as f }`), and `name.call(...)` /
 * `name.apply(...)` — however deeply nested and however it is formatted.
 *
 * Arguments come back as real nodes. The hand-rolled splitter this replaces could not
 * see past the `)` of `Number(...)` inside an argument, so a hardcoded currency behind
 * one walked straight through.
 *
 * For `.call` and `.apply` the returned node is NOT the one in the tree: it is a
 * CallExpression with the original's text range and parent whose `arguments` are what
 * the function actually receives — `this` dropped, `.apply`'s array literal spread. A
 * guard reading `call.arguments[1]` therefore reads the right argument. `.apply` over
 * anything but an array literal yields a single spread argument: unknown.
 *
 * By default the callee is matched by SPELLING (`namesTarget`) — sound for a name local
 * to the file being scanned, but a bypass the moment the same text can be spelled another
 * way: `x.lineUnitLabel(...)` counts for ANY object with a `lineUnitLabel` property,
 * including one built on the spot (`({ lineUnitLabel: (u) => u }).lineUnitLabel(l.rateUnit)`),
 * and a local function or object literal that merely shares the name shadows the real one
 * without the guard noticing. Pass `importedFrom` to close that: the callee must then
 * resolve, through the binder, to the import of `importedFrom.exportedName` from
 * `importedFrom.moduleSpecifier` — a direct or aliased identifier, a never-written local
 * alias of one, or a namespace-import property. For a validator that is declared LOCALLY
 * in the scanned file rather than imported — so `importedFrom` cannot apply, there being
 * no import — pass `{ declaration }` with the specific `ts.Node` (a `FunctionDeclaration`
 * or a `const`'s `VariableDeclaration`) the callee must resolve to; a same-named shadowing
 * declaration resolves to a different symbol and does not match. Existing callers that
 * pass only a name keep the spelling-based match; either option is strictly narrower.
 */
export function callsTo(
  root: ts.Node,
  name: string,
  resolvesTo?: { moduleSpecifier: string; exportedName: string } | { declaration: ts.Node },
): ts.CallExpression[] {
  const sf = root.getSourceFile();
  if (!sf.text.includes(name)) return [];
  let fc: FileContext | undefined;
  const lazy = () => (fc ??= fileContext(root));

  const matches = (expr: ts.Expression): boolean => {
    if (!resolvesTo) return namesTarget(expr, name, lazy, new Set());
    if ("declaration" in resolvesTo) return calleeIsDeclaration(expr, lazy(), resolvesTo.declaration);
    return calleeIsImport(expr, lazy(), resolvesTo.moduleSpecifier, resolvesTo.exportedName);
  };

  const found: ts.CallExpression[] = [];
  for (const call of collect(root, ts.isCallExpression)) {
    if (matches(call.expression)) {
      found.push(call);
      continue;
    }
    const callee = unwrap(call.expression);
    if (!ts.isPropertyAccessExpression(callee) || !matches(callee.expression)) continue;
    if (callee.name.text === "call") {
      found.push(reshapedCall(call, callee.expression, call.arguments.slice(1)));
    } else if (callee.name.text === "apply") {
      const list = call.arguments[1];
      const inner = list && unwrap(list);
      const args = !list
        ? []
        : inner && ts.isArrayLiteralExpression(inner)
          ? [...inner.elements]
          : [ts.factory.createSpreadElement(list)];
      found.push(reshapedCall(call, callee.expression, args));
    }
  }
  return found;
}

/**
 * Unwraps a pure property/index-access chain — literal string keys only, no calls, no
 * arithmetic — down to its root identifier. Returns `undefined` the moment anything else
 * is in the way, e.g. `Math.min(BOUNDS.x, 50)` (root is wrapped in a call) or
 * `BOUNDS.x + 50` (root is the left side of a `+`, not the whole expression).
 */
function chainRoot(expr: ts.Expression): { root: ts.Identifier; path: string[] } | undefined {
  const e = unwrap(expr);
  if (ts.isIdentifier(e)) return { root: e, path: [] };
  if (ts.isPropertyAccessExpression(e)) {
    const base = chainRoot(e.expression);
    return base && { root: base.root, path: [...base.path, e.name.text] };
  }
  if (ts.isElementAccessExpression(e)) {
    const key = unwrap(e.argumentExpression);
    if (!ts.isStringLiteral(key) && !ts.isNoSubstitutionTemplateLiteral(key)) return undefined;
    const base = chainRoot(e.expression);
    return base && { root: base.root, path: [...base.path, key.text] };
  }
  return undefined;
}

/** The `ImportDeclaration` a node sits under, or `undefined` if it is not part of one. */
function enclosingImportDeclaration(node: ts.Node): ts.ImportDeclaration | undefined {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isImportDeclaration(n)) return n;
  }
  return undefined;
}

function moduleSpecifierOf(decl: ts.ImportDeclaration): string | undefined {
  return ts.isStringLiteral(decl.moduleSpecifier) ? decl.moduleSpecifier.text : undefined;
}

/**
 * Does any reference to `sym` (found by name, filtered by binder identity — same pattern
 * as `bindingTainted`) sit at the root of a chain that is written to at ANY point along
 * it — `sym.a = …`, `sym.a.b = …`, a compound assignment, `++`/`--`, or `delete`, however
 * many `as`/parens/`!` wrappers sit between hops? Unlike `referenceTaints` (which lets a
 * write of a STATIC value keep an object "static", since that is sound for `analyseStatic`
 * generally), a write through an imported chain always disqualifies here: an approved
 * constant that the running program mutates is not "the approved constant" at that read
 * regardless of what it was mutated to. Covers `(BOUNDS as any).wastePct.max = 50`.
 */
function importChainWritten(sym: ts.Symbol, fc: FileContext): boolean {
  for (const id of fc.byName.get(sym.name) ?? []) {
    if (resolve(id, fc) !== sym) continue;
    let cur: ts.Expression = id;
    for (;;) {
      cur = climb(cur);
      if (writeOf(cur) !== "none") return true;
      const p = cur.parent;
      if (ts.isPropertyAccessExpression(p) && p.expression === cur) {
        cur = p;
        continue;
      }
      if (ts.isElementAccessExpression(p) && p.expression === cur) {
        cur = p;
        continue;
      }
      break;
    }
  }
  return false;
}

/**
 * Is `expr` (after unwrapping parens/as/!/satisfies) a pure property/index-access chain
 * whose ROOT identifier is bound to an import of `exportedName` from `moduleSpecifier`?
 * True for a named import (`import { BOUNDS } from "m"`, used as `BOUNDS.x` or bare
 * `BOUNDS`), an aliased named import (`import { BOUNDS as B }`, used as `B.x`), and a
 * namespace import used as `NS.BOUNDS.x` (`import * as NS from "m"`).
 *
 * Built for guards that must tell "spends the approved constant" from "is merely static":
 * `BOUNDS.x` is both; a local `const BOUNDS = { x: 1 }`, `Math.min(BOUNDS.x, 50)` and
 * `BOUNDS.x + 50` are static but this returns `false` for all three, because none of them
 * is a bare read of the imported value — the boundary between "the approved constant" and
 * "a value merely derived from it" is exactly where a guard should still call the result
 * hand-typed.
 *
 * Also `false` when the import binding is written through ANYWHERE in the file — see
 * `importChainWritten` — because `(BOUNDS as any).wastePct.max = 50` elsewhere defeats
 * the premise that `BOUNDS.wastePct.max` still reads the approved, unmodified constant.
 */
export function isImportedChain(expr: ts.Expression, moduleSpecifier: string, exportedName: string): boolean {
  const chain = chainRoot(expr);
  if (!chain) return false;
  const fc = fileContext(chain.root);
  const sym = resolve(chain.root, fc);
  if (!sym) return false;
  let matched = false;
  for (const d of sym.declarations ?? []) {
    if (ts.isImportSpecifier(d)) {
      const imported = (d.propertyName ?? d.name).text;
      const decl = enclosingImportDeclaration(d);
      if (imported === exportedName && decl && moduleSpecifierOf(decl) === moduleSpecifier) matched = true;
    } else if (ts.isNamespaceImport(d)) {
      const decl = enclosingImportDeclaration(d);
      if (chain.path[0] === exportedName && decl && moduleSpecifierOf(decl) === moduleSpecifier) matched = true;
    }
  }
  if (!matched) return false;
  return !importChainWritten(sym, fc);
}

/**
 * The transitive closure of `external` over a directed graph `edges` (`from -> {to, ...}`).
 * Starts from every name in `external` and, for every name already reached that has
 * outgoing edges, adds everything it points to — repeating until nothing new is added.
 *
 * Generic graph reachability, not specific to any one guard's shapes: a dead-code guard
 * builds `external` from references found OUTSIDE any tracked declaration and `edges`
 * from references found INSIDE one, so that two declarations referencing only each other
 * (an edge each way, neither ever externally referenced) still come back unreachable —
 * the same shape a reference count alone cannot tell from real liveness.
 */
export function reachableClosure(external: ReadonlySet<string>, edges: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const live = new Set(external);
  for (let changed = true; changed; ) {
    changed = false;
    for (const [from, tos] of edges) {
      if (!live.has(from)) continue;
      for (const to of tos) {
        if (!live.has(to)) {
          live.add(to);
          changed = true;
        }
      }
    }
  }
  return live;
}

/**
 * If `id`'s declaration is a destructuring `BindingElement`, the property name it draws
 * from — its explicit `propertyName` (`const { x: id } = …`), or its own name when
 * shorthand (`const { id } = …`). `undefined` for anything else: a parameter that is not
 * itself destructured, a plain variable, an unresolved name. Resolution goes through the
 * shared binder, not name text, so a parameter named the same thing in an unrelated
 * function is not mistaken for this binding.
 */
export function destructuredPropertyName(id: ts.Identifier): string | undefined {
  const fc = fileContext(id);
  const sym = resolve(id, fc);
  if (!sym) return undefined;
  const decls = (sym.declarations ?? []).filter(ts.isBindingElement);
  if (decls.length !== 1) return undefined;
  const d = decls[0]!;
  if (d.propertyName) return ts.isIdentifier(d.propertyName) ? d.propertyName.text : undefined;
  return ts.isIdentifier(d.name) ? d.name.text : undefined;
}

// ─────────────────────────────────────────────────────────────────────────── JSX

/** The property values named `name` that a JSX spread expression supplies. */
function spreadValues(raw: ts.Expression, name: string, fc: () => FileContext, seen: Set<ts.Node>): ts.Expression[] {
  const e = unwrap(raw);
  if (seen.has(e)) return [];
  seen.add(e);
  if (ts.isConditionalExpression(e)) {
    return [...spreadValues(e.whenTrue, name, fc, seen), ...spreadValues(e.whenFalse, name, fc, seen)];
  }
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(e.operatorToken.kind)) {
    return [...spreadValues(e.left, name, fc, seen), ...spreadValues(e.right, name, fc, seen)];
  }
  if (ts.isIdentifier(e)) {
    const init = aliasInitializer(e, fc());
    return init ? spreadValues(init, name, fc, seen) : [];
  }
  if (!ts.isObjectLiteralExpression(e)) return [];
  const out: ts.Expression[] = [];
  for (const p of e.properties) {
    if (ts.isSpreadAssignment(p)) out.push(...spreadValues(p.expression, name, fc, seen));
    else if (ts.isShorthandPropertyAssignment(p) && p.name.text === name) out.push(p.name);
    else if (ts.isPropertyAssignment(p)) {
      const key = ts.isComputedPropertyName(p.name) ? unwrap(p.name.expression) : p.name;
      const text = ts.isIdentifier(key) || ts.isStringLiteralLike(key) || ts.isNumericLiteral(key) ? key.text : undefined;
      if (text === name && !(ts.isComputedPropertyName(p.name) && ts.isIdentifier(key))) out.push(p.initializer);
    }
  }
  return out;
}

/**
 * Every JSX attribute with this name, e.g. every `min=`, on any element — including one
 * supplied through a spread: `<input {...{ min: 0 }} />`, or `{...b}` where `b` is a
 * never-written binding to an object literal.
 *
 * A spread-supplied attribute comes back as a JsxAttribute that is NOT in the tree: it
 * carries the property's text range, the spread's parent, and the property's real value
 * node, so `attributeValue` and `analyseStatic` work on it unchanged.
 */
export function jsxAttributes(root: ts.Node, name: string): ts.JsxAttribute[] {
  const found: ts.JsxAttribute[] = collect(root, ts.isJsxAttribute).filter(
    (attr) => ts.isIdentifier(attr.name) && attr.name.text === name,
  );
  const spreads = collect(root, ts.isJsxSpreadAttribute);
  if (spreads.length === 0) return found;
  let fc: FileContext | undefined;
  const lazy = () => (fc ??= fileContext(root));
  for (const spread of spreads) {
    for (const value of spreadValues(spread.expression, name, lazy, new Set())) {
      const source = value.parent;
      const expr = ts.factory.createJsxExpression(undefined, value) as Mutable<ts.JsxExpression>;
      expr.expression = value;
      const attr = ts.factory.createJsxAttribute(ts.factory.createIdentifier(name), expr) as Mutable<ts.JsxAttribute>;
      ts.setTextRange(attr, source);
      ts.setTextRange(expr, source);
      expr.parent = attr;
      attr.parent = spread.parent;
      found.push(attr);
    }
  }
  return found.sort((a, b) => a.pos - b.pos);
}

/** The value expression of a JSX attribute: `"0"`, `{0}`, or null for a bare flag. */
export function attributeValue(attr: ts.JsxAttribute): ts.Expression | null {
  const init = attr.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init;
  if (ts.isJsxExpression(init)) return init.expression ?? null;
  return null;
}

/**
 * Expressions RENDERED as element content — `<span>{x}</span>` — never attribute values.
 */
export function renderedExpressions(root: ts.Node): ts.Expression[] {
  return collect(root, ts.isJsxExpression)
    .filter((node) => !ts.isJsxAttribute(node.parent) && node.expression !== undefined)
    .map((node) => node.expression!);
}

/**
 * Bare text rendered as element content — the `3` in `<span>3</span>` — trimmed, with
 * whitespace-only runs dropped.
 *
 * Separate from `renderedExpressions` because the parser treats braced and bare content
 * as different node kinds, and the first version of this file exposed only the braced
 * kind. That left the ORIGINAL first-generation defect — a hardcoded count written as
 * plain text, `<span>3</span>` — invisible to any guard built here. A guard about
 * rendered content should read both.
 */
export function renderedText(root: ts.Node): { text: string; node: ts.JsxText }[] {
  return collect(root, ts.isJsxText)
    .map((node) => ({ text: node.text.trim(), node }))
    .filter((t) => t.text !== "");
}

// ───────────────────────────────────────────────────────────────── static analysis

export interface StaticResult {
  /**
   * True when the value is fixed by constants visible in this file: literals, and
   * bindings, enum members, imports read by property, and calls to local functions or
   * listed globals, built only from those. A guard reads this as "nobody computed this
   * from data". See the file header for what it cannot see.
   */
  static: boolean;
  /**
   * The imported or file-level names a static value was drawn from. Empty for a pure
   * literal. Lets a guard tell `min={0}` (a hand-typed bound) from
   * `min={BOUNDS.discountPct.min}` (a static value from the approved source).
   */
  roots: Set<string>;
}

/**
 * Global functions whose result is fixed when every argument is static.
 *
 * This is a HAND-PICKED LIST, not a closed set: nothing in the language marks a
 * function pure. It holds only because a static argument, as defined here, is built
 * from literals alone and so carries no function, getter or `valueOf` that could run
 * code — `String(x)` on an arbitrary object is not pure, and is data here unless `x` is
 * static. Any global NOT listed is data; that is a bypass, and the remedy is to add the
 * function here with a test. A file that declares or imports its own `String` is not
 * calling the global one — resolution sees the local binding first.
 */
const DETERMINISTIC_GLOBALS = new Set([
  "String", "Number", "Boolean", "BigInt", "parseInt", "parseFloat",
  "encodeURIComponent", "encodeURI", "decodeURIComponent", "decodeURI",
  "String.raw", "Object.freeze", "Object.keys", "Object.values", "Object.entries", "Object.fromEntries",
  "Array.of", "Array.from", "JSON.stringify", "JSON.parse",
  "Math.abs", "Math.ceil", "Math.floor", "Math.round", "Math.trunc", "Math.max", "Math.min", "Math.pow", "Math.sign",
]);

/** Unshadowed globals that are constants. Only when nothing in the file binds the name. */
const GLOBAL_CONSTANTS = new Set(["undefined", "NaN", "Infinity"]);

interface Ctx {
  roots: Set<string>;
  /** Set when a static value was drawn from a property read of an import. */
  imported: boolean;
  visiting: Set<ts.Symbol>;
}

const freshCtx = (): Ctx => ({ roots: new Set(), imported: false, visiting: new Set() });

/**
 * Is this expression fixed by constants rather than computed from data?
 *
 * Built to answer the bypasses that defeated the text matchers, all of which are tests:
 * `3`, `+3`, `"3"`, `` `3` ``, `(3)`, `1 + 2`, `"JMD" as CurrencyCode`, `String("JMD")`,
 * `CURRENCY_CODES[0]`, `C.jmd` from a local object, a `let` never reassigned, an enum
 * member, `"JMD".slice(0)`, `(() => "JMD")()` through a const, `Object.freeze({…}).x`
 * and a destructuring default — all static. `r.currency`, `pricing?.currency`, `a ?? b`
 * over props, a parameter, a name destructured from data, a function returning its
 * parameter, and a call to any unlisted global — `fetch("/api")` — all data.
 */
export function analyseStatic(expr: ts.Expression): StaticResult {
  const ctx = freshCtx();
  const ok = isStatic(expr, ctx);
  return { static: ok, roots: ok ? ctx.roots : new Set() };
}

function globalName(callee: ts.Expression, fc: FileContext): string | undefined {
  if (ts.isIdentifier(callee)) return resolve(callee, fc) ? undefined : callee.text;
  if (ts.isPropertyAccessExpression(callee)) {
    const obj = unwrap(callee.expression);
    if (ts.isIdentifier(obj) && !resolve(obj, fc)) return `${obj.text}.${callee.name.text}`;
  }
  return undefined;
}

const argsStatic = (args: readonly ts.Expression[], ctx: Ctx) =>
  args.every((a) => isStatic(ts.isSpreadElement(a) ? a.expression : a, ctx));

function isStatic(raw: ts.Expression, ctx: Ctx): boolean {
  const expr = unwrap(raw);

  if (
    ts.isNumericLiteral(expr) ||
    ts.isBigIntLiteral(expr) ||
    ts.isStringLiteral(expr) ||
    ts.isNoSubstitutionTemplateLiteral(expr) ||
    expr.kind === ts.SyntaxKind.TrueKeyword ||
    expr.kind === ts.SyntaxKind.FalseKeyword ||
    expr.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (ts.isTemplateExpression(expr)) {
    return expr.templateSpans.every((span) => isStatic(span.expression, ctx));
  }
  if (ts.isVoidExpression(expr)) return true; // `void x` is always `undefined`, whatever x is
  if (ts.isPrefixUnaryExpression(expr)) {
    if (expr.operator === ts.SyntaxKind.PlusPlusToken || expr.operator === ts.SyntaxKind.MinusMinusToken) return false;
    return isStatic(expr.operand, ctx);
  }
  if (ts.isBinaryExpression(expr)) {
    if (isAssignmentOperator(expr.operatorToken.kind)) return false;
    return isStatic(expr.left, ctx) && isStatic(expr.right, ctx);
  }
  if (ts.isConditionalExpression(expr)) {
    return isStatic(expr.condition, ctx) && isStatic(expr.whenTrue, ctx) && isStatic(expr.whenFalse, ctx);
  }
  if (ts.isArrayLiteralExpression(expr)) return argsStatic(expr.elements, ctx);
  if (ts.isObjectLiteralExpression(expr)) {
    return expr.properties.every((p) => {
      if (ts.isPropertyAssignment(p)) {
        return (!ts.isComputedPropertyName(p.name) || isStatic(p.name.expression, ctx)) && isStatic(p.initializer, ctx);
      }
      if (ts.isShorthandPropertyAssignment(p)) return !p.objectAssignmentInitializer && isStatic(p.name, ctx);
      if (ts.isSpreadAssignment(p)) return isStatic(p.expression, ctx);
      return false; // methods and accessors run code
    });
  }
  if (ts.isIdentifier(expr)) return identifierIsStatic(expr, ctx);
  if (ts.isPropertyAccessExpression(expr)) {
    const cls = staticClassFieldIsStatic(expr, ctx);
    if (cls !== undefined) return cls;
    return sourceIsStatic(expr.expression, ctx);
  }
  if (ts.isElementAccessExpression(expr)) {
    return isStatic(expr.argumentExpression, ctx) && sourceIsStatic(expr.expression, ctx);
  }
  if (ts.isTaggedTemplateExpression(expr)) {
    const tag = unwrap(expr.tag);
    const name = globalName(tag, fileContext(tag));
    return name !== undefined && DETERMINISTIC_GLOBALS.has(name) && isStatic(expr.template, ctx);
  }
  if (ts.isCallExpression(expr)) return callIsStatic(expr, ctx);
  return false;
}

/**
 * A call is static when it calls a listed global, a method of a file-local static value,
 * or a never-written local function whose every return is static — and, for the first
 * two, every argument is static. Anything else called is data, an unknown global
 * included: the first version of this file read every undeclared function as pure, and
 * `fetch("/api")` became a constant.
 */
function callIsStatic(call: ts.CallExpression, ctx: Ctx): boolean {
  const callee = unwrap(call.expression);
  const fc = fileContext(callee);

  const global = globalName(callee, fc);
  if (global !== undefined) return DETERMINISTIC_GLOBALS.has(global) && argsStatic(call.arguments, ctx);

  if (ts.isPropertyAccessExpression(callee)) {
    // `(() => 100).call(null)` — invoking an inline function through `.call`/`.apply` is
    // the same shape as invoking it directly (`(() => 100)()`, handled below): the
    // receiver IS the function, not a static value holding one, so the general
    // "static receiver, language method" branch below must not see it first, or it reads
    // the function expression as a non-static callee and calls the whole thing data.
    const receiver = unwrap(callee.expression);
    if (
      (ts.isArrowFunction(receiver) || ts.isFunctionExpression(receiver)) &&
      (callee.name.text === "call" || callee.name.text === "apply")
    ) {
      return returnsStatic(receiver, ctx);
    }
  }

  if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) {
    // A static receiver holds only primitives, arrays and plain objects, so its methods
    // are the language's own. An import-rooted receiver is opaque: it may hold functions.
    const sub: Ctx = { roots: new Set(), imported: false, visiting: ctx.visiting };
    if (!isStatic(callee, sub) || sub.imported) return false;
    if (!argsStatic(call.arguments, ctx)) return false;
    for (const r of sub.roots) ctx.roots.add(r);
    return true;
  }

  // An immediately-invoked arrow or function expression — `(() => 3)()` — is exactly the
  // same shape as `const f = () => 3; f()` (already handled below via `returnsStatic`),
  // just without the intervening name. Read as data, `(() => 3)()` typed directly inside
  // rendered JSX was a live bypass. `returnsStatic` already refuses a body that reads a
  // parameter, so this stays sound without substituting the call's arguments.
  if (ts.isArrowFunction(callee) || ts.isFunctionExpression(callee)) {
    return returnsStatic(callee, ctx);
  }

  if (!ts.isIdentifier(callee)) return false;
  const sym = resolve(callee, fc);
  if (!sym || isImport(sym) || ctx.visiting.has(sym) || bindingTainted(sym, fc)) return false;
  const bodies: ts.FunctionLikeDeclaration[] = [];
  for (const d of valueDeclarations(sym)) {
    if (ts.isFunctionDeclaration(d)) {
      if (d.body) bodies.push(d);
    } else if (ts.isVariableDeclaration(d) && d.initializer) {
      const init = unwrap(d.initializer);
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) bodies.push(init);
      else return false;
    } else {
      return false;
    }
  }
  if (bodies.length === 0) return false;
  ctx.visiting.add(sym);
  const ok = bodies.every((fn) => returnsStatic(fn, ctx));
  ctx.visiting.delete(sym);
  if (ok) ctx.roots.add(callee.text);
  return ok;
}

function returnsStatic(fn: ts.FunctionLikeDeclaration, ctx: Ctx): boolean {
  if (fn.asteriskToken || ts.getCombinedModifierFlags(fn) & ts.ModifierFlags.Async) return false;
  const body = fn.body;
  if (!body) return false;
  if (!ts.isBlock(body)) return isStatic(body, ctx);
  const returns: ts.ReturnStatement[] = [];
  const visit = (n: ts.Node): void => {
    if (ts.isFunctionLike(n) || ts.isClassLike(n)) return;
    if (ts.isReturnStatement(n)) returns.push(n);
    ts.forEachChild(n, visit);
  };
  ts.forEachChild(body, visit);
  return returns.every((r) => !r.expression || isStatic(r.expression, ctx));
}

/**
 * `L.CAP` where `L` is a class and `CAP` is a `static` field: sound to call static on its
 * own terms, unlike a class instance property, because a static field belongs to the
 * class itself rather than to any particular value flowing through the program — there is
 * no "which `L` is this" question the way there is for a parameter or a destructured
 * value. Static when the field is declared `static`, is never written to outside its own
 * initializer (checked the same way a module `let` is, via `bindingTainted` on the field's
 * own symbol — so `L.CAP = 5` elsewhere defeats it), and its initializer is itself static.
 * Returns `undefined` (not a class-static-field access at all) rather than `false` so the
 * caller falls through to the ordinary property-read path for every other case, e.g.
 * `C.jmd` off a local object literal.
 */
/**
 * Is a class's static field ever written to outside its own declaration's initializer?
 * `referenceTaints`/`bindingTainted` assume a value binding — a variable, a parameter —
 * referenced BY VALUE; a static field is instead reached through `X.CAP`, where the
 * identifier `CAP` sits in the `.name` position of a `PropertyAccessExpression`, never by
 * itself, so that machinery never sees a write through it. This walks every identifier
 * bound to the field's symbol and asks whether the ENCLOSING property access is a write
 * target (`L.CAP = …`, `L.CAP++`, a destructuring target).
 */
function classFieldWritten(propSym: ts.Symbol, fc: FileContext): boolean {
  for (const id of fc.byName.get(propSym.name) ?? []) {
    const p = id.parent;
    if (!ts.isPropertyAccessExpression(p) || p.name !== id) continue;
    if (fc.checker.getSymbolAtLocation(id) !== propSym) continue;
    if (writeOf(climb(p)) !== "none") return true;
  }
  return false;
}

/**
 * The class-like declaration `sym` names: a `class L {}` directly, or a never-inspected
 * `const L = class {}` — a class EXPRESSION is exactly as sound to read a static field
 * off as a class declaration (the field still belongs to the class itself, not to any
 * particular value flowing through the program), and treating the two inconsistently was
 * itself a bypass: `const L = class { static CAP = 100 }; …L.CAP…` fell through to the
 * ordinary property-read path, which reads a class expression as an unhandled callable
 * and reports the whole thing as data — hiding a literal from a guard that should have
 * caught it, the same direction of error `bindingTainted` refuses elsewhere.
 */
function classLikeOf(sym: ts.Symbol): ts.ClassLikeDeclaration | undefined {
  for (const d of sym.declarations ?? []) {
    if (ts.isClassDeclaration(d)) return d;
    if (ts.isVariableDeclaration(d) && d.initializer) {
      const init = unwrap(d.initializer);
      if (ts.isClassExpression(init)) return init;
    }
  }
  return undefined;
}

function staticClassFieldIsStatic(pae: ts.PropertyAccessExpression, ctx: Ctx): boolean | undefined {
  const obj = unwrap(pae.expression);
  if (!ts.isIdentifier(obj)) return undefined;
  const fc = fileContext(obj);
  const classSym = resolve(obj, fc);
  if (!classSym || !classLikeOf(classSym)) return undefined;
  const propSym = fc.checker.getSymbolAtLocation(pae.name);
  if (!propSym) return undefined;
  // A `static get CAP() { return 100 }` is exactly as sound to read as a static field
  // initializer: it belongs to the class, takes no argument, and its value at this call
  // site does not depend on which instance is asking (there is no instance). Reading only
  // `ts.isPropertyDeclaration` here — as the first version did — let a getter hide a
  // literal from the guard entirely, since it fell through to the data-by-default path.
  const propDecls = (propSym.declarations ?? []).filter(
    (d): d is ts.PropertyDeclaration | ts.GetAccessorDeclaration =>
      ts.isPropertyDeclaration(d) || ts.isGetAccessorDeclaration(d),
  );
  if (propDecls.length === 0) return undefined;
  const allStatic = propDecls.every((d) => (ts.getCombinedModifierFlags(d) & ts.ModifierFlags.Static) !== 0);
  if (!allStatic) return undefined;
  if (classFieldWritten(propSym, fc)) return false;
  const ok = propDecls.every((d) =>
    ts.isPropertyDeclaration(d) ? !!d.initializer && isStatic(d.initializer, ctx) : returnsStatic(d, ctx),
  );
  if (ok) ctx.roots.add(pae.name.text);
  return ok;
}

/** The object of `x.y` or `x[0]`: an import counts, as does anything itself static. */
function sourceIsStatic(expr: ts.Expression, ctx: Ctx): boolean {
  const inner = unwrap(expr);
  if (ts.isIdentifier(inner)) {
    const fc = fileContext(inner);
    const sym = resolve(inner, fc);
    if (sym && isImport(sym)) {
      if (bindingTainted(sym, fc)) return false;
      ctx.roots.add(inner.text);
      ctx.imported = true;
      return true;
    }
  }
  return isStatic(inner, ctx);
}

function identifierIsStatic(id: ts.Identifier, ctx: Ctx): boolean {
  const fc = fileContext(id);
  const sym = resolve(id, fc);
  // Only an UNBOUND `undefined` is the global: `const undefined = load()` is data.
  //
  // "Unbound" includes a symbol with no declaration in source. The compiler gives
  // `undefined` a built-in symbol even with `noLib`, so it never reached the branch
  // above and fell through to "no declarations, therefore data" - a regression the
  // existing test caught when this rewrite was first run. A symbol nobody declared is
  // a compiler intrinsic, and is judged exactly like a name that resolved to nothing.
  if (!sym || !sym.declarations || sym.declarations.length === 0) {
    return GLOBAL_CONSTANTS.has(id.text);
  }
  // An import on its own is a binding we cannot see into — a function, a component, a
  // mutable object. It becomes static only when a property or index of it is read,
  // which `sourceIsStatic` handles.
  if (isImport(sym)) return false;
  if (ctx.visiting.has(sym)) return false; // a self-referencing initializer is not a constant
  const decls = valueDeclarations(sym);
  if (decls.length === 0 || bindingTainted(sym, fc)) return false;
  // Every declaration of THIS binding (a `var` may have several, an enum may merge) must
  // be static. Other bindings that happen to share the name are irrelevant.
  ctx.visiting.add(sym);
  const ok = decls.every((d) => declarationIsStatic(d, ctx));
  ctx.visiting.delete(sym);
  if (ok) ctx.roots.add(id.text);
  return ok;
}

function declarationIsStatic(d: ts.Declaration, ctx: Ctx): boolean {
  if (ts.isVariableDeclaration(d)) return ts.isIdentifier(d.name) && !!d.initializer && isStatic(d.initializer, ctx);
  if (ts.isBindingElement(d)) return bindingElementIsStatic(d, ctx);
  if (ts.isEnumMember(d)) return !d.initializer || isStatic(d.initializer, ctx);
  if (ts.isEnumDeclaration(d)) return d.members.every((m) => !m.initializer || isStatic(m.initializer, ctx));
  return false; // parameters, functions as values, classes, catch bindings
}

/**
 * `const { c = "JMD" } = SOURCE`: the value is either a part of SOURCE or the default,
 * so it is static when SOURCE, every default on the path and every computed key are.
 * A destructured parameter never reaches a VariableDeclaration, so it stays data.
 */
function bindingElementIsStatic(el: ts.BindingElement, ctx: Ctx): boolean {
  let node: ts.Node = el;
  while (ts.isBindingElement(node)) {
    if (node.initializer && !isStatic(node.initializer, ctx)) return false;
    if (node.propertyName && ts.isComputedPropertyName(node.propertyName) && !isStatic(node.propertyName.expression, ctx)) {
      return false;
    }
    node = node.parent.parent;
  }
  return ts.isVariableDeclaration(node) && !!node.initializer && isStatic(node.initializer, ctx);
}

// ──────────────────────────────────────────────────────── value reads (retention guard)

/**
 * `unwrap`, plus the wrappers that keep a NUMBER's value for arithmetic: unary `+`, a
 * call to the GLOBAL `Number` (one resolving to no declaration in the file - a local
 * `Number` is not unwrapped), and `x ?? <static fallback>` (`a?.totalCents ?? 0` is still
 * the total wherever one exists). A NON-static fallback (`a ?? b`) is not unwrapped: which
 * side wins is data. Unary minus is not a wrapper - see `additiveTerms`. Optional chaining
 * needs nothing: `a?.x` is a property read.
 */
export function unwrapValue(expr: ts.Expression): ts.Expression {
  let e = unwrap(expr);
  for (;;) {
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.PlusToken) {
      e = unwrap(e.operand);
      continue;
    }
    if (ts.isCallExpression(e) && e.arguments.length === 1 && !ts.isSpreadElement(e.arguments[0]!)) {
      const callee = unwrap(e.expression);
      if (ts.isIdentifier(callee) && callee.text === "Number" && resolve(callee, fileContext(callee)) === undefined) {
        e = unwrap(e.arguments[0]!);
        continue;
      }
    }
    if (
      ts.isBinaryExpression(e) &&
      e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      analyseStatic(e.right).static
    ) {
      e = unwrap(e.left);
      continue;
    }
    return e;
  }
}

/** What an operand reads, once aliases, destructuring and one-level accessors are followed. */
export type ValueRead =
  /** `x.p`, `x?.p`, `x["p"]`, `const { p: y } = x`, or `get(x)` where `get = (o) => o.p`. */
  | { kind: "property"; name: string }
  /** A parameter, or a name declared nowhere in the file: its spelling is all there is. */
  | { kind: "name"; name: string }
  | { kind: "other" };

export interface ResolvedRead {
  read: ValueRead;
  /** The local names followed on the way, outermost first (`const t = ...`). */
  aliases: string[];
}

/** The key of `x.p` / `x?.p` / `x["p"]`, or undefined. */
function propertyKeyOf(e: ts.Expression): string | undefined {
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isElementAccessExpression(e)) {
    const key = unwrap(e.argumentExpression);
    if (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) return key.text;
  }
  return undefined;
}

/**
 * A call to a never-reassigned LOCAL function (a declaration, or a binding to an arrow /
 * function expression) whose whole body returns one property read of one of its OWN
 * parameters: `const totalOf = (a) => a.totalCents; totalOf(inv)` reads `totalCents`.
 * One level only - an accessor calling an accessor, a method, an import, or a body with
 * any other statement is not followed.
 */
function accessorProperty(call: ts.CallExpression): string | undefined {
  const callee = unwrap(call.expression);
  if (!ts.isIdentifier(callee)) return undefined;
  const fc = fileContext(callee);
  const sym = resolve(callee, fc);
  if (!sym || isImport(sym) || bindingTainted(sym, fc)) return undefined;
  const decls = valueDeclarations(sym);
  if (decls.length !== 1) return undefined;
  const d = decls[0]!;
  let fn: ts.FunctionLikeDeclaration | undefined;
  if (ts.isFunctionDeclaration(d)) fn = d;
  else if (ts.isVariableDeclaration(d) && d.initializer) {
    const init = unwrap(d.initializer);
    if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) fn = init;
  }
  if (!fn?.body) return undefined;
  let returned: ts.Expression | undefined;
  if (!ts.isBlock(fn.body)) returned = fn.body;
  else if (fn.body.statements.length === 1) {
    const only = fn.body.statements[0]!;
    if (ts.isReturnStatement(only)) returned = only.expression;
  }
  if (!returned) return undefined;
  const read = unwrapValue(returned);
  const key = propertyKeyOf(read);
  if (key === undefined) return undefined;
  const obj = unwrap((read as ts.PropertyAccessExpression | ts.ElementAccessExpression).expression);
  if (!ts.isIdentifier(obj)) return undefined;
  const owner = fn;
  const isOwnParam = (resolve(obj, fc)?.declarations ?? []).some((p) => ts.isParameter(p) && p.parent === owner);
  return isOwnParam ? key : undefined;
}

/**
 * What `expr` reads, resolved through the binder: wrappers via `unwrapValue`, a
 * never-written local alias to its initializer (any number of hops), a destructured
 * binding to the property it was taken from, and a one-level accessor call to the
 * property it returns. A parameter or undeclared name comes back as `name`.
 */
export function resolveRead(expr: ts.Expression): ResolvedRead {
  return resolveReadInner(expr, new Set());
}

function resolveReadInner(expr: ts.Expression, seen: Set<ts.Node>): ResolvedRead {
  const other: ResolvedRead = { read: { kind: "other" }, aliases: [] };
  const e = unwrapValue(expr);
  if (seen.has(e)) return other;
  seen.add(e);
  const key = propertyKeyOf(e);
  if (key !== undefined) return { read: { kind: "property", name: key }, aliases: [] };
  if (ts.isCallExpression(e)) {
    const p = accessorProperty(e);
    return p === undefined ? other : { read: { kind: "property", name: p }, aliases: [] };
  }
  if (!ts.isIdentifier(e)) return other;
  const byName: ResolvedRead = { read: { kind: "name", name: e.text }, aliases: [] };
  const fc = fileContext(e);
  const sym = resolve(e, fc);
  if (!sym || !sym.declarations || sym.declarations.length === 0) return byName;
  const decls = valueDeclarations(sym);
  if (decls.length !== 1) return byName;
  const d = decls[0]!;
  if (ts.isVariableDeclaration(d) && ts.isIdentifier(d.name)) {
    if (!d.initializer || bindingTainted(sym, fc)) return byName;
    const inner = resolveReadInner(d.initializer, seen);
    return { read: inner.read, aliases: [d.name.text, ...inner.aliases] };
  }
  if (ts.isBindingElement(d)) {
    const k = d.propertyName ?? d.name;
    const alias = ts.isIdentifier(d.name) ? [d.name.text] : [];
    if (ts.isIdentifier(k) || ts.isStringLiteralLike(k)) return { read: { kind: "property", name: k.text }, aliases: alias };
    return { read: { kind: "other" }, aliases: alias };
  }
  if (ts.isParameter(d) && ts.isIdentifier(d.name)) return byName;
  return other;
}

/**
 * An additive chain flattened into signed terms. `s + a.total - a.paid` parses as
 * `(s + a.total) - a.paid`, which no single binary node pairs; flattened it is
 * `[+s, +a.total, -a.paid]`. Flattens through parens/`as`/`!`/`satisfies`, unary minus
 * (flipping the sign) and unary plus. It cannot tell `+` from string concatenation.
 */
export function additiveTerms(expr: ts.Expression, sign: 1 | -1 = 1): { sign: 1 | -1; expr: ts.Expression }[] {
  const e = unwrap(expr);
  const flip = (s: 1 | -1): 1 | -1 => (s === 1 ? -1 : 1);
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return [...additiveTerms(e.left, sign), ...additiveTerms(e.right, sign)];
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.MinusToken) {
    return [...additiveTerms(e.left, sign), ...additiveTerms(e.right, flip(sign))];
  }
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken) return additiveTerms(e.operand, flip(sign));
  if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.PlusToken) return additiveTerms(e.operand, sign);
  return [{ sign, expr: e }];
}

const isAdditive = (n: ts.Node): n is ts.BinaryExpression =>
  ts.isBinaryExpression(n) &&
  (n.operatorToken.kind === ts.SyntaxKind.PlusToken || n.operatorToken.kind === ts.SyntaxKind.MinusToken);

/**
 * Every MAXIMAL additive chain under `root` - a `+`/`-` expression that is not itself a
 * term of an enclosing one (looking up through wrappers and unary `+`/`-`) - so each
 * chain is judged exactly once.
 */
export function additiveChains(root: ts.Node): ts.BinaryExpression[] {
  return collect(root, isAdditive).filter((node) => {
    let cur: ts.Node = node;
    for (;;) {
      const p: ts.Node = cur.parent;
      if (
        ts.isParenthesizedExpression(p) ||
        ts.isAsExpression(p) ||
        ts.isSatisfiesExpression(p) ||
        ts.isNonNullExpression(p) ||
        ts.isTypeAssertionExpression(p) ||
        (ts.isPrefixUnaryExpression(p) &&
          (p.operator === ts.SyntaxKind.MinusToken || p.operator === ts.SyntaxKind.PlusToken))
      ) {
        cur = p;
        continue;
      }
      return !isAdditive(p);
    }
  });
}

/**
 * The function a node sits in, as a stable key: a function declaration or method by its
 * name, `const X = () =>` as `X`, and a class-FIELD arrow or function expression as
 * `Class#field` (`<anonymous>#field` in an unnamed class). Top-level code is `<module>`.
 * Methods stay bare names so existing `file#method` allow-list keys keep their meaning.
 */
export function enclosingFunctionKey(node: ts.Node): string {
  const sf = node.getSourceFile();
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) {
      return ts.isIdentifier(n.name) ? n.name.text : n.name.getText(sf);
    }
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      const p: ts.Node = n.parent;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
      if (ts.isPropertyDeclaration(p) && p.initializer === n && ts.isClassLike(p.parent)) {
        const field = ts.isIdentifier(p.name) || ts.isPrivateIdentifier(p.name) ? p.name.text : p.name.getText(sf);
        return `${p.parent.name?.text ?? "<anonymous>"}#${field}`;
      }
    }
  }
  return "<module>";
}

// ─────────────────────────────────────────────────────────────── declared types

/**
 * Every string an expression can evaluate to, when that set is closed: a string literal,
 * a ternary over such, or a never-written local alias of one. `undefined` otherwise - a
 * guard must read that as "cannot tell", never as "no strings".
 */
export function staticStrings(expr: ts.Expression, seen: Set<ts.Node> = new Set()): string[] | undefined {
  const e = unwrap(expr);
  if (seen.has(e)) return undefined;
  seen.add(e);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return [e.text];
  if (ts.isConditionalExpression(e)) {
    const a = staticStrings(e.whenTrue, seen);
    const b = staticStrings(e.whenFalse, seen);
    return a && b ? [...a, ...b] : undefined;
  }
  if (ts.isIdentifier(e)) {
    const init = followAlias(e);
    return init ? staticStrings(init, seen) : undefined;
  }
  return undefined;
}

/**
 * The import naming the DECLARED type of `this.x` (a class field or constructor parameter
 * property) or of an identifier `x` - `private readonly audit: AuditService` with
 * `import { AuditService } from "./audit.service.js"` gives that specifier and name.
 * Resolved through the binder, so a local `class AuditService` does not match and an
 * aliased import reports the exported name. `undefined` when the declared type is not a
 * plain reference to an import (inferred, generic wrapper, union, ...).
 */
export function declaredTypeImport(expr: ts.Expression): { moduleSpecifier: string; exportedName: string } | undefined {
  const e = unwrap(expr);
  const fc = fileContext(e);
  let sym: ts.Symbol | undefined;
  if (ts.isPropertyAccessExpression(e) && e.expression.kind === ts.SyntaxKind.ThisKeyword) {
    sym = fc.checker.getSymbolAtLocation(e.name);
  } else if (ts.isIdentifier(e)) {
    sym = resolve(e, fc);
  }
  const decls = sym?.declarations ?? [];
  if (decls.length !== 1) return undefined;
  const d = decls[0]!;
  const type = ts.isParameter(d) || ts.isPropertyDeclaration(d) || ts.isVariableDeclaration(d) ? d.type : undefined;
  if (!type || !ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return undefined;
  for (const td of resolve(type.typeName, fc)?.declarations ?? []) {
    if (!ts.isImportSpecifier(td)) continue;
    const decl = enclosingImportDeclaration(td);
    const spec = decl && moduleSpecifierOf(decl);
    if (spec !== undefined) return { moduleSpecifier: spec, exportedName: (td.propertyName ?? td.name).text };
  }
  return undefined;
}
