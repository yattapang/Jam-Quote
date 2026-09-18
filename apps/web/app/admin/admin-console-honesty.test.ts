import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  analyseStatic,
  attributeValue,
  callsTo,
  collect,
  enclosingFunctionKey,
  parseFile,
  parseSource,
  renderedExpressions,
  renderedText,
  unwrap,
  walk,
} from "@jamquote/test-ast";

/**
 * A source guard over the staff console.
 *
 * The console was largely a design mock with a few real values threaded in. It
 * fell back to invented tenant rows whenever a section failed to load, showed
 * a hardcoded MRR that was never real, a 12-month revenue series with no data
 * source, five fictional signups and four fabricated system alerts. In a
 * console used to decide who to suspend and what to bill, invented figures are
 * worse than an outage: they are actionable and they look authoritative.
 *
 * This cannot be caught by a behaviour test — the fake values were valid
 * TypeScript and rendered perfectly — so it is a parse of the AST.
 *
 * ## Why every assertion here goes through `packages/test-ast/src/source-ast.ts`
 *
 * SIX generations of this file were defeated, and each time the defect lived in a
 * matcher this file had written for itself: a brace counter, an argument splitter, a
 * `const`-name regex, a text-child normaliser. One of them returned an empty list for
 * every input. The final three fell to `CURRENCY_CODES[0]`, `{+3}`, and a JSX text
 * child spelled as prose around the digits (`Monthly recurring revenue $2,418,540`,
 * `J$2.4M`) that a bare-digit-only text check never looked at. There is no private
 * parser left in this file; the questions it asks are questions about the TypeScript
 * AST, answered by the shared, tested one.
 *
 * ## What it does not prove
 *
 * It parses; it does not type-check or follow values across modules or through calls.
 * A value built in another file and imported, or passed through a helper function,
 * is invisible to "static". A deliberate indirection defeats every assertion below.
 */
const SF = parseFile(join(__dirname, "AdminConsole.tsx"));

/**
 * The file's code with every comment removed, re-emitted by the compiler's printer.
 * Only the denylists and the PRODUCTION check read text, and they read THIS — the
 * comments explain the defects and quote the very strings being policed.
 */
const CODE = ts.createPrinter({ removeComments: true }).printFile(SF);

// ─────────────────────────────────────────────────────────────── AST queries
// Thin queries over the shared parser's nodes. None of them reads source text.

type Element = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

const isElement = (n: ts.Node): n is Element =>
  ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n);

const tagName = (el: Element): string => el.tagName.getText();

/** The text of a string-like literal, or null for anything computed. */
function literalText(expr: ts.Expression | null | undefined): string | null {
  if (!expr) return null;
  const e = unwrap(expr);
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  if (ts.isTemplateExpression(e)) return e.head.text;
  return null;
}

function attr(el: Element, name: string): ts.JsxAttribute | undefined {
  return el.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

/** Every `obj.prop` and `obj["prop"]` in the tree. */
function accesses(root: ts.Node, obj: string, prop: string): ts.Node[] {
  return collect(root, (n): n is ts.Node => {
    if (ts.isPropertyAccessExpression(n)) {
      const o = unwrap(n.expression);
      return n.name.text === prop && ts.isIdentifier(o) && o.text === obj;
    }
    if (ts.isElementAccessExpression(n)) {
      const o = unwrap(n.expression);
      return literalText(n.argumentExpression) === prop && ts.isIdentifier(o) && o.text === obj;
    }
    return false;
  });
}

/** Every binding an import introduces: the exported name, the local name, the module. */
function importBindings(sf: ts.SourceFile): { imported: string; local: string; from: string }[] {
  const out: { imported: string; local: string; from: string }[] = [];
  for (const decl of sf.statements.filter(ts.isImportDeclaration)) {
    const from = (decl.moduleSpecifier as ts.StringLiteral).text;
    const clause = decl.importClause;
    if (!clause) continue;
    if (clause.name) out.push({ imported: "default", local: clause.name.text, from });
    const b = clause.namedBindings;
    if (b && ts.isNamespaceImport(b)) out.push({ imported: "*", local: b.name.text, from });
    if (b && ts.isNamedImports(b)) {
      for (const el of b.elements) {
        out.push({ imported: (el.propertyName ?? el.name).getText(), local: el.name.text, from });
      }
    }
  }
  return out;
}

/**
 * The declaration node itself for a named function — `function f() {}` or `const f = () =>
 * {}` — for passing to `callsTo`'s `{ declaration }` resolution, which needs the exact
 * node the binder's symbol carries in `sym.declarations`, not the function's body.
 */
function functionDeclarationNamed(sf: ts.SourceFile, name: string): ts.Node | null {
  let found: ts.Node | null = null;
  walk(sf, (n) => {
    if (found) return;
    if (ts.isFunctionDeclaration(n) && n.name?.text === name) found = n;
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) {
      found = n;
    }
  });
  return found;
}

/** A named function's body: `function f()`, or `const f = () =>` / `function () {}`. */
function functionNamed(sf: ts.SourceFile, name: string): ts.Node | null {
  let found: ts.Node | null = null;
  walk(sf, (n) => {
    if (found) return;
    if (ts.isFunctionDeclaration(n) && n.name?.text === name && n.body) found = n.body;
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === name &&
      n.initializer &&
      (ts.isArrowFunction(unwrap(n.initializer)) || ts.isFunctionExpression(unwrap(n.initializer)))
    ) {
      found = (unwrap(n.initializer) as ts.ArrowFunction).body;
    }
  });
  return found;
}

