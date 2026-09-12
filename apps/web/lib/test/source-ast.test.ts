import { describe, expect, it } from "vitest";
import ts from "typescript";
import {
  analyseStatic,
  attributeValue,
  callsTo,
  jsxAttributes,
  parseSource,
  renderedExpressions,
} from "./source-ast";

/**
 * The parser every apps/web source guard spends.
 *
 * Each case below that is described as a bypass DID defeat an earlier text-matching
 * guard in this repo. They are here so the parser those guards now share cannot regress
 * on any of them — the lesson of eleven generations is that a guard's matcher is where
 * its defect lives, and a matcher nobody tests is a matcher nobody can trust.
 */

/** The expression in `const probe = <expr>;`, parsed in a file carrying `prelude`. */
function probe(expr: string, prelude = ""): ts.Expression {
  const sf = parseSource("probe.tsx", `${prelude}\nconst __probe = ${expr};\n`);
  const decl = sf.statements
    .filter(ts.isVariableStatement)
    .flatMap((s) => [...s.declarationList.declarations])
    .find((d) => ts.isIdentifier(d.name) && d.name.text === "__probe");
  if (!decl?.initializer) throw new Error(`probe did not parse: ${expr}`);
  return decl.initializer;
}

const IMPORTS = `import { CURRENCY_CODES, BOUNDS, formatPlatformMoney } from "@jamquote/core";`;

describe("analyseStatic: values fixed by constants", () => {
  it.each([
    ["a digit", "3"],
    ["a unary plus — the `{+3}` bypass", "+3"],
    ["a unary minus", "-3"],
    ["a quoted digit — the `{\"3\"}` bypass", '"3"'],
    ["a template with no substitution", "`3`"],
    ["parentheses", "(3)"],
    ["arithmetic on literals", "1 + 2"],
    ["a cast — `\"JMD\" as CurrencyCode`", '"JMD" as CurrencyCode'],
    ["a non-null assertion", '"JMD"!'],
    ["a global coercion — the `String(\"JMD\")` bypass", 'String("JMD")'],
    ["a global coercion behind a cast", 'String("JMD") as CurrencyCode'],
    ["a ternary over literals", 'true ? "JMD" : "USD"'],
    ["undefined", "undefined"],
  ])("%s", (_label, expr) => {
    expect(analyseStatic(probe(expr)).static).toBe(true);
  });

  it("an indexed import — the `CURRENCY_CODES[0]` bypass", () => {
    const result = analyseStatic(probe("CURRENCY_CODES[0]", IMPORTS));
    expect(result.static).toBe(true);
    expect([...result.roots]).toEqual(["CURRENCY_CODES"]);
  });

  it("a property read of a local const object — the `C.jmd` bypass", () => {
    expect(analyseStatic(probe("C.jmd", 'const C = { jmd: "JMD" };')).static).toBe(true);
  });

  it("a const bound to a literal — the `const JMD = \"JMD\"` bypass", () => {
    const result = analyseStatic(probe("JMD", 'const JMD = "JMD";'));
    expect(result.static).toBe(true);
    expect(result.roots.has("JMD")).toBe(true);
  });

  it("a let that is never reassigned — the `let` bypass", () => {
    expect(analyseStatic(probe("X", 'let X = "JMD";')).static).toBe(true);
  });

  it("a nested read of an import, reporting it as the root", () => {
    // `BOUNDS.discountPct.min` is static AND from the approved source; the roots are how
    // a bounds guard tells it apart from a hand-typed `0`.
    const result = analyseStatic(probe("BOUNDS.discountPct.min", IMPORTS));
    expect(result.static).toBe(true);
    expect([...result.roots]).toEqual(["BOUNDS"]);
  });

  it("a pure literal has no roots", () => {
    expect([...analyseStatic(probe("0")).roots]).toEqual([]);
  });
});

