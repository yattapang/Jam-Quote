import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * ONE parser for every source guard in apps/web.
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
 * ## What it does not do
 *
 * It parses; it does not type-check. It cannot follow a value across a module boundary
 * or through a function call, so "static" below means "determined by constants visible
 * in this file", not "provably constant at runtime". A guard built on it should say so.
 */

export function parseFile(path: string): ts.SourceFile {
  return parseSource(path, readFileSync(path, "utf8"));
}

export function parseSource(fileName: string, text: string): ts.SourceFile {
  const kind = /\.[jt]sx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
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

/**
 * Every call to a function by name — `name(...)`, `x.name(...)`, `x?.name(...)`,
 * `(name)(...)` — however deeply nested and however it is formatted.
 *
 * Arguments come back as real nodes. The hand-rolled splitter this replaces could not
 * see past the `)` of `Number(...)` inside an argument, so a hardcoded currency behind
 * one walked straight through.
 */
export function callsTo(root: ts.Node, name: string): ts.CallExpression[] {
  return collect(root, ts.isCallExpression).filter((call) => calleeName(call.expression) === name);
}

function calleeName(expr: ts.Expression): string | undefined {
  const callee = unwrap(expr);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

/** Every JSX attribute with this name, e.g. every `min=`, on any element. */
export function jsxAttributes(root: ts.Node, name: string): ts.JsxAttribute[] {
  return collect(root, ts.isJsxAttribute).filter(
    (attr) => ts.isIdentifier(attr.name) && attr.name.text === name,
  );
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
   * const/let bindings, imports and globals built only from literals. A guard reads
   * this as "nobody computed this from data".
   */
  static: boolean;
  /**
   * The imported or file-level names a static value was drawn from. Empty for a pure
   * literal. Lets a guard tell `min={0}` (a hand-typed bound) from
   * `min={BOUNDS.discountPct.min}` (a static value from the approved source).
   */
  roots: Set<string>;
}

interface Scope {
  imports: Set<string>;
  /** Every declaration of a name in the file: its initializer, or null when it has none. */
  declarations: Map<string, (ts.Expression | null)[]>;
  /** Names written to anywhere after declaration — `x = …`, `x++`, `x += …`. */
  reassigned: Set<string>;
}

const scopes = new WeakMap<ts.SourceFile, Scope>();

/**
 * The language's own value conversions: pure, and closed by the ECMAScript spec.
 *
 * This is a list, and the doctrine warns against lists — the difference is that this
 * one is fixed by the language rather than by what someone thought to try, so it cannot
 * rot. Everything NOT on it defaults to data, which is the safe direction.
 */
const PURE_CONVERSIONS = new Set(["String", "Number", "Boolean", "BigInt", "parseInt", "parseFloat"]);

function scopeOf(node: ts.Node): Scope {
  const sf = node.getSourceFile();
  const cached = scopes.get(sf);
  if (cached) return cached;

  const scope: Scope = { imports: new Set(), declarations: new Map(), reassigned: new Set() };
  const declare = (name: string, init: ts.Expression | null) => {
    const list = scope.declarations.get(name) ?? [];
    list.push(init);
    scope.declarations.set(name, list);
  };

  walk(sf, (n) => {
    if (ts.isImportDeclaration(n) && n.importClause) {
      const clause = n.importClause;
      if (clause.name) scope.imports.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) scope.imports.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) scope.imports.add(el.name.text);
      }
    } else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) {
      declare(n.name.text, n.initializer ?? null);
    } else if (ts.isVariableDeclaration(n)) {
      // Destructuring binds from something computed, so every name it binds is data.
      walk(n.name, (b) => {
        if (ts.isIdentifier(b)) declare(b.text, null);
      });
    } else if (ts.isParameter(n)) {
      walk(n.name, (b) => {
        if (ts.isIdentifier(b)) declare(b.text, null);
      });
    } else if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) && n.name) {
      declare(n.name.text, null);
    } else if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      n.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
      ts.isIdentifier(unwrap(n.left))
    ) {
      scope.reassigned.add((unwrap(n.left) as ts.Identifier).text);
    } else if (
      (ts.isPrefixUnaryExpression(n) || ts.isPostfixUnaryExpression(n)) &&
      (n.operator === ts.SyntaxKind.PlusPlusToken || n.operator === ts.SyntaxKind.MinusMinusToken) &&
      ts.isIdentifier(unwrap(n.operand))
    ) {
      scope.reassigned.add((unwrap(n.operand) as ts.Identifier).text);
    }
  });

  scopes.set(sf, scope);
  return scope;
}