/** Climb past parentheses and casts, which do not change what a node is used as. */
function usedAs(node: ts.Node): { node: ts.Node; parent: ts.Node } {
  let cur = node;
  while (
    ts.isParenthesizedExpression(cur.parent) ||
    ts.isAsExpression(cur.parent) ||
    ts.isSatisfiesExpression(cur.parent) ||
    ts.isNonNullExpression(cur.parent)
  ) {
    cur = cur.parent;
  }
  return { node: cur, parent: cur.parent };
}

// ─────────────────────────────────────────────────────────────── predicates
// Each is exercised by the bypass block at the bottom, against parsed snippets.

/**
 * A `formatPlatformMoney` call whose currency nobody decided at runtime.
 *
 * ONE rule: the currency argument must not be `analyseStatic(...).static`. The
 * defeated versions each recognised one spelling — a quote character, then a named
 * const, while `)` inside the first argument, `const JMD = "JMD"` and finally
 * `CURRENCY_CODES[0]` walked past. A literal, a const or `let` never reassigned, an
 * indexed import, `String("JMD") as CurrencyCode`, `C.jmd` and `undefined` are all
 * static; the argument is a real node, so the first argument's parentheses are
 * irrelevant. A missing argument is the same defect (the formatter's fallback) and
 * is refused too.
 *
 * Limit: a currency returned from a helper function, or imported already-resolved
 * from another module, is "data" to the parser and passes.
 */
function hardcodedCurrency(call: ts.CallExpression): boolean {
  const code = call.arguments[1];
  if (!code) return true;
  return analyseStatic(code).static;
}

/**
 * A figure rendered as element content that nobody counted.
 *
 * The Regulatory nav badge was a hardcoded `3`. Its guards fell to `>{3}<`, a newline
 * before the digit, `>{"3"}<`, and finally `{+3}` — each a normaliser missing one
 * spelling. Now: a rendered expression that is STATIC is a figure fixed at build time.
 *
 * Roots, decided deliberately:
 *   - empty roots (`3`, `+3`, `"3"`, `1 + 2`) — a violation;
 *   - roots that are all FILE-LOCAL bindings (`const N = 3; {N}`) — a violation. A
 *     local const is the literal with a name; accepting it would re-open the exact
 *     `const JMD = "JMD"` bypass that beat the currency check;
 *   - at least one IMPORTED root (`{CURRENCY_CODES.length}`) — allowed. The figure is
 *     derived from a code-owned source of truth in another module: it changes when that
 *     source changes, which is what "counted" means for a build-time fact.
 *
 * Exempt: a static string-like literal with no digit in it (`{" "}`, `{"—"}`) is
 * punctuation, not a figure.
 *
 * Limit: `{flag ? 3 : 0}` over a computed flag is not static and passes.
 */
function literalFigure(expr: ts.Expression, imports: Set<string>): boolean {
  const result = analyseStatic(expr);
  if (!result.static) return false;
  if ([...result.roots].some((r) => imports.has(r))) return false;
  const text = literalText(expr);
  const e = unwrap(expr);
  const pureText =
    text !== null && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e));
  if (pureText && !/\d/.test(text)) return false;
  return true;
}

/**
 * A `value:` property of a tile/stat object — the SEVENTH-generation site. The MRR
 * figure was never a bare rendered literal: it was assigned once, as
 * `{ label: "MRR", value: "$2,418,540" }`, into the `stats` array, and every render of
 * it afterward is `{s.value}` over a loop variable — dynamic to `renderedExpressions`
 * and `literalFigure` alike, however static the string that fed it. "The tiles/stats
 * array" is detected by SHAPE, not by the variable being spelled `stats`: any object
 * literal that is itself an element of an array literal, and that carries a sibling
 * `label` property, is a stat/metric tile, and its `value` property is what a screen
 * reader (and staff) will read as the figure — independent of what name the file gives
 * the array. `stats`, the "Needs review" tiles, and the Jamaica tax-facts rows on this
 * file all match, and are all in scope.
 */
function isTileValueProperty(p: ts.PropertyAssignment): boolean {
  if (!ts.isIdentifier(p.name) || p.name.text !== "value") return false;
  const obj = p.parent;
  if (!ts.isObjectLiteralExpression(obj) || !ts.isArrayLiteralExpression(obj.parent)) return false;
  return obj.properties.some((sib) => {
    const name = sib.name;
    return !!name && ts.isIdentifier(name) && name.text === "label";
  });
}

function tileValueProperties(root: ts.Node): ts.PropertyAssignment[] {
  return collect(root, ts.isPropertyAssignment).filter(isTileValueProperty);
}