describe("analyseStatic: values computed from data", () => {
  it.each([
    ["a property of a parameter", "r.currency", "function f(r) {}"],
    ["optional chaining on state", "pricing?.currency", "let pricing = load();"],
    ["nullish coalescing over data", "r.currency ?? currency", "function f(r, currency) {}"],
    ["a parameter", "code", "function f(code) {}"],
    ["a destructured name", "currency", "const { currency } = props;"],
    ["a call to a function declared in the file", "money(5)", "function money(c) { return c; }"],
    ["a call to an imported function", "formatPlatformMoney(5, 'JMD')", IMPORTS],
    ["an undeclared name", "somethingUnknown", ""],
    // The class the first version got wrong: it read every undeclared function call as
    // a pure global, so these were "constants".
    ["a call to an undeclared function", "load()", ""],
    ["an impure global — `fetch(\"/api\")`", 'fetch("/api")', ""],
    ["a global method call", "Date.now()", ""],
  ])("%s", (_label, expr, prelude) => {
    expect(analyseStatic(probe(expr, prelude)).static).toBe(false);
  });

  it("a let that IS reassigned", () => {
    expect(analyseStatic(probe("X", 'let X = "JMD"; X = load();')).static).toBe(false);
  });

  it("a file's own `String` is not the global conversion", () => {
    const prelude = "function String(v) { return fetchSomething(v); }";
    expect(analyseStatic(probe('String("JMD")', prelude)).static).toBe(false);
  });

  it("a name declared twice, once from data, resolves to data", () => {
    // Ambiguity resolves toward data: failing to recognise a constant is recoverable,
    // excusing a computed value is the defect.
    const prelude = 'const code = "JMD"; function f(code) { return code; }';
    expect(analyseStatic(probe("code", prelude)).static).toBe(false);
  });

  it("an import on its own, unread", () => {
    // A bare imported binding could be a function or a mutable object.
    expect(analyseStatic(probe("BOUNDS", IMPORTS)).static).toBe(false);
  });

  it("a self-referencing initializer does not loop and is not a constant", () => {
    expect(analyseStatic(probe("A", "const A = A;")).static).toBe(false);
  });
});

describe("callsTo", () => {
  const sf = parseSource(
    "calls.tsx",
    [
      "formatPlatformMoney(1, a);",
      "formatPlatformMoney(Number(r.amountCents), \"JMD\");", // the paren-crossing bypass
      "x.formatPlatformMoney(2, b);",
      "x?.formatPlatformMoney(3, c);",
      "(formatPlatformMoney)(4, d);",
      "formatPlatformMoney(",
      "  5,",
      "  e,",
      ");",
      "notFormatPlatformMoney(6, f);",
    ].join("\n"),
  );

  it("finds every call however it is written, and no near-miss", () => {
    expect(callsTo(sf, "formatPlatformMoney")).toHaveLength(6);
  });

  it("returns real argument nodes, so a call inside an argument is not a boundary", () => {
    const second = callsTo(sf, "formatPlatformMoney")[1]!;
    expect(second.arguments).toHaveLength(2);
    expect(analyseStatic(second.arguments[1]!).static).toBe(true);
  });
});

describe("jsxAttributes and attributeValue", () => {
  const sf = parseSource(
    "attrs.tsx",
    [
      'import { BOUNDS } from "@jamquote/core";',
      'const a = <input min={0} max="100" />;',
      'const b = <input min={"0"} />;', // the quoted-brace bypass
      "const c = <input min={BOUNDS.discountPct.min} />;",
      "const d = <input disabled />;",
    ].join("\n"),
  );

  it("finds the attribute on every element", () => {
    expect(jsxAttributes(sf, "min")).toHaveLength(3);
  });

  it("reads a quoted value, a braced value and a braced string alike", () => {
    const values = jsxAttributes(sf, "min").map((a) => attributeValue(a)!);
    expect(values.map((v) => analyseStatic(v).static)).toEqual([true, true, true]);
    // All three are constants. What separates a hand-typed bound from the approved one
    // is the ROOT: the first two come from nowhere, the third from BOUNDS — and a bounds
    // guard reads exactly that. This test first expected three empty root sets and never
    // imported BOUNDS, so it asserted the wrong distinction twice over.
    expect(values.map((v) => [...analyseStatic(v).roots])).toEqual([[], [], ["BOUNDS"]]);
  });

  it("returns null for a bare boolean attribute", () => {
    expect(attributeValue(jsxAttributes(sf, "disabled")[0]!)).toBeNull();
  });
});

describe("renderedExpressions", () => {
  const sf = parseSource(
    "render.tsx",
    'const x = <div title={t}><span>{+3}</span><b>{count}</b>{"3"}</div>;',
  );

  it("returns content expressions and never attribute values", () => {
    const rendered = renderedExpressions(sf);
    expect(rendered).toHaveLength(3);
    expect(rendered.filter((e) => analyseStatic(e).static)).toHaveLength(2);
  });
});