/**
 * Is this expression fixed by constants rather than computed from data?
 *
 * Built to answer the bypasses that defeated the text matchers, all of which are tests:
 * `3`, `+3`, `"3"`, `` `3` ``, `(3)`, `1 + 2`, `"JMD" as CurrencyCode`, `String("JMD")`,
 * `CURRENCY_CODES[0]`, `C.jmd` from a local object, and a `let` never reassigned — all
 * static. `r.currency`, `pricing?.currency`, `a ?? b` over props, a parameter, a
 * destructured name, a call to a function declared in the file, and a call to any
 * global that is not a pure value conversion — `fetch("/api")` — all data.
 */
export function analyseStatic(expr: ts.Expression): StaticResult {
  const roots = new Set<string>();
  const ok = isStatic(expr, roots, new Set());
  return { static: ok, roots: ok ? roots : new Set() };
}

function isStatic(raw: ts.Expression, roots: Set<string>, visiting: Set<string>): boolean {
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
    return expr.templateSpans.every((span) => isStatic(span.expression, roots, visiting));
  }
  if (ts.isPrefixUnaryExpression(expr)) return isStatic(expr.operand, roots, visiting);
  if (ts.isBinaryExpression(expr)) {
    const op = expr.operatorToken.kind;
    if (op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment) return false;
    return isStatic(expr.left, roots, visiting) && isStatic(expr.right, roots, visiting);
  }
  if (ts.isConditionalExpression(expr)) {
    return (
      isStatic(expr.condition, roots, visiting) &&
      isStatic(expr.whenTrue, roots, visiting) &&
      isStatic(expr.whenFalse, roots, visiting)
    );
  }
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.every((el) => !ts.isSpreadElement(el) && isStatic(el, roots, visiting));
  }
  if (ts.isObjectLiteralExpression(expr)) {
    return expr.properties.every(
      (p) => ts.isPropertyAssignment(p) && isStatic(p.initializer, roots, visiting),
    );
  }
  if (ts.isIdentifier(expr)) return identifierIsStatic(expr, roots, visiting);
  if (ts.isPropertyAccessExpression(expr)) return sourceIsStatic(expr.expression, roots, visiting);
  if (ts.isElementAccessExpression(expr)) {
    return (
      isStatic(expr.argumentExpression, roots, visiting) &&
      sourceIsStatic(expr.expression, roots, visiting)
    );
  }
  if (ts.isCallExpression(expr)) {
    // Only a PURE CONVERSION of static arguments is static — `String("JMD")` was a real
    // bypass. Anything else called is data, an unknown global included.
    //
    // The first version treated every undeclared function as a pure global. That is the
    // unsafe default: `fetch("/api")` is a global too, and it would have called the
    // result a constant — contradicting this file's own rule that ambiguity resolves
    // toward data. The helper's own tests caught it before any guard spent it, which is
    // the argument for a shared parser that has tests at all.
    const callee = unwrap(expr.expression);
    if (!ts.isIdentifier(callee) || !PURE_CONVERSIONS.has(callee.text)) return false;
    const scope = scopeOf(callee);
    // A file that declares or imports its own `String` is not calling the global one.
    if (scope.imports.has(callee.text) || scope.declarations.has(callee.text)) return false;
    return expr.arguments.every((arg) => isStatic(arg, roots, visiting));
  }
  return false;
}

/** The object of `x.y` or `x[0]`: an import counts, as does anything itself static. */
function sourceIsStatic(expr: ts.Expression, roots: Set<string>, visiting: Set<string>): boolean {
  const inner = unwrap(expr);
  if (ts.isIdentifier(inner) && scopeOf(inner).imports.has(inner.text)) {
    roots.add(inner.text);
    return true;
  }
  return isStatic(inner, roots, visiting);
}

function identifierIsStatic(id: ts.Identifier, roots: Set<string>, visiting: Set<string>): boolean {
  if (id.text === "undefined") return true;
  const scope = scopeOf(id);
  // An import on its own is a binding we cannot see into — a function, a component, a
  // mutable object. It becomes static only when a property or index of it is read,
  // which `sourceIsStatic` handles.
  if (scope.imports.has(id.text)) return false;
  const decls = scope.declarations.get(id.text);
  if (!decls || decls.length === 0) return false;
  if (scope.reassigned.has(id.text)) return false;
  if (visiting.has(id.text)) return false; // a self-referencing initializer is not a constant
  // EVERY declaration of the name must be a static initializer. A shadowing parameter or
  // a second declaration computed from data makes the name ambiguous, and ambiguity
  // resolves to data — a guard should fail to recognise a constant rather than excuse
  // a value that was computed.
  visiting.add(id.text);
  const ok = decls.every((init) => init !== null && isStatic(init, roots, visiting));
  visiting.delete(id.text);
  if (ok) roots.add(id.text);
  return ok;
}