/**
 * Text — bare JSX text, or a static string wherever this file checks one — that reads
 * as a rendered figure: a digit run on its own (`3`, the first-generation defect,
 * `renderedText` trims padding and newlines away so this still matches), a run of two
 * or more digits anywhere (`2418540`, `2.4`, a year, a version), or one digit sitting
 * next to a currency or percent marker (`$2`, `2%`). This is deliberately broader than
 * "the whole trimmed text is digits": the SIXTH-generation defect was prose wrapped
 * around the same fabricated total — `Monthly recurring revenue $2,418,540` — which a
 * bare-digit-only check (`^\d+$`) never matched because the text is not *only* digits.
 *
 * A single digit with no currency/percent marker and no companion digit (`Q1`, a lone
 * `0`) is not caught here — those are the years/versions/ids/`"0"` cases the guard's
 * exact-count allow-list names, not a class this regex should swallow silently.
 */
function isFabricatedFigureText(text: string): boolean {
  if (/^\d+$/.test(text)) return true;
  if (((text.match(/\d/g) ?? []).length) >= 2) return true;
  return /[$%]\s?\d|\d\s?[$%]/.test(text);
}

/** Is this expression only `e.preventDefault()`, `stopPropagation()`, `void <static>`? */
function inert(expr: ts.Expression): boolean {
  const e = unwrap(expr);
  if (ts.isVoidExpression(e)) return analyseStatic(e.expression).static;
  if (ts.isCallExpression(e)) {
    const callee = unwrap(e.expression);
    return (
      ts.isPropertyAccessExpression(callee) &&
      ["preventDefault", "stopPropagation"].includes(callee.name.text) &&
      e.arguments.length === 0
    );
  }
  return analyseStatic(e).static;
}

/**
 * An `<a>` that leads nowhere and does nothing.
 *
 * The first version was one regex, broken eight ways (spacing, parens, a typed
 * parameter, a braced body, attribute order, `href={"#"}`, `href=""`, no href). Now:
 * no href or a literal `#` / empty / `javascript:void(0)` href, AND an onClick that is
 * absent or a function whose every statement is inert.
 *
 * Limits: an href held in a const is not resolved (treated as a destination); an
 * element with a spread attribute is not judged; a named handler is assumed to act.
 */
function deadAnchor(el: Element): boolean {
  if (tagName(el) !== "a") return false;
  if (el.attributes.properties.some(ts.isJsxSpreadAttribute)) return false;

  const href = attr(el, "href");
  if (href) {
    const value = attributeValue(href);
    const text = value && (ts.isStringLiteral(unwrap(value)) || ts.isNoSubstitutionTemplateLiteral(unwrap(value)))
      ? literalText(value)
      : null;
    if (text === null || !["#", "", "javascript:void(0)"].includes(text.trim())) return false;
  }

  const onClick = attr(el, "onClick");
  if (!onClick) return true;
  const handler = attributeValue(onClick);
  if (!handler) return true;
  const fn = unwrap(handler);
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  if (!ts.isBlock(fn.body)) return inert(fn.body);
  return fn.body.statements.every((s) => ts.isEmptyStatement(s) || (ts.isExpressionStatement(s) && inert(s.expression)));
}

const CLAIM = /^\s*(Verified|Code-owned)\b/;
const CONTROL_TAGS = new Set(["input", "select", "textarea"]);

function containsControl(node: ts.Node): boolean {
  return collect(node, isElement).some((el) => CONTROL_TAGS.has(tagName(el)));
}

/**
 * Is this rendered verification claim conditional on something computed — ITS OWN
 * condition, not one around the whole screen?
 *
 * It read `<span style={verified}>Verified ✓</span>` unconditionally. The text-window
 * version accepted any `?` or `&&` in the enclosing brace region, so a claim inside
 * `{screen === "rules" && (...)}` was "conditional". Now the claim, or the ONE element
 * that holds it, must be a branch of a ternary or the right of `&&`, and the condition
 * must not be static (`true ? <Verified/> : null` is not a condition).
 */
function claimIsConditional(node: ts.Node): boolean {
  let { node: cur, parent } = usedAs(node);
  if (ts.isJsxText(node) || ts.isJsxElement(parent)) {
    // Text: climb to its element, then to what that element is used as.
    const el = ts.isJsxText(node) ? node.parent : parent;
    ({ node: cur, parent } = usedAs(el));
  }
  if (ts.isConditionalExpression(parent) && cur !== parent.condition) {
    return !analyseStatic(parent.condition).static;
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken &&
    cur === parent.right
  ) {
    return !analyseStatic(parent.left).static;
  }
  return false;
}

/** Every verification claim rendered as content: JSX text, or a literal in a JSX child. */
function renderedClaims(root: ts.Node): ts.Node[] {
  const claims: ts.Node[] = [];
  for (const { text, node: t } of renderedText(root)) {
    if (!CLAIM.test(text)) continue;
    // A <label> naming a form field ("Verified as of" beside a date input) is a field
    // name, not a claim — excused only when it really wraps a control.
    const el = t.parent;
    if (ts.isJsxElement(el) && tagName(el.openingElement) === "label" && containsControl(el)) continue;
    claims.push(t);
  }
  for (const expr of renderedExpressions(root)) {
    walk(expr, (n) => {
      if (
        (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) &&
        CLAIM.test(literalText(n as ts.Expression) ?? "") &&
        !collect(expr, ts.isJsxAttribute).some((a) => a.pos <= n.pos && n.end <= a.end)
      ) {
        claims.push(n);
      }
    });
  }
  return claims;
}

/**
 * A coercion to "absent" inside a save function: `x || undefined`, `x ?? void 0`,
 * `c ? undefined : v`, `{ field: undefined }`, `const rate = … ? undefined : …`.
 * The server reads an absent field as "leave unchanged", so each reports "Saved"
 * over a value that never moved. `undefined` in a TYPE is a keyword node, not this.
 *
 * Limit: an absent value produced by a helper function is not seen.
 */
function coercesToAbsent(root: ts.Node): ts.Node[] {
  return collect(root, (n): n is ts.Node =>
    (ts.isIdentifier(n) && n.text === "undefined") || ts.isVoidExpression(n),
  ).filter((n) => {
    if (ts.isVoidExpression(n) && !analyseStatic(n.expression).static) return false;
    const { node, parent } = usedAs(n);
    if (ts.isConditionalExpression(parent)) return node !== parent.condition;
    if (ts.isBinaryExpression(parent)) {
      const op = parent.operatorToken.kind;
      return (
        node === parent.right &&
        (op === ts.SyntaxKind.BarBarToken ||
          op === ts.SyntaxKind.QuestionQuestionToken ||
          op === ts.SyntaxKind.AmpersandAmpersandToken ||
          op === ts.SyntaxKind.EqualsToken)
      );
    }
    if (ts.isPropertyAssignment(parent)) return node === parent.initializer;
    if (ts.isVariableDeclaration(parent)) return node === parent.initializer;
    return false;
  });
}

/**
 * An inline style promising a click its own element cannot honour: `cursor` whose
 * value includes `"pointer"`, inside a JSX attribute of an element with no onClick or
 * href and not itself interactive — or a `<label>` that wraps no control.
 */
function hollowPointer(prop: ts.PropertyAssignment): { el: Element; hollow: boolean } | null {
  let a: ts.Node = prop;
  while (a && !ts.isJsxAttribute(a)) {
    if (ts.isSourceFile(a) || ts.isFunctionLike(a)) return null;
    a = a.parent;
  }
  if (!a) return null;
  const el = a.parent.parent as Element;
  if (attr(el, "onClick") || attr(el, "href")) return { el, hollow: false };
  const name = tagName(el);
  if (["a", "button", "Link", ...CONTROL_TAGS].includes(name)) return { el, hollow: false };
  if (name === "label" && ts.isJsxOpeningElement(el) && containsControl(el.parent)) {
    return { el, hollow: false };
  }
  return { el, hollow: true };
}

function pointerCursors(root: ts.Node): ts.PropertyAssignment[] {
  return collect(root, ts.isPropertyAssignment).filter(
    (p) =>
      p.name.getText().replace(/["']/g, "") === "cursor" &&
      collect(p.initializer, (n): n is ts.StringLiteral => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)).some(
        (s) => s.text === "pointer",
      ),
  );
}

/** Words that make a label a claim about a QUERY, not just about a number. */
const WINDOW_WORD =
  /\b(this month|last month|today|this week|this year|ytd|year to date|mtd|per month|monthly)\b/i;

/** Every metric label: `label: "…"` in an object, or `label="…"` on an element. */
function metricLabels(root: ts.Node): string[] {
  const fromProps = collect(root, ts.isPropertyAssignment)
    .filter((p) => p.name.getText().replace(/["']/g, "") === "label")
    .map((p) => literalText(p.initializer));
  const fromAttrs = collect(root, ts.isJsxAttribute)
    .filter((a) => a.name.getText() === "label")
    .map((a) => literalText(attributeValue(a)));
  return [...fromProps, ...fromAttrs].filter((l): l is string => l !== null);
}

const snippet = (code: string) => parseSource("snippet.tsx", code);

// ─────────────────────────────────────────────────────────────── the guards

describe("the staff console shows no invented data", () => {
  it("has no hardcoded platform figures", () => {
    // A denylist of the exact past fabrications — kept as a tripwire for the literal
    // text, in ADDITION to the class-level guard below ("no count is a literal in
    // the markup, or hardcoded into a stat/tile's value"), not instead of it. This
    // text check alone is not the figure guard: a same-shaped fabrication spelled
    // differently — a new value, a different currency abbreviation, a digit-bearing
    // string routed into a tile's `value:` instead of typed straight into JSX — would
    // sail past a denylist of exact strings. It failed exactly that way once: the same
    // total re-typed as `"$2,418,540"`, `"J$2.4M"`, and a JSX text child reading
    // `Monthly recurring revenue $2,418,540` all passed here, and only the class-level
    // guard below catches all three.
    for (const fabricated of ["2418540", "1,284", "108,420", '"892"', "1.9%"]) {
      expect(CODE).not.toContain(fabricated);
    }
  });

  it("invents nothing in the tenant drawer", () => {
    for (const fabricated of ['"2.1 / 10 GB"', "2024-08-19", "2025-05-19", '"Lynk"', "q * 0.6", "Starter: 4900"]) {
      expect(CODE).not.toContain(fabricated);
    }
  });

  it("has no platform supplier directory left", () => {
    expect(CODE).not.toContain("Suppliers added");
  });

  it("has no fictional tenant names", () => {
    for (const name of [
      "Blue Mountain Builders",
      "Reef & Rock Masonry",
      "Portmore Concrete",
      "Yallahs Roofing",
      "Spanish Town Steelworks",
      "Ocho Rios Renovations",
    ]) {
      expect(CODE).not.toContain(name);
    }
  });

  it("keeps no *Mock fallback bindings", () => {
    // Any declaration — const, let, var or function — whose name carries Mock.
    const declared = collect(SF, (n): n is ts.VariableDeclaration | ts.FunctionDeclaration =>
      ts.isVariableDeclaration(n) || ts.isFunctionDeclaration(n),
    ).map((d) => (d.name && ts.isIdentifier(d.name) ? d.name.text : ""));
    expect(declared.length, "no declarations parsed").toBeGreaterThan(50);
    expect(declared.filter((n) => /Mock/.test(n))).toEqual([]);
  });

  it("tells the viewer when a section failed to load", () => {
    expect(accesses(SF, "data", "failed").length).toBeGreaterThan(0);
  });
});

describe("the console cannot claim a figure it does not have", () => {
  const elements = collect(SF, isElement);
  const imports = new Set(importBindings(SF).map((b) => b.local));

  const WINDOWED_OK: Record<string, string> = {
    "Quotes created (all time)": "names its own window, and the window it names is the one the query uses",
  };

  it("found its subjects, so nothing below can pass on an empty file", () => {
    expect(elements.length, "no JSX elements parsed").toBeGreaterThan(200);
    expect(elements.filter((e) => tagName(e) === "a").length, "no anchors").toBeGreaterThan(0);
    expect(renderedExpressions(SF).length, "no rendered expressions").toBeGreaterThan(50);
    expect(imports.size, "no imports").toBeGreaterThan(10);
  });

  it("no metric is labelled with a time window the query does not apply", () => {
    const labels = metricLabels(SF);
    expect(labels.length, "found no metric labels — has the shape changed?").toBeGreaterThan(8);
    const offenders = labels.filter((l) => WINDOW_WORD.test(l) && !(l in WINDOWED_OK));
    expect(offenders, "a window in a label is a claim about the query: either window the query or drop the word").toEqual([]);
    // The allow-list is keyed exactly; an entry nothing uses is a stale excuse.
    for (const ok of Object.keys(WINDOWED_OK)) expect(labels, `stale allow-list entry: ${ok}`).toContain(ok);
  });

  it("every verification claim is derived, not asserted", () => {
    const claims = renderedClaims(SF);
    expect(claims.length, "found no verification badges — were they renamed?").toBeGreaterThan(0);
    const unconditional = claims.filter((c) => !claimIsConditional(c)).map((c) => c.getText().trim().slice(0, 80));
    expect(unconditional, "a literal verification claim must be the branch of its own computed condition").toEqual([]);
  });

  it("does not read Subscription.status, which is only ever written 'active'", () => {
    expect(accesses(SF, "t", "status").map((n) => n.getText()), "the tenant row must not carry Subscription.status").toEqual([]);
    const voided = collect(SF, ts.isVoidExpression).filter((v) => {
      const e = unwrap(v.expression);
      return ts.isIdentifier(e) && e.text === "status";
    });
    expect(voided.length, "a discarded field is still a plumbed field").toBe(0);
    expect(callsTo(SF, "subscriptionStanding").length).toBeGreaterThan(0);
  });

  it("no link is an anchor to nowhere", () => {
    const dead = elements.filter(deadAnchor).map((e) => e.getText().slice(0, 120));
    expect(dead, "an anchor that leads nowhere and does nothing is a dead control").toEqual([]);
  });

  it("the deployment badge is derived, not asserted", () => {
    expect(CODE, "PRODUCTION must come from apiEnv, not from a literal here").not.toContain("PRODUCTION");
    const rendered = renderedExpressions(SF).filter((e) => accesses(e, "apiEnv", "label").length > 0);
    expect(rendered.length, "the badge must render the resolved environment").toBeGreaterThan(0);
  });

  /**
   * Legitimate hits — a year, a version string, an id, a literal `"0"` — that a
   * digit-shaped check cannot tell apart from a fabricated figure by shape alone.
   * Keyed `file#component` (via `enclosingFunctionKey`, so a rename or a move that
   * changes the count fails loudly) with an EXACT count and a reason, the same
   * discipline `input-bounds-usage.test.ts` uses for `BOUNDS`. An entry nothing hits
   * any more, or a new hit inside an exempt component, is a rot check away from being
   * caught — see the next `it`.
   */
  const FIGURE_TEXT_ALLOWED: { key: string; count: number; reason: string }[] = [
    {
      key: "AdminConsole",
      count: 1,
      reason:
        "'Upcoming renewals (next 60 days)' section heading — a static label naming the fixed window the query already applies, not a rendered count; its two digits are a window ('60 days'), not a figure",
    },
  ];

  /** Every rendered figure-shaped site: bare text, a rendered expression, or a stat/tile's `value`. */
  function figureSites(): { key: string; text: string }[] {
    const sites: { key: string; text: string }[] = [];
    for (const t of renderedText(SF)) {
      if (isFabricatedFigureText(t.text)) sites.push({ key: enclosingFunctionKey(t.node), text: t.text });
    }
    for (const e of renderedExpressions(SF)) {
      if (literalFigure(e, imports)) sites.push({ key: enclosingFunctionKey(e), text: `{${e.getText()}}` });
    }
    for (const p of tileValueProperties(SF)) {
      if (literalFigure(p.initializer, imports)) {
        sites.push({ key: enclosingFunctionKey(p), text: p.getText().slice(0, 80) });
      }
    }
    return sites;
  }

  function figureCounts(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const { key } of figureSites()) counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }

  it("no count is a literal in the markup, or hardcoded into a stat/tile's value", () => {
    const texts = renderedText(SF);
    expect(texts.length, "no JSX text parsed").toBeGreaterThan(50);
    expect(tileValueProperties(SF).length, "no tile/stat value properties found — has the shape changed?").toBeGreaterThan(3);

    const allowed = new Map(FIGURE_TEXT_ALLOWED.map((a) => [a.key, a.count]));
    const counts = figureCounts();
    const offenders = [...counts]
      .filter(([key, n]) => allowed.get(key) !== n)
      .map(([key, n]) => `${key}: ${n} (allowed ${allowed.get(key) ?? 0})`);
    expect(offenders, "render a figure from data, or do not render it").toEqual([]);
  });

  it("does not let the figure allow-list rot: every entry still has exactly its count", () => {
    const counts = figureCounts();
    expect(FIGURE_TEXT_ALLOWED.filter((a) => counts.get(a.key) !== a.count)).toEqual([]);
  });

  it("no money is rendered in a currency the platform may not be using", () => {
    const jmd = collect(SF, (n): n is ts.Identifier => ts.isIdentifier(n) && n.text === "formatJmd");
    expect(jmd.length, "platform money must spend the configured currency").toBe(0);

    const calls = callsTo(SF, "formatPlatformMoney");
    expect(calls.length, "no formatPlatformMoney calls found — check the name").toBeGreaterThan(2);
    const hardcoded = calls.filter(hardcodedCurrency).map((c) => c.getText());
    expect(hardcoded, "pass the configured currency, not a static one").toEqual([]);
  });

  it("no save reports success on a value it dropped", () => {
    const offenders: string[] = [];
    for (const fn of ["savePricing", "saveRulepack"]) {
      const body = functionNamed(SF, fn);
      expect(body, `${fn} not found — has it been renamed?`).not.toBeNull();
      for (const n of coercesToAbsent(body!)) offenders.push(`${fn}: ${n.parent.getText().slice(0, 90)}`);
    }
    expect(offenders, "refuse the value and name the field instead of turning it into an omission").toEqual([]);

    // Every mutator this console can call — so a THIRD save form cannot appear unseen.
    const mutators = importBindings(SF)
      .filter((b) => b.from === "@/lib/api-client")
      .map((b) => b.imported)
      .filter((n) => /^(update|create|record|review|delete|promote|revoke|void|run|set)[A-Z]/.test(n));
    expect(mutators.length, "no api-client mutators found — check the import").toBeGreaterThan(5);
    expect(mutators).toEqual(expect.arrayContaining(["updateAdminPricing", "updateAdminRulePack"]));
    const pricingProblemDecl = functionDeclarationNamed(SF, "pricingProblem");
    expect(pricingProblemDecl, "pricingProblem not found — has it been renamed?").not.toBeNull();
    expect(
      callsTo(SF, "pricingProblem", { declaration: pricingProblemDecl! }).length,
      "the pricing save must run its validator",
    ).toBeGreaterThan(0);
    expect(
      callsTo(SF, "rulePackProblem", { moduleSpecifier: "@/lib/rulepack-patch", exportedName: "rulePackProblem" })
        .length,
      "the rule-pack save must run its validator",
    ).toBeGreaterThan(0);
  });

  // Two assertions were deleted earlier and are held elsewhere: the rule-pack payload
  // by the `RulePackPatch` class (a compile error), and the rate grid by
  // `statutory-grid.test.tsx`, which renders the console and counts inputs.

  it("nothing that looks clickable lacks a handler", () => {
    const inline = pointerCursors(SF)
      .map(hollowPointer)
      .filter((r): r is { el: Element; hollow: boolean } => r !== null);
    expect(inline.length, "no inline pointer cursors found at all").toBeGreaterThan(5);
    const hollow = inline.filter((r) => r.hollow).map((r) => r.el.getText().slice(0, 90));
    expect(hollow, "this element promises a click it cannot honour").toEqual([]);
  });
});

describe("the guards above cannot be walked past", () => {
  // Every bypass that defeated an earlier version, run through the SAME predicates.

  const firstElement = (code: string) => collect(snippet(`const x = ${code};`), isElement)[0]!;

  it("a dead anchor is caught however it is spelled", () => {
    for (const tag of [
      '<a href="#" onClick={(e) => e.preventDefault()}>TAJ</a>',
      '<a href="#" onClick={(e)=>e.preventDefault()}>TAJ</a>',
      '<a href="#" onClick={e => e.preventDefault()}>TAJ</a>',
      '<a href="#" onClick={(e: React.MouseEvent) => e.preventDefault()}>TAJ</a>',
      '<a href="#" onClick={(e) => { e.preventDefault(); }}>TAJ</a>',
      '<a href="#" onClick={() => void 0}>TAJ</a>',
      '<a onClick={(e) => e.preventDefault()} href="#">TAJ</a>',
      '<a href={"#"} onClick={(e) => e.preventDefault()}>TAJ</a>',
      '<a href="" onClick={(ev) => ev.stopPropagation()}>TAJ</a>',
      '<a href="javascript:void(0)">TAJ</a>',
      "<a>TAJ</a>",
    ]) {
      expect(deadAnchor(firstElement(tag)), tag).toBe(true);
    }
  });

  it("a working anchor is not caught", () => {
    for (const tag of [
      '<a href="#" onClick={(e) => { e.preventDefault(); go("tenants"); }}>View all</a>',
      '<a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a>',
      '<a href="https://www.jamaicatax.gov.jm/gct">TAJ</a>',
    ]) {
      expect(deadAnchor(firstElement(tag)), tag).toBe(false);
    }
    expect(deadAnchor(firstElement("<button onClick={go}>Go</button>"))).toBe(false);
  });

  const IMPORTS = 'import { CURRENCY_CODES, formatPlatformMoney } from "@jamquote/core";';
  const rendered = (prelude: string, child: string) => {
    const sf = snippet(`${IMPORTS}\n${prelude}\nfunction Comp({ q, needsReviewCount, regChanges }: any) { return <span>${child}</span>; }`);
    const names = new Set(importBindings(sf).map((b) => b.local));
    return {
      figure:
        renderedExpressions(sf).some((e) => literalFigure(e, names)) ||
        renderedText(sf).some((t) => isFabricatedFigureText(t.text)),
    };
  };

  it("a literal count is caught however it is written", () => {
    for (const [prelude, child] of [
      ["", "3"],
      ["", "\n  3\n"],
      ["", "{3}"],
      ["", "{+3}"],
      ["", '{"3"}'],
      ["", "{`3`}"],
      ["", "{1 + 2}"],
      ["", "{(3) as number}"],
      ["", '{String(3)}'],
      ["const N = 3;", "{N}"],
      ["let N = 3;", "{N}"],
      ["const C = { n: 3 };", "{C.n}"],
      ["const L = [1, 2, 3];", "{L.length}"],
    ]) {
      expect(rendered(prelude!, child!).figure, `${prelude} ${JSON.stringify(child)}`).toBe(true);
    }
  });

  it("a rendered expression from data or from an imported source is not a literal count", () => {
    for (const child of ["{needsReviewCount}", "{regChanges.length}", "3 waiting", "{String(q)}", "{CURRENCY_CODES.length}", '{" "}', '{"—"}']) {
      expect(rendered("", child).figure, child).toBe(false);
    }
  });

  it("a figure hidden in prose around it is caught, however the money is abbreviated — the sixth-generation bypass", () => {
    // The three exact spellings the auditor put back after the guard was written for
    // this: a bare JSX text child wrapping the fabricated total in prose, and a
    // shortened form. All three were green under a bare-digit-only text check.
    for (const child of [
      "Monthly recurring revenue $2,418,540",
      "J$2.4M",
    ]) {
      expect(rendered("", child).figure, child).toBe(true);
    }
    // A single digit, or a digit inside ordinary prose with no currency/percent
    // marker and no second digit, is not this class — it is the allow-listed
    // "years/versions/ids/0" territory, not prose hiding a total.
    expect(isFabricatedFigureText("Q1")).toBe(false);
    expect(isFabricatedFigureText("Page 3 of reports")).toBe(false);
    expect(isFabricatedFigureText("$2,418,540")).toBe(true);
    expect(isFabricatedFigureText("2418540")).toBe(true);
  });

  it("a fabricated figure assigned into a stat/tile's value is caught even though its render is a loop variable — the seventh-generation bypass", () => {
    const probe = snippet(
      [
        'const stats = [{ label: "MRR", value: "$2,418,540" }];',
        "function Comp() { return <span>{stats.map((s) => <b key={s.label}>{s.value}</b>)}</span>; }",
      ].join("\n"),
    );
    const names = new Set(importBindings(probe).map((b) => b.local));
    const hit = tileValueProperties(probe).filter((p) => literalFigure(p.initializer, names));
    expect(hit.length, "a value: property of an array element carrying a sibling label is a tile figure").toBe(1);

    // A `value:` property that is NOT part of an array-of-tiles shape is out of scope
    // for this site (it may still be caught as an ordinary rendered expression/text).
    const notATile = snippet('const config = { value: "$2,418,540" };');
    expect(tileValueProperties(notATile)).toHaveLength(0);

    // Data-derived and imported-root values in the same shape are not figures.
    const clean = snippet(
      'import { CURRENCY_CODES } from "@jamquote/core";\nconst stats = [{ label: "MRR", value: mrr }, { label: "Codes", value: CURRENCY_CODES.length }];',
    );
    const cleanNames = new Set(importBindings(clean).map((b) => b.local));
    expect(tileValueProperties(clean).filter((p) => literalFigure(p.initializer, cleanNames))).toHaveLength(0);
  });

  const currencyOf = (prelude: string, call: string) => {
    const sf = snippet(`${IMPORTS}\ntype CurrencyCode = string;\n${prelude}\nfunction R({ r, currency }: any) { return <div>{${call}}</div>; }`);
    const calls = callsTo(sf, "formatPlatformMoney");
    expect(calls.length, call).toBe(1);
    return hardcodedCurrency(calls[0]!);
  };

  it("a hardcoded currency is caught however it is spelled", () => {
    for (const [prelude, call] of [
      ["", 'formatPlatformMoney(r.amountCents, "JMD")'],
      ["", "formatPlatformMoney(r.amountCents, `JMD`)"],
      ["", 'formatPlatformMoney(Number(r.amountCents), "JMD")'],
      ["", "formatPlatformMoney(r.amountCents, CURRENCY_CODES[0])"],
      ['const JMD = "JMD";', "formatPlatformMoney(r.amountCents, JMD)"],
      ['let J = "JMD";', "formatPlatformMoney(r.amountCents, J)"],
      ["", 'formatPlatformMoney(r.amountCents, String("JMD") as CurrencyCode)'],
      ['const C = { jmd: "JMD" };', "formatPlatformMoney(r.amountCents, C.jmd)"],
      ["", "formatPlatformMoney(r.amountCents, undefined)"],
      ["", "formatPlatformMoney(r.amountCents)"],
    ]) {
      expect(currencyOf(prelude!, call!), `${prelude} ${call}`).toBe(true);
    }
  });

  it("a configured currency is not caught", () => {
    for (const call of ["formatPlatformMoney(r.amountCents, r.currency ?? currency)", "formatPlatformMoney(r.amountCents, currency)"]) {
      expect(currencyOf("", call), call).toBe(false);
    }
  });

  const claimsIn = (code: string) => {
    const sf = snippet(`function B({ p, c, screen }: any) { return ${code}; }`);
    return renderedClaims(sf).map(claimIsConditional);
  };

  it("a badge is not made conditional by a ternary in its style or a condition around the screen", () => {
    expect(claimsIn('<span style={{ marginLeft: c.label ? 4 : 0 }}><span style={v}>Verified ✓</span></span>')).toEqual([false]);
    expect(claimsIn('<div>{screen === "rules" && (<div><div><span>Verified ✓</span></div></div>)}</div>')).toEqual([false]);
    expect(claimsIn("<td>{true ? <span>Verified ✓</span> : null}</td>")).toEqual([false]);
    expect(claimsIn('<td>{"Verified ✓"}</td>')).toEqual([false]);
  });

  it("a badge IS conditional when the ternary is its own", () => {
    expect(claimsIn("<td>{p.verified ? <span>Verified ✓</span> : <span>Unverified</span>}</td>")).toEqual([true]);
    expect(claimsIn('<td>{p.verified ? `Verified ${p.at}` : "Unverified"}</td>')).toEqual([true]);
    expect(claimsIn("<td>{p.verified && <span>Verified</span>}</td>")).toEqual([true]);
    // A label naming a date field is not a claim at all.
    expect(claimsIn('<label>Verified as of<input type="date" /></label>')).toEqual([]);
  });

  it("a coercion to absent is caught however it is spelled", () => {
    for (const body of [
      "const payload = { rate: x || undefined };",
      "const payload = { rate: x ?? void 0 };",
      'const rate = x === "" ? undefined : Number(x); send({ rate });',
      "send({ rate: undefined });",
      "const rate = (x || undefined) as number;",
    ]) {
      const sf = snippet(`async function savePricing(x: string) { ${body} }`);
      expect(coercesToAbsent(functionNamed(sf, "savePricing")!).length, body).toBeGreaterThan(0);
    }
    const clean = snippet("async function savePricing(x: string) { let y: string | undefined; if (x === undefined) return; send({ rate: Number(x) }); }");
    expect(coercesToAbsent(functionNamed(clean, "savePricing")!)).toEqual([]);
  });

  const pointerIn = (code: string) =>
    pointerCursors(snippet(`const x = ${code};`))
      .map(hollowPointer)
      .filter((r) => r !== null)
      .map((r) => r!.hollow);

  it("a pointer cursor is not excused by a disabled element nearby or an empty label", () => {
    expect(pointerIn('<>\n<input disabled={true} value="" readOnly />\n<div style={{ padding: 7, cursor: "pointer" }}>Past due (3)</div></>')).toEqual([true]);
    expect(pointerIn('<div style={{ cursor: busy ? "default" : "pointer" }}>x</div>')).toEqual([true]);
    expect(pointerIn('<label style={{ cursor: "pointer" }}>Nothing inside</label>')).toEqual([true]);
  });

  it("a pointer cursor IS excused by a handler or a control on its own element", () => {
    expect(pointerIn('<button style={{ cursor: "pointer" }} onClick={go}>Go</button>')).toEqual([false]);
    expect(pointerIn('<tr onClick={go} style={{\n cursor: "pointer",\n }}><td /></tr>')).toEqual([false]);
    expect(pointerIn('<label style={{ cursor: "pointer" }}><input type="checkbox" /> A</label>')).toEqual([false]);
    // A style factory outside any element is not this guard's business.
    expect(pointerIn('({ cursor: "pointer" })')).toEqual([]);
  });

  it("a window word is caught however it is spelled", () => {
    const labels = metricLabels(snippet('const a = [{ label: "This month" }, { "label": `Applied (YTD)` }, { label: `Signups today ${n}` }];\nconst b = <Tile label="Revenue monthly" />;'));
    expect(labels.length).toBe(4);
    expect(labels.every((l) => WINDOW_WORD.test(l))).toBe(true);
    expect(WINDOW_WORD.test("Quotes created (all time)")).toBe(false);
  });
});
